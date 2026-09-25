export const ROLES = ["owner", "manager", "credit_committee", "audit_committee", "member"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  manager: "Fund Manager",
  credit_committee: "Credit Committee",
  audit_committee: "Audit Committee",
  member: "Member",
};

export const STANDINGS = ["active", "behind", "voided"] as const;
export type Standing = (typeof STANDINGS)[number];

export const MEMBER_STATUSES = ["active", "exited"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const CONTRIBUTION_STATUSES = ["on_time", "late", "advance", "missed"] as const;
export type ContributionStatus = (typeof CONTRIBUTION_STATUSES)[number];

export const PAYMENT_METHODS = ["cash", "momo", "bank", "import"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const LOAN_STATUSES = [
  "pending_committee",
  "pending_manager",
  "active",
  "overdue",
  "repaid",
  "declined",
  "defaulted",
  "written_off",
] as const;
export type LoanStatus = (typeof LOAN_STATUSES)[number];

/** Loans that still carry a balance or are in the approval pipeline. */
export const OPEN_LOAN_STATUSES: LoanStatus[] = ["pending_committee", "pending_manager", "active", "overdue", "defaulted"];
export const OUTSTANDING_LOAN_STATUSES: LoanStatus[] = ["active", "overdue", "defaulted"];

export const CLAIM_TYPES = ["medical", "funeral", "welfare", "emergency"] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

export const CLAIM_STATUSES = ["pending", "approved", "rejected"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const PAYMENT_STATUSES = ["pending", "succeeded", "failed"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const MOMO_NETWORKS = ["mtn", "telecel", "at"] as const;
export type MomoNetwork = (typeof MOMO_NETWORKS)[number];

export const TENANT_STATUSES = ["trial", "active", "suspended", "cancelled"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const PLANS = ["trial", "standard", "enterprise"] as const;
export type Plan = (typeof PLANS)[number];

/**
 * Chart of accounts for the double-entry journal. Every money movement posts
 * balanced lines against these, so reports come from the journal and can't drift.
 */
export const ACCOUNTS = {
  CASH: "cash",
  LOANS_RECEIVABLE: "loans_receivable",
  MEMBER_SAVINGS: "member_savings",
  WELFARE_RESERVE: "welfare_reserve",
  INTEREST_INCOME: "interest_income",
  PENALTY_INCOME: "penalty_income",
  WRITE_OFF_EXPENSE: "write_off_expense",
} as const;
export type Account = (typeof ACCOUNTS)[keyof typeof ACCOUNTS];

/** Debit-normal accounts grow with debits; the rest grow with credits. */
export const DEBIT_NORMAL: ReadonlySet<Account> = new Set<Account>(["cash", "loans_receivable", "write_off_expense"]);

export function label(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const SUPPORTED_CURRENCIES = ["GHS", "NGN", "KES", "UGX", "ZAR", "USD", "GBP", "EUR"] as const;
