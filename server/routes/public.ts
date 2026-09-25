import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { Hono } from "hono";
import { circleCreateSchema, circleUpdateSchema } from "../../shared/schemas";
import { circles, leads } from "../db/schema";
import type { AppEnv, Ctx } from "../lib/context";
import { randomToken, safeEqualHex, sha256 } from "../lib/crypto";
import { forbidden, notFound, parseBody } from "../lib/http";
import { rateLimit } from "../lib/rate-limit";
import { organiserLinkEmail, recoveryEmail } from "../email/templates";

/**
 * Free, unauthenticated growth tools. The organiser proves ownership of a
 * circle with an edit token (returned once, stored hashed); everyone else only
 * gets the read-only share link.
 */
export const publicRoutes = new Hono<AppEnv>();

export const LEAD_SOURCE_CIRCLE = "merry-go-round";
const limitCreate = rateLimit({ windowMs: 60 * 60_000, max: 10, key: "circle-create" });
const limitWrite = rateLimit({ windowMs: 60_000, max: 60, key: "circle-write" });
const limitRecover = rateLimit({ windowMs: 60 * 60_000, max: 5, key: "circle-recover" });
const MAX_EXTRA_TOKENS = 5;

function slug() {
  return randomToken(8).replace(/[^A-Za-z0-9]/g, "").slice(0, 10) || randomToken(6);
}

async function loadCircle(c: Ctx) {
  const [row] = await c.get("deps").db.select().from(circles).where(eq(circles.slug, c.req.param("slug") ?? ""));
  if (!row) throw notFound("Circle");
  return row;
}

function isEditor(c: Ctx, row: typeof circles.$inferSelect) {
  const token = c.req.header("x-edit-token");
  if (!token) return false;
  const hash = sha256(token);
  return [row.editTokenHash, ...row.extraTokenHashes].some((h) => safeEqualHex(hash, h));
}

/** Links always use the configured APP_URL — never the request's Host header, which a caller controls. */
function links(c: Ctx, slug: string, token: string) {
  const base = c.get("deps").config.appUrl;
  return { shareUrl: `${base}/c/${slug}`, ownerUrl: `${base}/c/${slug}#edit=${token}` };
}

function view(row: typeof circles.$inferSelect, canEdit: boolean) {
  return { slug: row.slug, organizerName: row.organizerName, circle: row.data, payments: row.payments, createdAt: row.createdAt, updatedAt: row.updatedAt, canEdit };
}

publicRoutes.post("/circles", limitCreate, async (c) => {
  const input = await parseBody(c, circleCreateSchema);
  const { db } = c.get("deps");
  const token = randomToken();
  const meta = { circleName: input.circle.name, members: input.circle.members.length, currency: input.circle.currency, amountMinor: input.circle.amountMinor, frequency: input.circle.frequency };

  const row = await db.transaction(async (tx) => {
    const [lead] = await tx
      .insert(leads)
      .values({ email: input.organizer.email, name: input.organizer.name, phone: input.organizer.phone ?? null, source: LEAD_SOURCE_CIRCLE, marketingConsent: input.organizer.marketingConsent, meta })
      .onConflictDoUpdate({
        target: [leads.email, leads.source],
        set: {
          name: input.organizer.name,
          phone: sql`coalesce(excluded.phone, ${leads.phone})`,
          // Consent is only ever upgraded here; withdrawing it is an explicit action elsewhere.
          marketingConsent: sql`${leads.marketingConsent} or excluded.marketing_consent`,
          meta,
          lastSeenAt: new Date(),
        },
      })
      .returning({ id: leads.id });
    const [created] = await tx
      .insert(circles)
      .values({ slug: slug(), editTokenHash: sha256(token), leadId: lead.id, organizerName: input.organizer.name, data: input.circle })
      .returning();
    return created;
  });

  // Email the organiser their links. A mail failure must not lose the circle:
  // the page still shows the organiser link, and "email me my link" can retry later.
  let emailSent = false;
  try {
    const mail = organiserLinkEmail({ organizerName: input.organizer.name, circle: input.circle, appUrl: c.get("deps").config.appUrl, ...links(c, row.slug, token) });
    await c.get("deps").mailer.send({ to: input.organizer.email, tag: "circle-organiser-link", ...mail });
    emailSent = true;
  } catch (err) {
    console.error("[mail] organiser link email failed:", (err as Error).message);
  }

  return c.json({ ...view(row, true), editToken: token, emailSent }, 201);
});

/**
 * "Email me my organiser link". Only hashes are stored, so existing links can't be
 * re-sent; each matching circle gets a fresh additional token instead (old links
 * keep working). The response is identical whether or not the email is known, so
 * this can't be used to discover who has created circles.
 */
publicRoutes.post("/circles/recover", limitRecover, async (c) => {
  const { email, slug } = await parseBody(c, z.object({ email: z.string().trim().toLowerCase().email().max(254), slug: z.string().max(40).optional() }));
  const { db, mailer } = c.get("deps");
  const rows = await db
    .select({ circle: circles })
    .from(circles)
    .innerJoin(leads, eq(leads.id, circles.leadId))
    .where(and(eq(leads.email, email), eq(leads.source, LEAD_SOURCE_CIRCLE), slug ? eq(circles.slug, slug) : undefined))
    .orderBy(desc(circles.createdAt))
    .limit(10);

  if (rows.length) {
    const issued: { name: string; ownerUrl: string; shareUrl: string }[] = [];
    for (const { circle } of rows) {
      const token = randomToken();
      const extra = [...circle.extraTokenHashes, sha256(token)].slice(-MAX_EXTRA_TOKENS);
      await db.update(circles).set({ extraTokenHashes: extra }).where(eq(circles.id, circle.id));
      issued.push({ name: circle.data.name, ...links(c, circle.slug, token) });
    }
    try {
      await mailer.send({ to: email, tag: "circle-recovery", ...recoveryEmail({ links: issued }) });
    } catch (err) {
      console.error("[mail] recovery email failed:", (err as Error).message);
    }
  }
  return c.json({ ok: true, message: "If that email organises any circles, we've just sent the links. Check your inbox (and spam folder)." }, 202);
});

publicRoutes.get("/circles/:slug", async (c) => {
  const row = await loadCircle(c);
  const canEdit = isEditor(c, row);
  if (!canEdit) {
    // Best-effort view counter; never block the response on it.
    c.get("deps").db.update(circles).set({ views: sql`${circles.views} + 1` }).where(eq(circles.id, row.id)).catch(() => {});
  }
  return c.json(view(row, canEdit));
});

publicRoutes.patch("/circles/:slug", limitWrite, async (c) => {
  const row = await loadCircle(c);
  if (!isEditor(c, row)) throw forbidden("Only the organiser can change this circle");
  const input = await parseBody(c, circleUpdateSchema);
  const data = input.circle ?? row.data;
  const ids = new Set(data.members.map((m) => m.id));
  const source = input.payments ?? row.payments;
  // Drop payments for rounds or members that no longer exist.
  const payments = Object.fromEntries(
    Object.entries(source)
      .filter(([round]) => Number(round) < data.members.length)
      .map(([round, paid]) => [round, [...new Set(paid.filter((id) => ids.has(id)))]]),
  );
  const [updated] = await c.get("deps").db.update(circles).set({ data, payments, updatedAt: new Date() }).where(eq(circles.id, row.id)).returning();
  return c.json(view(updated, true));
});
