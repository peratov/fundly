import { z } from "zod";
import { CLAIM_TYPES } from "./enums";

const minor = z.number().int().nonnegative();

export const loanProductSchema = z.object({
  code: z.string().min(1).max(24).regex(/^[a-z0-9_-]+$/),
  name: z.string().min(1).max(80),
  rateBps: z.number().int().min(0).max(10_000),
  maxTermMonths: z.number().int().min(1).max(60),
  maxAmountMinor: minor,
  description: z.string().max(300).default(""),
  active: z.boolean().default(true),
});
export type LoanProduct = z.infer<typeof loanProductSchema>;

export const welfarePackageSchema = z.object({
  id: z.string().min(1).max(24).regex(/^[a-z0-9_-]+$/),
  name: z.string().min(1).max(80),
  monthlyPremiumMinor: minor,
  description: z.string().max(300).default(""),
  limits: z.object(Object.fromEntries(CLAIM_TYPES.map((t) => [t, minor])) as Record<(typeof CLAIM_TYPES)[number], typeof minor>),
});
export type WelfarePackage = z.infer<typeof welfarePackageSchema>;

export const fundSettingsSchema = z
  .object({
    minContributionMinor: minor,
    /** Day of month after which a payment for that month counts as late. */
    contributionDueDay: z.number().int().min(1).max(28),
    standing: z.object({
      behindAfterMissed: z.number().int().min(1).max(12),
      voidAfterMissed: z.number().int().min(1).max(24),
    }),
    loanPolicy: z.object({
      minCreditScore: z.number().int().min(0).max(1000),
      minTenureMonths: z.number().int().min(0).max(120),
      savingsMultiplier: z.number().min(0).max(20),
      minLimitMinor: minor,
      maxLimitMinor: minor,
      committeeQuorum: z.number().int().min(1).max(15),
      maxOpenLoans: z.number().int().min(1).max(5),
    }),
    loanProducts: z.array(loanProductSchema).min(1),
    welfarePackages: z.array(welfarePackageSchema).min(1),
    defaultWelfarePackageId: z.string(),
  })
  .refine((s) => s.standing.voidAfterMissed > s.standing.behindAfterMissed, {
    message: "Void threshold must be greater than the behind threshold",
    path: ["standing", "voidAfterMissed"],
  })
  .refine((s) => s.loanPolicy.maxLimitMinor >= s.loanPolicy.minLimitMinor, {
    message: "Maximum limit must be at least the minimum limit",
    path: ["loanPolicy", "maxLimitMinor"],
  })
  .refine((s) => s.welfarePackages.some((p) => p.id === s.defaultWelfarePackageId), {
    message: "Default welfare package must be one of the packages",
    path: ["defaultWelfarePackageId"],
  })
  .refine((s) => new Set(s.loanProducts.map((p) => p.code)).size === s.loanProducts.length, {
    message: "Loan product codes must be unique",
    path: ["loanProducts"],
  });

export type FundSettings = z.infer<typeof fundSettingsSchema>;

export function defaultSettings(minContributionMinor = 3000): FundSettings {
  return {
    minContributionMinor,
    contributionDueDay: 10,
    standing: { behindAfterMissed: 2, voidAfterMissed: 3 },
    loanPolicy: {
      minCreditScore: 500,
      minTenureMonths: 6,
      savingsMultiplier: 3,
      minLimitMinor: 150_000,
      maxLimitMinor: 1_200_000,
      committeeQuorum: 1,
      maxOpenLoans: 1,
    },
    loanProducts: [
      { code: "emergency", name: "Emergency Relief", rateBps: 500, maxTermMonths: 3, maxAmountMinor: 200_000, description: "Urgent healthcare or personal crisis. Fast approval.", active: true },
      { code: "personal", name: "Personal Loan", rateBps: 1000, maxTermMonths: 6, maxAmountMinor: 500_000, description: "Short-term personal liquidity.", active: true },
      { code: "business", name: "Enterprise Development", rateBps: 1500, maxTermMonths: 12, maxAmountMinor: 1_500_000, description: "Small business expansion, stock or farm inputs.", active: true },
      { code: "education", name: "Education Support", rateBps: 800, maxTermMonths: 24, maxAmountMinor: 1_000_000, description: "Tuition, certification courses and school fees.", active: true },
    ],
    welfarePackages: [
      { id: "bronze", name: "Bronze", monthlyPremiumMinor: 200, description: "Basic medical and funeral support.", limits: { funeral: 150_000, medical: 100_000, welfare: 80_000, emergency: 60_000 } },
      { id: "silver", name: "Silver", monthlyPremiumMinor: 500, description: "Mid-level healthcare and bereavement support.", limits: { funeral: 300_000, medical: 250_000, welfare: 180_000, emergency: 150_000 } },
      { id: "gold", name: "Gold", monthlyPremiumMinor: 1000, description: "Maximum health and funeral cover.", limits: { funeral: 600_000, medical: 500_000, welfare: 400_000, emergency: 300_000 } },
    ],
    defaultWelfarePackageId: "bronze",
  };
}

export { SUPPORTED_CURRENCIES } from "./enums";
