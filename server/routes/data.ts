import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { z } from "zod";
import { CONTRIBUTION_STATUSES, type ContributionStatus } from "../../shared/enums";
import { toMinor } from "../../shared/money";
import { PERIOD_RE } from "../../shared/period";
import { auditEvents, claims, contributions, journalEntries, journalLines, loans, memberships, payments } from "../db/schema";
import { requirePerm } from "../lib/auth";
import { actorOf, type AppEnv, type Ctx, today } from "../lib/context";
import { parseCsv, toCsvLine } from "../lib/csv";
import { AppError, badRequest, parseBody } from "../lib/http";
import { audit, nextRef } from "../lib/records";
import { recordContribution } from "../services/savings";

export const dataRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------- CSV export (streamed in pages)

type Exporter = { header: string[]; page: (c: Ctx, offset: number, limit: number) => Promise<unknown[][]> };
const PAGE = 2000;

const exporters: Record<string, Exporter> = {
  members: {
    header: ["member_no", "name", "email", "phone", "occupation", "joined_on", "roles", "standing", "status", "welfare_package", "attendance_pct"],
    page: async (c, offset, limit) =>
      (await c.get("deps").db.select().from(memberships).where(eq(memberships.tenantId, c.get("tenant").id)).orderBy(asc(memberships.memberNo)).limit(limit).offset(offset)).map((m) => [
        m.memberNo, m.name, m.email, m.phone, m.occupation, m.joinedOn, m.roles.join("|"), m.standing, m.status, m.welfarePackageId, m.attendancePct,
      ]),
  },
  contributions: {
    header: ["member_no", "name", "period", "amount", "welfare_premium", "status", "paid_on", "method"],
    page: async (c, offset, limit) =>
      (
        await c.get("deps").db
          .select({ c: contributions, no: memberships.memberNo, name: memberships.name })
          .from(contributions)
          .innerJoin(memberships, eq(memberships.id, contributions.membershipId))
          .where(eq(contributions.tenantId, c.get("tenant").id))
          .orderBy(asc(contributions.period), asc(memberships.memberNo))
          .limit(limit)
          .offset(offset)
      ).map((r) => [r.no, r.name, r.c.period, r.c.amountMinor / 100, r.c.premiumMinor / 100, r.c.status, r.c.paidOn, r.c.method]),
  },
  loans: {
    header: ["ref", "member_no", "name", "product", "principal", "interest", "penalties", "paid_principal", "paid_interest", "paid_penalty", "rate_pct", "term_months", "status", "disbursed_on", "closed_on", "purpose"],
    page: async (c, offset, limit) =>
      (
        await c.get("deps").db
          .select({ l: loans, no: memberships.memberNo, name: memberships.name })
          .from(loans)
          .innerJoin(memberships, eq(memberships.id, loans.membershipId))
          .where(eq(loans.tenantId, c.get("tenant").id))
          .orderBy(asc(loans.ref))
          .limit(limit)
          .offset(offset)
      ).map(({ l, no, name }) => [
        l.ref, no, name, l.productName, l.principalMinor / 100, l.interestMinor / 100, l.penaltiesMinor / 100, l.paidPrincipalMinor / 100, l.paidInterestMinor / 100, l.paidPenaltyMinor / 100, l.rateBps / 100, l.termMonths, l.status, l.disbursedOn, l.closedOn, l.purpose,
      ]),
  },
  claims: {
    header: ["ref", "member_no", "name", "type", "requested", "approved", "status", "filed_at", "decided_at", "description"],
    page: async (c, offset, limit) =>
      (
        await c.get("deps").db
          .select({ x: claims, no: memberships.memberNo, name: memberships.name })
          .from(claims)
          .innerJoin(memberships, eq(memberships.id, claims.membershipId))
          .where(eq(claims.tenantId, c.get("tenant").id))
          .orderBy(asc(claims.ref))
          .limit(limit)
          .offset(offset)
      ).map(({ x, no, name }) => [x.ref, no, name, x.type, x.amountRequestedMinor / 100, x.amountApprovedMinor / 100, x.status, x.createdAt, x.decidedAt, x.description]),
  },
  payments: {
    header: ["reference", "member", "purpose", "amount", "currency", "network", "phone", "status", "note", "created_at", "completed_at"],
    page: async (c, offset, limit) =>
      (
        await c.get("deps").db
          .select({ p: payments, name: memberships.name })
          .from(payments)
          .innerJoin(memberships, eq(memberships.id, payments.membershipId))
          .where(eq(payments.tenantId, c.get("tenant").id))
          .orderBy(asc(payments.createdAt))
          .limit(limit)
          .offset(offset)
      ).map(({ p, name }) => [p.providerRef, name, p.purpose, p.amountMinor / 100, p.currency, p.network, p.phone, p.status, p.failureReason, p.createdAt, p.completedAt]),
  },
  journal: {
    header: ["date", "entry_id", "memo", "source", "account", "debit", "credit"],
    page: async (c, offset, limit) =>
      (
        await c.get("deps").db
          .select({ e: journalEntries, l: journalLines })
          .from(journalLines)
          .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
          .where(eq(journalLines.tenantId, c.get("tenant").id))
          .orderBy(asc(journalEntries.occurredOn), asc(journalLines.id))
          .limit(limit)
          .offset(offset)
      ).map(({ e, l }) => [e.occurredOn, e.id, e.memo, e.sourceType, l.account, l.debitMinor / 100, l.creditMinor / 100]),
  },
  audit: {
    header: ["timestamp", "actor", "action", "entity", "entity_id", "summary"],
    page: async (c, offset, limit) =>
      (await c.get("deps").db.select().from(auditEvents).where(eq(auditEvents.tenantId, c.get("tenant").id)).orderBy(asc(auditEvents.id)).limit(limit).offset(offset)).map((a) => [
        a.createdAt, a.actorName, a.action, a.entityType, a.entityId, a.summary,
      ]),
  },
};

dataRoutes.get("/export/:entity", async (c) => {
  requirePerm(c, "reports:read");
  const entity = c.req.param("entity").replace(/\.csv$/, "");
  const exp = exporters[entity];
  if (!exp) throw badRequest("Unknown export");
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="${c.get("tenant").slug}-${entity}-${today(c)}.csv"`);
  return stream(c, async (s) => {
    await s.write("﻿" + toCsvLine(exp.header));
    for (let offset = 0; ; offset += PAGE) {
      const rows = await exp.page(c, offset, PAGE);
      if (rows.length) await s.write(rows.map(toCsvLine).join(""));
      if (rows.length < PAGE) break;
    }
  });
});

// ---------------------------------------------------------------- CSV import

const importBody = z.object({ csv: z.string().min(1).max(5_000_000), dryRun: z.boolean().default(true) });
const MAX_ROWS = 5000;

interface RowError {
  row: number;
  message: string;
}

dataRoutes.post("/import/members", async (c) => {
  requirePerm(c, "import:write");
  const { csv, dryRun } = await parseBody(c, importBody);
  const tenant = c.get("tenant");
  const { db } = c.get("deps");
  const rows = parseCsv(csv);
  if (rows.length > MAX_ROWS) throw badRequest(`At most ${MAX_ROWS} rows per import`);

  const errors: RowError[] = [];
  const existing = await db.select({ email: memberships.email, no: memberships.memberNo }).from(memberships).where(eq(memberships.tenantId, tenant.id));
  const emails = new Set(existing.map((e) => e.email).filter(Boolean));
  const numbers = new Set(existing.map((e) => e.no));
  const valid: (typeof memberships.$inferInsert)[] = [];

  rows.forEach((r, i) => {
    const n = i + 2;
    const name = r.name || r.full_name;
    const email = (r.email || "").toLowerCase() || null;
    const joined = r.joined_on || r.joining_date || r.date_joined;
    const pkg = (r.welfare_package || tenant.settings.defaultWelfarePackageId).toLowerCase();
    if (!name) return errors.push({ row: n, message: "Missing name" });
    if (!joined || !/^\d{4}-\d{2}-\d{2}$/.test(joined)) return errors.push({ row: n, message: "joined_on must be YYYY-MM-DD" });
    if (email && !z.string().email().safeParse(email).success) return errors.push({ row: n, message: `Invalid email ${email}` });
    if (email && emails.has(email)) return errors.push({ row: n, message: `Email ${email} already exists` });
    if (r.member_no && numbers.has(r.member_no)) return errors.push({ row: n, message: `Member number ${r.member_no} already exists` });
    if (!tenant.settings.welfarePackages.some((p) => p.id === pkg)) return errors.push({ row: n, message: `Unknown welfare package ${pkg}` });
    if (email) emails.add(email);
    if (r.member_no) numbers.add(r.member_no);
    valid.push({
      tenantId: tenant.id,
      memberNo: r.member_no || "",
      name,
      email,
      phone: r.phone || null,
      occupation: r.occupation || r.employment || null,
      joinedOn: joined,
      welfarePackageId: pkg,
      attendancePct: r.attendance_pct ? Math.max(0, Math.min(100, Number(r.attendance_pct))) : 100,
      roles: ["member"],
    });
  });

  if (dryRun || errors.length) return c.json({ dryRun: true, total: rows.length, valid: valid.length, errors });
  await db.transaction(async (tx) => {
    for (const v of valid) if (!v.memberNo) v.memberNo = await nextRef(tx, tenant.id, "member", "M");
    for (let i = 0; i < valid.length; i += 500) await tx.insert(memberships).values(valid.slice(i, i + 500));
    await audit(tx, tenant.id, actorOf(c), { action: "import.members", entityType: "import", summary: `Imported ${valid.length} members from CSV` });
  });
  return c.json({ dryRun: false, total: rows.length, imported: valid.length, errors: [] });
});

dataRoutes.post("/import/contributions", async (c) => {
  requirePerm(c, "import:write");
  const { csv, dryRun } = await parseBody(c, importBody);
  const tenant = c.get("tenant");
  const { db } = c.get("deps");
  const rows = parseCsv(csv);
  if (rows.length > MAX_ROWS) throw badRequest(`At most ${MAX_ROWS} rows per import`);

  const members = await db.select({ id: memberships.id, no: memberships.memberNo, email: memberships.email }).from(memberships).where(eq(memberships.tenantId, tenant.id));
  const byNo = new Map(members.map((m) => [m.no.toLowerCase(), m.id]));
  const byEmail = new Map(members.filter((m) => m.email).map((m) => [m.email!.toLowerCase(), m.id]));
  const errors: RowError[] = [];
  const valid: { membershipId: string; period: string; amountMinor: number; status?: ContributionStatus; paidOn?: string; row: number }[] = [];
  const seen = new Set<string>();

  rows.forEach((r, i) => {
    const n = i + 2;
    const id = (r.member_no && byNo.get(r.member_no.toLowerCase())) || (r.email && byEmail.get(r.email.toLowerCase()));
    if (!id) return errors.push({ row: n, message: `No member matches ${r.member_no || r.email || "(blank)"}` });
    const period = r.period || (r.year && r.month ? `${r.year}-${String(r.month).padStart(2, "0")}` : "");
    if (!PERIOD_RE.test(period)) return errors.push({ row: n, message: "period must be YYYY-MM (or give year + month)" });
    const status = (r.status || "").toLowerCase().replace(/[\s-]/g, "_") as ContributionStatus | "";
    if (status && !CONTRIBUTION_STATUSES.includes(status)) return errors.push({ row: n, message: `Unknown status ${r.status}` });
    let amountMinor = 0;
    try {
      amountMinor = r.amount ? toMinor(r.amount) : 0;
    } catch {
      return errors.push({ row: n, message: `Invalid amount ${r.amount}` });
    }
    const key = `${id}:${period}`;
    if (seen.has(key)) return errors.push({ row: n, message: `Duplicate row for ${period}` });
    seen.add(key);
    if (r.paid_on && !/^\d{4}-\d{2}-\d{2}$/.test(r.paid_on)) return errors.push({ row: n, message: "paid_on must be YYYY-MM-DD" });
    valid.push({ membershipId: id, period, amountMinor, status: status || undefined, paidOn: r.paid_on || (amountMinor ? `${period}-05` : undefined), row: n });
  });

  if (dryRun || errors.length) return c.json({ dryRun: true, total: rows.length, valid: valid.length, errors });

  // All-or-nothing: the whole file posts (with shares + journals) or none of it does.
  const t = today(c);
  const actor = actorOf(c);
  try {
    await db.transaction(async (tx) => {
      valid.sort((a, b) => a.period.localeCompare(b.period));
      for (const v of valid) {
        try {
          await recordContribution(tx, tenant, actor, { ...v, method: "import", today: t });
        } catch (err) {
          if (err instanceof AppError) throw new AppError(422, "import_failed", `Row ${v.row}: ${err.message}`);
          throw err;
        }
      }
      await audit(tx, tenant.id, actor, { action: "import.contributions", entityType: "import", summary: `Imported ${valid.length} contributions from CSV` });
    });
  } catch (err) {
    if (err instanceof AppError) return c.json({ dryRun: false, total: rows.length, imported: 0, errors: [{ row: 0, message: err.message }] }, 422);
    throw err;
  }
  return c.json({ dryRun: false, total: rows.length, imported: valid.length, errors: [] });
});

