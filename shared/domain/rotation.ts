import { addMonthsToDate } from "../period";

/**
 * Merry-go-round (ROSCA / susu / chama): every round, each member pays the same
 * amount and one member takes the whole pot. After N rounds everyone has paid in
 * and received exactly the same total.
 */

export const FREQUENCIES = ["weekly", "biweekly", "monthly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABELS: Record<Frequency, string> = { weekly: "Every week", biweekly: "Every 2 weeks", monthly: "Every month" };

export interface CircleMember {
  id: string;
  name: string;
  phone?: string;
}

export interface Round {
  index: number;
  date: string;
  recipientId: string;
  potMinor: number;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function roundDate(start: string, frequency: Frequency, index: number): string {
  if (frequency === "monthly") return addMonthsToDate(start, index);
  return addDays(start, index * (frequency === "weekly" ? 7 : 14));
}

export function buildSchedule(input: { startDate: string; frequency: Frequency; amountMinor: number; order: string[] }): Round[] {
  const pot = input.amountMinor * input.order.length;
  return input.order.map((recipientId, index) => ({ index, date: roundDate(input.startDate, input.frequency, index), recipientId, potMinor: pot }));
}

/** Index of the current (first not-yet-past) round, or `rounds` when the circle has finished. */
export function currentRoundIndex(schedule: Round[], today: string): number {
  const i = schedule.findIndex((r) => r.date >= today);
  return i === -1 ? schedule.length : i;
}

export interface RoundProgress {
  paid: number;
  expected: number;
  collectedMinor: number;
  complete: boolean;
}

/** Everyone except the recipient pays into the pot each round (the recipient's own share nets off). */
export function roundProgress(round: Round, memberIds: string[], paidIds: string[], amountMinor: number): RoundProgress {
  const payers = memberIds.filter((id) => id !== round.recipientId);
  const paid = payers.filter((id) => paidIds.includes(id)).length;
  return { paid, expected: payers.length, collectedMinor: paid * amountMinor, complete: paid === payers.length };
}

/** Unbiased Fisher–Yates shuffle using an injectable random source. */
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** iCalendar file with one all-day event per payout, so members can add the dates to their phones. */
export function toIcs(input: { name: string; currencyLabel: (m: number) => string; schedule: Round[]; members: CircleMember[]; url?: string }): string {
  const byId = new Map(input.members.map((m) => [m.id, m.name]));
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Fundly//Merry-go-round//EN", "CALSCALE:GREGORIAN"];
  for (const r of input.schedule) {
    const d = r.date.replace(/-/g, "");
    const next = addDays(r.date, 1).replace(/-/g, "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${input.name.replace(/\W+/g, "-")}-${r.index}-${d}@fundly`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d}`,
      `DTEND;VALUE=DATE:${next}`,
      `SUMMARY:${esc(`${input.name}: ${byId.get(r.recipientId) ?? "?"} receives ${input.currencyLabel(r.potMinor)}`)}`,
      `DESCRIPTION:${esc(`Round ${r.index + 1} of ${input.schedule.length}.${input.url ? ` ${input.url}` : ""}`)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
