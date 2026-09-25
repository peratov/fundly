import { and, asc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { MEMBER_STATUSES, OUTSTANDING_LOAN_STATUSES, ROLES, STANDINGS } from "../../shared/enums";
import { formatMoney } from "../../shared/money";
import { formatPeriod } from "../../shared/period";
import { listQuerySchema, memberCreateSchema, memberUpdateSchema, outreachSchema } from "../../shared/schemas";
import { claims, contributions, invites, memberships, shareEntries } from "../db/schema";
import { requirePerm } from "../lib/auth";
import { actorOf, type AppEnv, type Ctx, today } from "../lib/context";
import { randomToken, sha256 } from "../lib/crypto";
import { conflict, forbidden, notFound, paged, parseBody, parseQuery, unprocessable } from "../lib/http";
import { audit, nextRef } from "../lib/records";
import { loanView } from "../services/loans";
import { memberSnapshot } from "../services/members";

export const memberRoutes = new Hono<AppEnv>();

function canSee(c: Ctx, membershipId: string) {
  if (c.get("membership").id === membershipId) return;
  requirePerm(c, "members:read");
}

memberRoutes.get("/", async (c) => {
  requirePerm(c, "members:read");
  const q = parseQuery(c, listQuerySchema.extend({ standing: z.enum(STANDINGS).optional(), status: z.enum(MEMBER_STATUSES).default("active"), role: z.enum(ROLES).optional() }));
  const tenant = c.get("tenant");
  const { db } = c.get("deps");

  const conds: SQL[] = [eq(memberships.tenantId, tenant.id), eq(memberships.status, q.status)];
  if (q.standing) conds.push(eq(memberships.standing, q.standing));
  if (q.role) conds.push(sql`${q.role} = any(${memberships.roles})`);
  if (q.q) conds.push(or(ilike(memberships.name, `%${q.q}%`), ilike(memberships.memberNo, `%${q.q}%`), ilike(memberships.email, `%${q.q}%`), ilike(memberships.phone, `%${q.q}%`))!);
  const where = and(...conds);

  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(memberships).where(where);
  const rows = await db
    .select()
    .from(memberships)
    .where(where)
    .orderBy(asc(memberships.name))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);

  // Aggregate balances only for the members on this page.
  const ids = rows.map((r) => r.id);
  const savings = ids.length
    ? await db
        .select({ id: contributions.membershipId, savings: sql<string>`sum(${contributions.amountMinor} - ${contributions.premiumMinor})`, last: sql<string>`max(${contributions.period}) filter (where ${contributions.status} <> 'missed')` })
        .from(contributions)
        .where(and(eq(contributions.tenantId, tenant.id), inArray(contributions.membershipId, ids)))
        .groupBy(contributions.membershipId)
    : [];
  const shares = ids.length
    ? await db
        .select({ id: shareEntries.membershipId, micro: sql<string>`sum(${shareEntries.microShares})` })
        .from(shareEntries)
        .where(and(eq(shareEntries.tenantId, tenant.id), inArray(shareEntries.membershipId, ids)))
        .groupBy(shareEntries.membershipId)
    : [];
  const byId = new Map(savings.map((s) => [s.id, s]));
  const sharesById = new Map(shares.map((s) => [s.id, Number(s.micro)]));

  return c.json(
    paged(
      rows.map((m) => ({
        ...m,
        hasLogin: !!m.userId,
        savingsMinor: Number(byId.get(m.id)?.savings ?? 0),
        lastPaidPeriod: byId.get(m.id)?.last ?? null,
        microShares: sharesById.get(m.id) ?? 0,
      })),
      total,
      q.page,
      q.pageSize,
    ),
  );
});

memberRoutes.post("/", async (c) => {
  requirePerm(c, "members:write");
  const input = await parseBody(c, memberCreateSchema);
  const tenant = c.get("tenant");
  const { db } = c.get("deps");
  if (input.roles.some((r) => r !== "member") && !c.get("perms").has("roles:write")) {
    throw forbidden("Only the fund owner can assign roles");
  }
  const pkgId = input.welfarePackageId ?? tenant.settings.defaultWelfarePackageId;
  if (!tenant.settings.welfarePackages.some((p) => p.id === pkgId)) throw unprocessable("Unknown welfare package");

  const created = await db.transaction(async (tx) => {
    if (input.email) {
      const [dupe] = await tx.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.tenantId, tenant.id), eq(memberships.email, input.email)));
      if (dupe) throw conflict("A member with this email already exists");
    }
    const memberNo = input.memberNo || (await nextRef(tx, tenant.id, "member", "M"));
    const [m] = await tx
      .insert(memberships)
      .values({
        tenantId: tenant.id,
        memberNo,
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        occupation: input.occupation ?? null,
        joinedOn: input.joinedOn,
        roles: [...new Set(["member" as const, ...input.roles])],
        welfarePackageId: pkgId,
        attendancePct: input.attendancePct,
        nextOfKin: input.nextOfKin ?? null,
      })
      .onConflictDoNothing()
      .returning();
    if (!m) throw conflict(`Member number ${memberNo} is already in use`);
    await audit(tx, tenant.id, actorOf(c), { action: "member.created", entityType: "member", entityId: m.id, summary: `Registered ${m.name} (${m.memberNo})` });
    return m;
  });

  const invite = input.sendInvite && created.email ? await createInvite(c, created.id) : null;
  return c.json({ member: created, invite }, 201);
});

memberRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  canSee(c, id);
  const tenant = c.get("tenant");
  const { db, clock } = c.get("deps");
  const snap = await memberSnapshot(db, tenant, id, clock.now());
  const claimRows = await db.select().from(claims).where(and(eq(claims.tenantId, tenant.id), eq(claims.membershipId, id))).orderBy(sql`${claims.createdAt} desc`);
  const t = today(c);
  return c.json({ ...snap, loans: snap.loans.map((l) => loanView(l, t)), claims: claimRows, hasLogin: !!snap.member.userId });
});

memberRoutes.patch("/:id", async (c) => {
  requirePerm(c, "members:write");
  const input = await parseBody(c, memberUpdateSchema);
  const id = c.req.param("id");
  const tenant = c.get("tenant");
  const { db } = c.get("deps");

  const updated = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(memberships).where(and(eq(memberships.tenantId, tenant.id), eq(memberships.id, id))).for("update");
    if (!before) throw notFound("Member");
    if (input.roles) {
      requirePerm(c, "roles:write");
      input.roles = [...new Set(["member" as const, ...input.roles])];
      if (before.roles.includes("owner") && !input.roles.includes("owner")) {
        const owners = await tx.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.tenantId, tenant.id), sql`'owner' = any(${memberships.roles})`, eq(memberships.status, "active")));
        if (owners.length <= 1) throw unprocessable("A fund must keep at least one owner");
      }
    }
    if (input.welfarePackageId && !tenant.settings.welfarePackages.some((p) => p.id === input.welfarePackageId)) throw unprocessable("Unknown welfare package");
    if (input.email && input.email !== before.email) {
      const [dupe] = await tx.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.tenantId, tenant.id), eq(memberships.email, input.email)));
      if (dupe) throw conflict("A member with this email already exists");
    }
    const [m] = await tx.update(memberships).set(input).where(eq(memberships.id, id)).returning();
    const changed = Object.keys(input).filter((k) => JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify((input as Record<string, unknown>)[k]));
    if (changed.length) {
      await audit(tx, tenant.id, actorOf(c), {
        action: "member.updated",
        entityType: "member",
        entityId: id,
        summary: `Updated ${m.name}: ${changed.join(", ")}`,
        data: Object.fromEntries(changed.map((k) => [k, { from: (before as Record<string, unknown>)[k], to: (input as Record<string, unknown>)[k] }])),
      });
    }
    return m;
  });
  return c.json(updated);
});

memberRoutes.post("/:id/exit", async (c) => {
  requirePerm(c, "members:write");
  const id = c.req.param("id");
  const tenant = c.get("tenant");
  const { db, clock } = c.get("deps");
  const snap = await memberSnapshot(db, tenant, id, clock.now());
  if (snap.member.status !== "active") throw conflict("This member has already exited");
  if (snap.loans.some((l) => OUTSTANDING_LOAN_STATUSES.includes(l.status))) throw unprocessable("Member has an outstanding loan. Settle or write it off first.");
  if (snap.loans.some((l) => l.status === "pending_committee" || l.status === "pending_manager")) throw unprocessable("Member has a loan application in review. Decline it before they exit.");
  if (snap.member.roles.includes("owner")) throw unprocessable("Transfer ownership before removing the owner");
  await db.transaction(async (tx) => {
    // Financial history is kept for the books; the member is only deactivated.
    await tx.update(memberships).set({ status: "exited" }).where(eq(memberships.id, id));
    await tx.delete(invites).where(and(eq(invites.membershipId, id), isNull(invites.acceptedAt)));
    await audit(tx, tenant.id, actorOf(c), {
      action: "member.exited",
      entityType: "member",
      entityId: id,
      summary: `${snap.member.name} exited the fund with savings of ${formatMoney(snap.totals.savingsMinor, tenant.currency)}`,
    });
  });
  return c.json({ ok: true });
});

async function createInvite(c: Ctx, membershipId: string) {
  const tenant = c.get("tenant");
  const { db, config, clock } = c.get("deps");
  const [m] = await db.select().from(memberships).where(and(eq(memberships.tenantId, tenant.id), eq(memberships.id, membershipId)));
  if (!m) throw notFound("Member");
  if (!m.email) throw unprocessable("Add an email address before inviting this member");
  if (m.userId) throw conflict("This member already has a login");
  const token = randomToken();
  await db.transaction(async (tx) => {
    await tx.insert(invites).values({ tokenHash: sha256(token), tenantId: tenant.id, membershipId, email: m.email!, expiresAt: new Date(clock.now().getTime() + 14 * 86_400_000) });
    await audit(tx, tenant.id, actorOf(c), { action: "member.invited", entityType: "member", entityId: membershipId, summary: `Invitation created for ${m.name} (${m.email})` });
  });
  return { url: `${config.appUrl}/invite/${token}`, email: m.email, expiresInDays: 14 };
}

memberRoutes.post("/:id/invite", async (c) => {
  requirePerm(c, "members:write");
  return c.json(await createInvite(c, c.req.param("id")));
});

memberRoutes.post("/:id/assessment", async (c) => {
  requirePerm(c, "loans:read", "members:write");
  const tenant = c.get("tenant");
  const { db, clock, assistant } = c.get("deps");
  const snap = await memberSnapshot(db, tenant, c.req.param("id"), clock.now());
  const result = await assistant.assess({
    memberName: snap.member.name,
    fundName: tenant.name,
    currency: tenant.currency,
    standing: snap.member.standing,
    score: snap.score,
    eligibility: snap.eligibility,
    totalSavingsMinor: snap.totals.savingsMinor,
    openLoanBalanceMinor: snap.totals.loanBalanceMinor,
  });
  return c.json(result);
});

memberRoutes.post("/:id/outreach", async (c) => {
  requirePerm(c, "members:write");
  const input = await parseBody(c, outreachSchema);
  const tenant = c.get("tenant");
  const { db, clock, assistant } = c.get("deps");
  const snap = await memberSnapshot(db, tenant, c.req.param("id"), clock.now());
  const money = (m: number) => formatMoney(m, tenant.currency);
  const missed = snap.contributions.filter((x) => x.status === "missed").slice(-6).map((x) => formatPeriod(x.period));
  const facts = [
    input.purpose === "contribution_reminder" && missed.length ? `Unpaid months: ${missed.join(", ")}` : "",
    input.purpose === "contribution_reminder" ? `Monthly minimum: ${money(tenant.settings.minContributionMinor)}` : "",
    input.purpose === "loan_reminder" && snap.totals.loanBalanceMinor ? `Outstanding loan balance: ${money(snap.totals.loanBalanceMinor)}` : "",
    input.purpose === "welfare_benefits" ? `Welfare package: ${snap.welfare.package.name}` : "",
  ].filter(Boolean);
  return c.json(await assistant.draftOutreach({ ...input, memberName: snap.member.name.split(" ")[0], fundName: tenant.shortName || tenant.name, currency: tenant.currency, facts }));
});
