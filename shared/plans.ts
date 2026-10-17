/**
 * Plans, limits and prices: the single source of truth for the server (enforcement,
 * billing) and the web app (pricing page, upgrade prompts).
 *
 * Free is free forever for funds of up to 25 members. Paid plans unlock online
 * collection (members pay by mobile money in the app), AI assistance and more members.
 */
export const PLAN_IDS = ["free", "growth", "pro"] as const;
export type PlanId = (typeof PLAN_IDS)[number];
export const PAID_PLANS = ["growth", "pro"] as const;
export type PaidPlanId = (typeof PAID_PLANS)[number];
export const BILLING_INTERVALS = ["month", "year"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export interface PlanInfo {
  id: PlanId;
  name: string;
  tagline: string;
  /** Active members allowed; null means unlimited. */
  memberLimit: number | null;
  /** Members pay dues and loan repayments by mobile money inside the app. */
  onlinePayments: boolean;
  /** Claude writes credit assessments and reminder drafts (templates otherwise). */
  aiAssistant: boolean;
  prioritySupport: boolean;
  /** Short, marketing-ready list of what this plan adds. */
  highlights: string[];
}

export const PLANS: Record<PlanId, PlanInfo> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "For circles and small groups getting organised",
    memberLimit: 25,
    onlinePayments: false,
    aiAssistant: false,
    prioritySupport: false,
    highlights: [
      "Up to 25 members, free forever",
      "Dues, loans, welfare and shares",
      "Committee loan reviews",
      "Double-entry books and reports",
      "Member app for every member",
      "Spreadsheet import, CSV export",
      "Full audit trail",
      "Record cash and transfer payments",
    ],
  },
  growth: {
    id: "growth",
    name: "Growth",
    tagline: "For funds that want dues to collect themselves",
    memberLimit: 150,
    onlinePayments: true,
    aiAssistant: true,
    prioritySupport: false,
    highlights: [
      "Up to 150 members",
      "Members pay by mobile money in the app",
      "Payments post to the books automatically",
      "Instant payment confirmations and live balances",
      "AI-written credit assessments",
      "AI reminder drafts for late payers",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "For large associations and federations",
    memberLimit: null,
    onlinePayments: true,
    aiAssistant: true,
    prioritySupport: true,
    highlights: ["Unlimited members", "Everything in Growth", "Priority WhatsApp support", "Guided onboarding and data migration", "Early access to new features"],
  },
};

/** Monthly prices in minor units. A year costs ten months (two months free). */
export const PRICES: Record<string, Record<PaidPlanId, number>> = {
  USD: { growth: 1500, pro: 3900 },
  GHS: { growth: 19900, pro: 49900 },
  NGN: { growth: 2200000, pro: 5900000 },
  KES: { growth: 190000, pro: 499000 },
};
export const PRICE_CURRENCIES = Object.keys(PRICES);
export const GRACE_DAYS = 7;

export function priceFor(plan: PaidPlanId, interval: BillingInterval, currency: string): { amountMinor: number; currency: string; months: number } {
  const table = PRICES[currency] ?? PRICES.USD;
  const cur = PRICES[currency] ? currency : "USD";
  const monthly = table[plan];
  return interval === "year" ? { amountMinor: monthly * 10, currency: cur, months: 12 } : { amountMinor: monthly, currency: cur, months: 1 };
}

export const planInfo = (plan: string): PlanInfo => PLANS[(PLAN_IDS as readonly string[]).includes(plan) ? (plan as PlanId) : "free"];

/** The cheapest plan that fits a member count (and online collection, if wanted). */
export function recommendPlan(members: number, wantsOnlinePayments = false): PlanId {
  if (members <= PLANS.free.memberLimit! && !wantsOnlinePayments) return "free";
  if (members <= PLANS.growth.memberLimit!) return "growth";
  return "pro";
}

export const isPaid = (plan: string) => plan === "growth" || plan === "pro";
