/**
 * Money is always handled as integer minor units (pesewas, cents, kobo).
 * Floats are only used at the edges: parsing user input and formatting output.
 */

export type Minor = number;

export function toMinor(major: number | string): Minor {
  const n = typeof major === "string" ? Number(major.replace(/,/g, "")) : major;
  if (!Number.isFinite(n)) throw new Error(`Invalid amount: ${major}`);
  return Math.round(n * 100);
}

export function toMajor(minor: Minor): number {
  return minor / 100;
}

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(minor: Minor, currency = "GHS", opts: { compact?: boolean } = {}): string {
  const key = `${currency}:${opts.compact ? "c" : "f"}`;
  let fmt = formatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      notation: opts.compact ? "compact" : "standard",
      minimumFractionDigits: opts.compact ? 0 : 2,
      maximumFractionDigits: opts.compact ? 1 : 2,
    });
    formatters.set(key, fmt);
  }
  return fmt.format(minor / 100).replace(/ /g, " ");
}

/** Split `total` into `parts` integers that sum exactly to `total`; remainder goes to the last part. */
export function splitEvenly(total: Minor, parts: number): Minor[] {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  const out = Array.from({ length: parts }, () => base);
  out[parts - 1] += total - base * parts;
  return out;
}

/** Basis points helper: 1000 bps = 10%. */
export function applyBps(amount: Minor, bps: number): Minor {
  return Math.round((amount * bps) / 10_000);
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}
