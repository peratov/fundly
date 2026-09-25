import { z } from "zod";
import { CLAIM_TYPES, CONTRIBUTION_STATUSES, MOMO_NETWORKS, PAYMENT_METHODS, PLANS, ROLES, STANDINGS, TENANT_STATUSES } from "./enums";
import { PERIOD_RE } from "./period";
import { SUPPORTED_CURRENCIES } from "./settings";

const minor = z.number().int().nonnegative();
const positiveMinor = z.number().int().positive();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const period = z.string().regex(PERIOD_RE, "Use YYYY-MM");
const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(8, "At least 8 characters").max(200);
const phone = z.string().trim().max(30).regex(/^[+\d\s()-]*$/, "Digits, spaces and + only");

// ---------------------------------------------------------------- auth

export const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email,
  password,
  fund: z.object({
    name: z.string().trim().min(3).max(100),
    shortName: z.string().trim().max(40).optional(),
    currency: z.enum(SUPPORTED_CURRENCIES),
    minContributionMinor: positiveMinor,
    sharePriceMinor: positiveMinor,
  }),
});

export const loginSchema = z.object({ email, password: z.string().min(1).max(200) });

export const acceptInviteSchema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(2).max(80).optional(),
  password,
});

// ---------------------------------------------------------------- members

const nextOfKin = z.object({
  name: z.string().trim().max(80).default(""),
  phone: phone.default(""),
  relationship: z.string().trim().max(40).default(""),
});

export const memberCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: email.optional().or(z.literal("").transform(() => undefined)),
  phone: phone.optional(),
  occupation: z.string().trim().max(80).optional(),
  memberNo: z.string().trim().max(24).optional(),
  joinedOn: isoDate,
  roles: z.array(z.enum(ROLES)).min(1).default(["member"]),
  welfarePackageId: z.string().optional(),
  attendancePct: z.number().int().min(0).max(100).default(100),
  nextOfKin: nextOfKin.optional(),
  sendInvite: z.boolean().default(false),
});

export const memberUpdateSchema = memberCreateSchema
  .omit({ sendInvite: true, memberNo: true })
  .partial()
  .extend({ standing: z.enum(STANDINGS).optional() });

export const profileUpdateSchema = z.object({
  phone: phone.optional(),
  occupation: z.string().trim().max(80).optional(),
  nextOfKin: nextOfKin.optional(),
  welfarePackageId: z.string().optional(),
});

export const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

// ---------------------------------------------------------------- contributions

export const contributionCreateSchema = z.object({
  membershipId: z.string().uuid(),
  period,
  amountMinor: minor,
  status: z.enum(CONTRIBUTION_STATUSES).optional(),
  paidOn: isoDate.optional(),
  method: z.enum(PAYMENT_METHODS).default("cash"),
  note: z.string().trim().max(200).optional(),
});

export const contributionCorrectSchema = z.object({
  amountMinor: minor,
  status: z.enum(CONTRIBUTION_STATUSES),
  reason: z.string().trim().min(3).max(200),
});

export const closePeriodSchema = z.object({ period });

// ---------------------------------------------------------------- loans

export const loanApplySchema = z.object({
  membershipId: z.string().uuid().optional(),
  productCode: z.string().min(1),
  principalMinor: positiveMinor,
  termMonths: z.number().int().min(1).max(60),
  purpose: z.string().trim().min(5).max(300),
  requestSpecialReview: z.boolean().default(false),
});

export const loanReviewSchema = z.object({
  decision: z.enum(["approve", "decline"]),
  notes: z.string().trim().min(3).max(500),
});

export const loanDecisionSchema = z.object({
  decision: z.enum(["approve", "decline"]),
  notes: z.string().trim().max(500).default(""),
  disbursedOn: isoDate.optional(),
});

export const loanRepaymentSchema = z.object({
  amountMinor: positiveMinor,
  paidOn: isoDate.optional(),
  method: z.enum(PAYMENT_METHODS).default("cash"),
});

export const loanPenaltySchema = z.object({
  amountMinor: positiveMinor,
  reason: z.string().trim().min(3).max(200),
});

export const loanStatusSchema = z.object({
  status: z.enum(["defaulted", "written_off", "active"]),
  reason: z.string().trim().min(3).max(200),
});

// ---------------------------------------------------------------- welfare claims

export const claimCreateSchema = z.object({
  membershipId: z.string().uuid().optional(),
  type: z.enum(CLAIM_TYPES),
  amountRequestedMinor: positiveMinor,
  description: z.string().trim().min(5).max(1000),
});

export const claimDecisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  amountApprovedMinor: minor.optional(),
  notes: z.string().trim().max(500).default(""),
});

// ---------------------------------------------------------------- shares, settings

export const shareGrantSchema = z.object({
  membershipId: z.string().uuid(),
  shares: z.number().refine((n) => n !== 0, "Cannot be zero"),
  reason: z.string().trim().min(3).max(200),
});

export const sharePriceSchema = z.object({ effectivePeriod: period, priceMinor: positiveMinor });

export const fundProfileSchema = z.object({
  name: z.string().trim().min(3).max(100),
  shortName: z.string().trim().max(40).optional(),
});

// ---------------------------------------------------------------- payments

export const paymentInitSchema = z.discriminatedUnion("purpose", [
  z.object({
    purpose: z.literal("contribution"),
    periods: z.array(period).min(1).max(12),
    amountPerPeriodMinor: positiveMinor,
    phone,
    network: z.enum(MOMO_NETWORKS),
  }),
  z.object({
    purpose: z.literal("loan_repayment"),
    loanId: z.string().uuid(),
    amountMinor: positiveMinor,
    phone,
    network: z.enum(MOMO_NETWORKS),
  }),
]);

// ---------------------------------------------------------------- platform admin

export const tenantAdminUpdateSchema = z.object({
  status: z.enum(TENANT_STATUSES).optional(),
  plan: z.enum(PLANS).optional(),
  trialEndsAt: isoDate.optional(),
});

// ---------------------------------------------------------------- assistant

export const outreachSchema = z.object({
  purpose: z.enum(["contribution_reminder", "loan_reminder", "attendance", "welfare_benefits", "greeting"]),
  channel: z.enum(["whatsapp", "email", "sms"]),
  tone: z.enum(["friendly", "professional", "urgent"]),
  context: z.string().trim().max(500).optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type MemberCreateInput = z.infer<typeof memberCreateSchema>;
export type LoanApplyInput = z.infer<typeof loanApplySchema>;
export type PaymentInitInput = z.infer<typeof paymentInitSchema>;
export type OutreachInput = z.infer<typeof outreachSchema>;

// ---------------------------------------------------------------- free merry-go-round tool (public, lead generation)

const circleMember = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(60),
  phone: phone.optional(),
});

export const circleBodySchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    currency: z.enum(SUPPORTED_CURRENCIES),
    amountMinor: positiveMinor.max(100_000_000),
    frequency: z.enum(["weekly", "biweekly", "monthly"]),
    startDate: isoDate,
    members: z.array(circleMember).min(2).max(50),
    order: z.array(z.string()).min(2).max(50),
  })
  .refine((c) => new Set(c.members.map((m) => m.id)).size === c.members.length, { message: "Member ids must be unique", path: ["members"] })
  .refine((c) => c.order.length === c.members.length && c.order.every((id) => c.members.some((m) => m.id === id)) && new Set(c.order).size === c.order.length, {
    message: "Payout order must include every member exactly once",
    path: ["order"],
  });

export const circleCreateSchema = z.object({
  circle: circleBodySchema,
  organizer: z.object({
    name: z.string().trim().min(2).max(80),
    email,
    phone: phone.optional(),
    marketingConsent: z.boolean().default(false),
  }),
});

export const circleUpdateSchema = z.object({
  circle: circleBodySchema.optional(),
  /** Round index → member ids that have paid that round. */
  payments: z.record(z.string().regex(/^\d{1,2}$/), z.array(z.string().max(40)).max(50)).optional(),
});

export type CircleBody = z.infer<typeof circleBodySchema>;
