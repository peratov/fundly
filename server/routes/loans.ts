import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { LOAN_STATUSES } from "../../shared/enums";
import { quoteLoan } from "../../shared/domain/loans";
import { listQuerySchema, loanApplySchema, loanDecisionSchema, loanPenaltySchema, loanRepaymentSchema, loanReviewSchema, loanStatusSchema } from "../../shared/schemas";
import { loanPenalties, loanRepayments, loanReviews, loans, memberships } from "../db/schema";
import { hasPerm, requirePerm } from "../lib/auth";
import { actorOf, type AppEnv, today } from "../lib/context";
import { notFound, paged, parseBody, parseQuery, unprocessable } from "../lib/http";
import { applyForLoan, applyPenalty, changeLoanStatus, decideLoan, flagOverdueLoans, loanView, recordRepayment, reviewLoan } from "../services/loans";
import { memberSnapshot } from "../services/members";

export const loanRoutes = new Hono<AppEnv>();

loanRoutes.get("/", async (c) => {
  requirePerm(c, "loans:read");
  const q = parseQuery(c, listQuerySchema.extend({ status: z.string().optional() }));
  const tenant = c.get("tenant");
  const { db } = c.get("deps");
  const statuses = q.status?.split(",").filter((s): s is (typeof LOAN_STATUSES)[number] => (LOAN_STATUSES as readonly string[]).includes(s));
  const conds: SQL[] = [eq(loans.tenantId, tenant.id)];
  if (statuses?.length) conds.push(inArray(loans.status, statuses));
  if (q.q) conds.push(sql`(${memberships.name} ilike ${`%${q.q}%`} or ${loans.ref} ilike ${`%${q.q}%`})`);
  const where = and(...conds);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(loans).innerJoin(memberships, eq(memberships.id, loans.membershipId)).where(where);
  const rows = await db
    .select({ loan: loans, memberName: memberships.name, memberNo: memberships.memberNo })
    .from(loans)
    .innerJoin(memberships, eq(memberships.id, loans.membershipId))
    .where(where)
    .orderBy(desc(loans.createdAt))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  const t = today(c);
  return c.json(paged(rows.map((r) => ({ ...loanView(r.loan, t), memberName: r.memberName, memberNo: r.memberNo })), total, q.page, q.pageSize));
});

loanRoutes.post("/quote", async (c) => {
  const input = await parseBody(c, z.object({ productCode: z.string(), principalMinor: z.number().int().positive(), termMonths: z.number().int().min(1).max(60) }));
  const product = c.get("tenant").settings.loanProducts.find((p) => p.code === input.productCode);
  if (!product) throw unprocessable("Unknown loan product");
  return c.json(quoteLoan(input.principalMinor, product.rateBps, input.termMonths));
});

loanRoutes.post("/", async (c) => {
  const input = await parseBody(c, loanApplySchema);
  const self = c.get("membership");
  const membershipId = input.membershipId ?? self.id;
  if (membershipId !== self.id) requirePerm(c, "members:write");
  const { db, clock } = c.get("deps");
  const loan = await db.transaction((tx) => applyForLoan(tx, c.get("tenant"), actorOf(c), { ...input, membershipId, asOf: clock.now() }));
  return c.json(loan, 201);
});

loanRoutes.post("/scan-overdue", async (c) => {
  requirePerm(c, "loans:service");
  const { db } = c.get("deps");
  const flagged = await db.transaction((tx) => flagOverdueLoans(tx, c.get("tenant"), actorOf(c), today(c)));
  return c.json({ flagged });
});

loanRoutes.get("/:id", async (c) => {
  const tenant = c.get("tenant");
  const { db, clock } = c.get("deps");
  const id = c.req.param("id");
  const [row] = await db
    .select({ loan: loans, memberName: memberships.name, memberNo: memberships.memberNo })
    .from(loans)
    .innerJoin(memberships, eq(memberships.id, loans.membershipId))
    .where(and(eq(loans.tenantId, tenant.id), eq(loans.id, id)));
  if (!row) throw notFound("Loan");
  const own = row.loan.membershipId === c.get("membership").id;
  if (!own) requirePerm(c, "loans:read");

  const [reviews, repayments, penalties] = await Promise.all([
    db.select().from(loanReviews).where(eq(loanReviews.loanId, id)).orderBy(asc(loanReviews.createdAt)),
    db.select().from(loanRepayments).where(eq(loanRepayments.loanId, id)).orderBy(asc(loanRepayments.paidOn)),
    db.select().from(loanPenalties).where(eq(loanPenalties.loanId, id)).orderBy(asc(loanPenalties.createdAt)),
  ]);
  // Reviewers and managers see the applicant's credit profile alongside the application.
  const applicant = hasPerm(c, "loans:read") ? await memberSnapshot(db, tenant, row.loan.membershipId, clock.now(), { excludeLoanId: row.loan.id }) : null;
  const me = c.get("membership").id;
  return c.json({
    ...loanView(row.loan, today(c)),
    memberName: row.memberName,
    memberNo: row.memberNo,
    reviews: own && !hasPerm(c, "loans:read") ? [] : reviews,
    repayments,
    penalties,
    applicant: applicant && {
      score: applicant.score,
      eligibility: applicant.eligibility,
      totals: applicant.totals,
      standing: applicant.member.standing,
      joinedOn: applicant.member.joinedOn,
      recentContributions: applicant.contributions.slice(-12),
    },
    canReview: hasPerm(c, "loans:review") && row.loan.status === "pending_committee" && !own && !reviews.some((r) => r.reviewerMembershipId === me),
    canDecide: hasPerm(c, "loans:decide") && row.loan.status === "pending_manager" && !own,
    canDecline: hasPerm(c, "loans:decide") && (row.loan.status === "pending_manager" || row.loan.status === "pending_committee") && !own,
  });
});

loanRoutes.post("/:id/reviews", async (c) => {
  requirePerm(c, "loans:review");
  const input = await parseBody(c, loanReviewSchema);
  const { db } = c.get("deps");
  return c.json(await db.transaction((tx) => reviewLoan(tx, c.get("tenant"), actorOf(c), c.req.param("id"), input)));
});

loanRoutes.post("/:id/decision", async (c) => {
  requirePerm(c, "loans:decide");
  const input = await parseBody(c, loanDecisionSchema);
  const { db } = c.get("deps");
  return c.json(await db.transaction((tx) => decideLoan(tx, c.get("tenant"), actorOf(c), c.req.param("id"), { ...input, disbursedOn: input.disbursedOn ?? today(c) })));
});

loanRoutes.post("/:id/repayments", async (c) => {
  requirePerm(c, "loans:service");
  const input = await parseBody(c, loanRepaymentSchema);
  const { db } = c.get("deps");
  return c.json(await db.transaction((tx) => recordRepayment(tx, c.get("tenant"), actorOf(c), c.req.param("id"), { ...input, paidOn: input.paidOn ?? today(c) })));
});

loanRoutes.post("/:id/penalties", async (c) => {
  requirePerm(c, "loans:service");
  const input = await parseBody(c, loanPenaltySchema);
  const { db } = c.get("deps");
  return c.json(await db.transaction((tx) => applyPenalty(tx, c.get("tenant"), actorOf(c), c.req.param("id"), input)));
});

loanRoutes.post("/:id/status", async (c) => {
  requirePerm(c, "loans:decide");
  const input = await parseBody(c, loanStatusSchema);
  const { db } = c.get("deps");
  return c.json(await db.transaction((tx) => changeLoanStatus(tx, c.get("tenant"), actorOf(c), c.req.param("id"), { ...input, today: today(c) })));
});
