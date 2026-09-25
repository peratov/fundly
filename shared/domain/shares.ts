import type { Minor } from "../money";
import type { Period } from "../period";

/** Shares are stored as integer micro-shares (1 share = 1,000,000) to stay exact. */
export const MICRO = 1_000_000;

export interface SharePrice {
  effectivePeriod: Period;
  priceMinor: Minor;
}

/** Price in force for a period: the latest price whose effective period is on or before it. */
export function priceForPeriod(prices: SharePrice[], period: Period): Minor {
  if (prices.length === 0) throw new Error("No share price configured");
  const sorted = [...prices].sort((a, b) => a.effectivePeriod.localeCompare(b.effectivePeriod));
  let price = sorted[0].priceMinor;
  for (const p of sorted) {
    if (p.effectivePeriod <= period) price = p.priceMinor;
    else break;
  }
  return price;
}

export function currentPrice(prices: SharePrice[]): Minor {
  const sorted = [...prices].sort((a, b) => b.effectivePeriod.localeCompare(a.effectivePeriod));
  if (!sorted.length) throw new Error("No share price configured");
  return sorted[0].priceMinor;
}

/** Micro-shares bought by the savings portion of a contribution (after the welfare premium). */
export function microSharesFor(netSavingsMinor: Minor, priceMinor: Minor): number {
  if (netSavingsMinor <= 0 || priceMinor <= 0) return 0;
  return Math.floor((netSavingsMinor * MICRO) / priceMinor);
}

export function sharesValueMinor(microShares: number, priceMinor: Minor): Minor {
  return Math.round((microShares * priceMinor) / MICRO);
}

export function formatShares(microShares: number, digits = 2): string {
  return (microShares / MICRO).toLocaleString("en", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
