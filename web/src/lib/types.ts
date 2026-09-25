import type { ClaimStatus, ClaimType, ContributionStatus, LoanStatus, Role, Standing } from "../../../shared/enums";
import type { CreditScore, Eligibility } from "../../../shared/domain/members";
import type { ScheduleRow } from "../../../shared/domain/loans";
import type { FundSettings, LoanProduct, WelfarePackage } from "../../../shared/settings";

export interface Member {
  id: string;
  memberNo: string;
  name: string;
  email: string | null;
  phone: string | null;
  occupation: string | null;
  joinedOn: string;
  roles: Role[];
  welfarePackageId: string;
  attendancePct: number;
  standing: Standing;
  status: "active" | "exited";
  userId: string | null;
  nextOfKin: { name: string; phone: string; relationship: string } | null;
}

export interface MemberRow extends Member {
  hasLogin: boolean;
  savingsMinor: number;
  lastPaidPeriod: string | null;
  microShares: number;
}

export interface Contribution {
  id: string;
  membershipId: string;
  period: string;
  amountMinor: number;
  premiumMinor: number;
  status: ContributionStatus;
  paidOn: string | null;
  method: string | null;
  memberName?: string;
  memberNo?: string;
  note?: string | null;
}

export interface Loan {
  id: string;
  ref: string;
  membershipId: string;
  productCode: string;
  productName: string;
  principalMinor: number;
  rateBps: number;
  termMonths: number;
  interestMinor: number;
  purpose: string;
  specialReview: boolean;
  status: LoanStatus;
  decisionNotes: string | null;
  disbursedOn: string | null;
  closedOn: string | null;
  penaltiesMinor: number;
  paidPrincipalMinor: number;
  paidInterestMinor: number;
  paidPenaltyMinor: number;
  createdAt: string;
  balance: { principalMinor: number; interestMinor: number; penaltyMinor: number; totalMinor: number };
  schedule: ScheduleRow[];
  arrearsMinor: number;
  maturesOn: string | null;
  totalRepayableMinor: number;
  memberName?: string;
  memberNo?: string;
}

export interface Claim {
  id: string;
  ref: string;
  membershipId: string;
  type: ClaimType;
  amountRequestedMinor: number;
  amountApprovedMinor: number;
  status: ClaimStatus;
  description: string;
  decisionNotes: string | null;
  createdAt: string;
  decidedAt: string | null;
  memberName?: string;
  memberNo?: string;
}

export interface Payment {
  id: string;
  purpose: "contribution" | "loan_repayment";
  target: { periods?: string[]; loanId?: string };
  amountMinor: number;
  currency: string;
  providerRef: string;
  network: string | null;
  phone: string | null;
  status: "pending" | "succeeded" | "failed";
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
  memberName?: string;
}

export interface Snapshot {
  member: Member;
  contributions: Contribution[];
  loans: Loan[];
  totals: {
    totalContributedMinor: number;
    savingsMinor: number;
    welfarePremiumsMinor: number;
    microShares: number;
    sharePriceMinor: number;
    shareValueMinor: number;
    loanBalanceMinor: number;
    paidPeriods: number;
    missedPeriods: number;
  };
  score: CreditScore;
  eligibility: Eligibility;
  welfare: { package: WelfarePackage; remaining: Record<ClaimType, number> };
}

export interface MemberDetailData extends Snapshot {
  claims: Claim[];
  hasLogin: boolean;
}

export interface PortalData extends Snapshot {
  claims: Claim[];
  pendingPayments: Payment[];
  duePeriods: string[];
  loanProducts: LoanProduct[];
  welfarePackages: WelfarePackage[];
  minContributionMinor: number;
  simulatedPayments: boolean;
}

export interface FundInfo {
  id: string;
  name: string;
  shortName: string | null;
  currency: string;
  status: string;
  plan: string;
  trialEndsAt: string | null;
  settings: FundSettings;
  sharePrices: { effectivePeriod: string; priceMinor: number }[];
}

export interface AuditEvent {
  id: number;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  createdAt: string;
}
