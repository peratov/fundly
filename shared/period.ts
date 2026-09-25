/**
 * A contribution period is a calendar month encoded as "YYYY-MM".
 * The string form sorts chronologically, which keeps DB indexes and comparisons simple.
 */

export type Period = string;

export const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function toPeriod(year: number, month: number): Period {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function periodOf(date: Date | string): Period {
  const d = typeof date === "string" ? new Date(date) : date;
  return toPeriod(d.getUTCFullYear(), d.getUTCMonth() + 1);
}

export function parsePeriod(p: Period): { year: number; month: number } {
  if (!PERIOD_RE.test(p)) throw new Error(`Invalid period: ${p}`);
  return { year: Number(p.slice(0, 4)), month: Number(p.slice(5, 7)) };
}

export function addMonths(p: Period, n: number): Period {
  const { year, month } = parsePeriod(p);
  const idx = year * 12 + (month - 1) + n;
  return toPeriod(Math.floor(idx / 12), (idx % 12) + 1);
}

/** Inclusive list of periods from `from` to `to`. */
export function periodRange(from: Period, to: Period): Period[] {
  const out: Period[] = [];
  for (let p = from; p <= to; p = addMonths(p, 1)) out.push(p);
  return out;
}

export function monthsBetween(from: Date | string, to: Date | string): number {
  const a = typeof from === "string" ? new Date(from) : from;
  const b = typeof to === "string" ? new Date(to) : to;
  const months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  return b.getUTCDate() < a.getUTCDate() ? months - 1 : months;
}

export function formatPeriod(p: Period, style: "short" | "long" = "short"): string {
  const { year, month } = parsePeriod(p);
  const name = new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en", { month: style, timeZone: "UTC" });
  return `${name} ${year}`;
}

export function isoDate(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function addMonthsToDate(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return isoDate(d);
}
