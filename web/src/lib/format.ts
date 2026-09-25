import { formatMoney } from "../../../shared/money";

export { formatMoney, toMinor } from "../../../shared/money";
export { formatPeriod } from "../../../shared/period";
export { formatShares } from "../../../shared/domain/shares";

export const money = (minor: number | null | undefined, currency: string, compact = false) => formatMoney(minor ?? 0, currency, { compact });

export function formatDate(d: string | Date | null | undefined, withTime = false): string {
  if (!d) return "—";
  const date = typeof d === "string" && d.length === 10 ? new Date(`${d}T00:00:00Z`) : new Date(d);
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : { timeZone: "UTC" }),
  });
}

export function timeAgo(d: string | Date): string {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return formatDate(d);
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
