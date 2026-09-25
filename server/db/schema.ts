import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { ClaimStatus, ClaimType, ContributionStatus, LoanStatus, MomoNetwork, PaymentMethod, PaymentStatus, Plan, Role, Standing, TenantStatus, MemberStatus } from "../../shared/enums";
import type { FundSettings } from "../../shared/settings";

/*
 * Every tenant-owned table carries tenant_id and leads its indexes with it, so
 * queries stay index-bound as the platform grows and the data can later be
 * partitioned or sharded by tenant without reshaping the schema.
 */

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => bigint(name, { mode: "number" }).notNull().default(0);

// ---------------------------------------------------------------- identity

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------- tenants

export const tenants = pgTable(
  "tenants",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    shortName: text("short_name"),
    currency: text("currency").notNull(),
    status: text("status").$type<TenantStatus>().notNull().default("trial"),
    plan: text("plan").$type<Plan>().notNull().default("trial"),
    trialEndsAt: date("trial_ends_at"),
    settings: jsonb("settings").$type<FundSettings>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tenants_slug_uq").on(t.slug)],
);

/** Per-tenant sequences for human-readable references (M-0001, L-0042...). */
export const counters = pgTable(
  "counters",
  {
    tenantId: tenantId(),
    key: text("key").notNull(),
    value: integer("value").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.key] })],
);

export const sharePrices = pgTable(
  "share_prices",
  {
    id: id(),
    tenantId: tenantId(),
    effectivePeriod: text("effective_period").notNull(),
    priceMinor: money("price_minor"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("share_prices_tenant_period_uq").on(t.tenantId, t.effectivePeriod)],
);

// ---------------------------------------------------------------- members

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    memberNo: text("member_no").notNull(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    occupation: text("occupation"),
    joinedOn: date("joined_on").notNull(),
    roles: text("roles").array().$type<Role[]>().notNull().default(sql`ARRAY['member']::text[]`),
    welfarePackageId: text("welfare_package_id").notNull(),
    attendancePct: integer("attendance_pct").notNull().default(100),
    standing: text("standing").$type<Standing>().notNull().default("active"),
    status: text("status").$type<MemberStatus>().notNull().default("active"),
    nextOfKin: jsonb("next_of_kin").$type<{ name: string; phone: string; relationship: string }>(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("memberships_tenant_no_uq").on(t.tenantId, t.memberNo),
    uniqueIndex("memberships_tenant_email_uq").on(t.tenantId, t.email).where(sql`${t.email} is not null`),
    uniqueIndex("memberships_tenant_user_uq").on(t.tenantId, t.userId).where(sql`${t.userId} is not null`),
    index("memberships_user_idx").on(t.userId),
    index("memberships_tenant_name_idx").on(t.tenantId, t.name),
  ],
);

export const invites = pgTable(
  "invites",
  {
    tokenHash: text("token_hash").primaryKey(),
    tenantId: tenantId(),
    membershipId: uuid("membership_id").notNull().references(() => memberships.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("invites_membership_idx").on(t.membershipId)],
);

// ---------------------------------------------------------------- savings

export const contributions = pgTable(
  "contributions",
  {
    id: id(),
    tenantId: tenantId(),
    membershipId: uuid("membership_id").notNull().references(() => memberships.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    amountMinor: money("amount_minor"),
    premiumMinor: money("premium_minor"),
    status: text("status").$type<ContributionStatus>().notNull(),
    paidOn: date("paid_on"),
    method: text("method").$type<PaymentMethod>(),
    paymentId: uuid("payment_id"),
    note: text("note"),
    recordedBy: uuid("recorded_by"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("contributions_member_period_uq").on(t.tenantId, t.membershipId, t.period),
    index("contributions_tenant_period_idx").on(t.tenantId, t.period),
    check("contributions_amount_ck", sql`${t.amountMinor} >= 0 and ${t.premiumMinor} >= 0 and ${t.premiumMinor} <= ${t.amountMinor}`),
  ],
);

export const shareEntries = pgTable(
  "share_entries",
  {
    id: id(),
    tenantId: tenantId(),
    membershipId: uuid("membership_id").notNull().references(() => memberships.id, { onDelete: "cascade" }),
    microShares: bigint("micro_shares", { mode: "number" }).notNull(),
    source: text("source").$type<"contribution" | "grant" | "adjustment">().notNull(),
    refId: uuid("ref_id"),
    reason: text("reason"),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("share_entries_tenant_member_idx").on(t.tenantId, t.membershipId), index("share_entries_ref_idx").on(t.refId)],
);

// ---------------------------------------------------------------- loans

export const loans = pgTable(
  "loans",
  {
    id: id(),
    tenantId: tenantId(),
    ref: text("ref").notNull(),
    membershipId: uuid("membership_id").notNull().references(() => memberships.id, { onDelete: "cascade" }),
    productCode: text("product_code").notNull(),
    productName: text("product_name").notNull(),
    principalMinor: money("principal_minor"),
    rateBps: integer("rate_bps").notNull(),
    termMonths: integer("term_months").notNull(),
    interestMinor: money("interest_minor"),
    purpose: text("purpose").notNull(),
    specialReview: boolean("special_review").notNull().default(false),
    status: text("status").$type<LoanStatus>().notNull(),
    decisionNotes: text("decision_notes"),
    decidedBy: uuid("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    disbursedOn: date("disbursed_on"),
    closedOn: date("closed_on"),
    penaltiesMinor: money("penalties_minor"),
    paidPrincipalMinor: money("paid_principal_minor"),
    paidInterestMinor: money("paid_interest_minor"),
    paidPenaltyMinor: money("paid_penalty_minor"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("loans_tenant_ref_uq").on(t.tenantId, t.ref),
    index("loans_tenant_status_idx").on(t.tenantId, t.status),
    index("loans_tenant_member_idx").on(t.tenantId, t.membershipId),
    check("loans_paid_ck", sql`${t.paidPrincipalMinor} <= ${t.principalMinor} and ${t.paidInterestMinor} <= ${t.interestMinor} and ${t.paidPenaltyMinor} <= ${t.penaltiesMinor}`),
  ],
);

export const loanReviews = pgTable(
  "loan_reviews",
  {
    id: id(),
    tenantId: tenantId(),
    loanId: uuid("loan_id").notNull().references(() => loans.id, { onDelete: "cascade" }),
    reviewerMembershipId: uuid("reviewer_membership_id").notNull().references(() => memberships.id),
    reviewerName: text("reviewer_name").notNull(),
    decision: text("decision").$type<"approve" | "decline">().notNull(),
    notes: text("notes").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("loan_reviews_loan_reviewer_uq").on(t.loanId, t.reviewerMembershipId)],
);

export const loanRepayments = pgTable(
  "loan_repayments",
  {
    id: id(),
    tenantId: tenantId(),
    loanId: uuid("loan_id").notNull().references(() => loans.id, { onDelete: "cascade" }),
    amountMinor: money("amount_minor"),
    principalMinor: money("principal_minor"),
    interestMinor: money("interest_minor"),
    penaltyMinor: money("penalty_minor"),
    paidOn: date("paid_on").notNull(),
    method: text("method").$type<PaymentMethod>().notNull(),
    paymentId: uuid("payment_id"),
    recordedBy: uuid("recorded_by"),
    createdAt: createdAt(),
  },
  (t) => [index("loan_repayments_loan_idx").on(t.loanId)],
);

export const loanPenalties = pgTable(
  "loan_penalties",
  {
    id: id(),
    tenantId: tenantId(),
    loanId: uuid("loan_id").notNull().references(() => loans.id, { onDelete: "cascade" }),
    amountMinor: money("amount_minor"),
    reason: text("reason").notNull(),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("loan_penalties_loan_idx").on(t.loanId)],
);

// ---------------------------------------------------------------- welfare

export const claims = pgTable(
  "claims",
  {
    id: id(),
    tenantId: tenantId(),
    ref: text("ref").notNull(),
    membershipId: uuid("membership_id").notNull().references(() => memberships.id, { onDelete: "cascade" }),
    type: text("type").$type<ClaimType>().notNull(),
    amountRequestedMinor: money("amount_requested_minor"),
    amountApprovedMinor: money("amount_approved_minor"),
    status: text("status").$type<ClaimStatus>().notNull().default("pending"),
    description: text("description").notNull(),
    decisionNotes: text("decision_notes"),
    decidedBy: uuid("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("claims_tenant_ref_uq").on(t.tenantId, t.ref),
    index("claims_tenant_status_idx").on(t.tenantId, t.status),
    index("claims_tenant_member_idx").on(t.tenantId, t.membershipId),
  ],
);

// ---------------------------------------------------------------- payments

export const payments = pgTable(
  "payments",
  {
    id: id(),
    tenantId: tenantId(),
    membershipId: uuid("membership_id").notNull().references(() => memberships.id, { onDelete: "cascade" }),
    purpose: text("purpose").$type<"contribution" | "loan_repayment">().notNull(),
    target: jsonb("target").$type<{ periods?: string[]; loanId?: string }>().notNull(),
    amountMinor: money("amount_minor"),
    currency: text("currency").notNull(),
    provider: text("provider").notNull(),
    providerRef: text("provider_ref").notNull(),
    network: text("network").$type<MomoNetwork>(),
    phone: text("phone"),
    status: text("status").$type<PaymentStatus>().notNull().default("pending"),
    failureReason: text("failure_reason"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("payments_provider_ref_uq").on(t.provider, t.providerRef),
    index("payments_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("payments_tenant_member_idx").on(t.tenantId, t.membershipId),
  ],
);

// ---------------------------------------------------------------- ledger

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: id(),
    tenantId: tenantId(),
    occurredOn: date("occurred_on").notNull(),
    memo: text("memo").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id"),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("journal_entries_tenant_date_idx").on(t.tenantId, t.occurredOn), index("journal_entries_source_idx").on(t.sourceId)],
);

export const journalLines = pgTable(
  "journal_lines",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: tenantId(),
    entryId: uuid("entry_id").notNull().references(() => journalEntries.id, { onDelete: "cascade" }),
    account: text("account").notNull(),
    membershipId: uuid("membership_id"),
    debitMinor: money("debit_minor"),
    creditMinor: money("credit_minor"),
  },
  (t) => [
    index("journal_lines_tenant_account_idx").on(t.tenantId, t.account),
    index("journal_lines_entry_idx").on(t.entryId),
    check("journal_lines_side_ck", sql`(${t.debitMinor} >= 0 and ${t.creditMinor} >= 0) and (${t.debitMinor} = 0 or ${t.creditMinor} = 0)`),
  ],
);

// ---------------------------------------------------------------- audit & notifications

export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: tenantId(),
    actorUserId: uuid("actor_user_id"),
    actorName: text("actor_name").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    data: jsonb("data"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_events_tenant_created_idx").on(t.tenantId, t.createdAt), index("audit_events_entity_idx").on(t.tenantId, t.entityType, t.entityId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_tenant_idx").on(t.userId, t.tenantId, t.createdAt)],
);

// ---------------------------------------------------------------- growth: free tools & leads

/**
 * Marketing leads captured by the free public tools. Not tenant-scoped: these
 * people aren't customers yet. One row per (email, source); repeat visits update it.
 */
export const leads = pgTable(
  "leads",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    source: text("source").notNull(),
    marketingConsent: boolean("marketing_consent").notNull().default(false),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    convertedUserId: uuid("converted_user_id"),
    createdAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("leads_email_source_uq").on(t.email, t.source), index("leads_created_idx").on(t.createdAt)],
);

/**
 * A free merry-go-round (rotating savings) circle. Anyone with the slug can view it;
 * only the holder of the edit token (stored hashed) can change it.
 */
export const circles = pgTable(
  "circles",
  {
    id: id(),
    slug: text("slug").notNull(),
    editTokenHash: text("edit_token_hash").notNull(),
    /** Additional organiser links issued by "email me my link" recovery (newest last, capped). */
    extraTokenHashes: text("extra_token_hashes").array().notNull().default(sql`'{}'::text[]`),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    organizerName: text("organizer_name").notNull(),
    data: jsonb("data").$type<import("../../shared/schemas").CircleBody>().notNull(),
    payments: jsonb("payments").$type<Record<string, string[]>>().notNull().default({}),
    views: integer("views").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("circles_slug_uq").on(t.slug), index("circles_lead_idx").on(t.leadId)],
);
