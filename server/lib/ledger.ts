import { and, eq, inArray, sql } from "drizzle-orm";
import { DEBIT_NORMAL, type Account } from "../../shared/enums";
import type { Db } from "../db/client";
import { journalEntries, journalLines } from "../db/schema";

export interface JournalLine {
  account: Account;
  debit?: number;
  credit?: number;
  membershipId?: string | null;
}

export interface JournalInput {
  tenantId: string;
  occurredOn: string;
  memo: string;
  sourceType: string;
  sourceId?: string | null;
  createdBy?: string | null;
  lines: JournalLine[];
}

/**
 * Post a balanced double-entry journal. Must be called inside the same
 * transaction as the business change it records, so the books and the
 * operational tables can never disagree.
 */
export async function postJournal(tx: Db, input: JournalInput): Promise<string> {
  const lines = input.lines.filter((l) => (l.debit ?? 0) !== 0 || (l.credit ?? 0) !== 0);
  const debits = lines.reduce((s, l) => s + (l.debit ?? 0), 0);
  const credits = lines.reduce((s, l) => s + (l.credit ?? 0), 0);
  if (debits !== credits) throw new Error(`Unbalanced journal "${input.memo}": debits ${debits} ≠ credits ${credits}`);
  if (lines.some((l) => (l.debit ?? 0) < 0 || (l.credit ?? 0) < 0)) throw new Error("Journal amounts must be positive");
  if (!lines.length) throw new Error("Journal has no lines");

  const [entry] = await tx
    .insert(journalEntries)
    .values({
      tenantId: input.tenantId,
      occurredOn: input.occurredOn,
      memo: input.memo,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      createdBy: input.createdBy ?? null,
    })
    .returning({ id: journalEntries.id });

  await tx.insert(journalLines).values(
    lines.map((l) => ({
      tenantId: input.tenantId,
      entryId: entry.id,
      account: l.account,
      membershipId: l.membershipId ?? null,
      debitMinor: l.debit ?? 0,
      creditMinor: l.credit ?? 0,
    })),
  );
  return entry.id;
}

/** Natural-sign balances per account (debit-normal accounts positive on debit). */
export async function accountBalances(
  db: Db,
  tenantId: string,
  range?: { from?: string; to?: string },
): Promise<Record<Account, number>> {
  const conds = [eq(journalLines.tenantId, tenantId)];
  if (range?.from) conds.push(sql`${journalEntries.occurredOn} >= ${range.from}`);
  if (range?.to) conds.push(sql`${journalEntries.occurredOn} <= ${range.to}`);
  const rows = await db
    .select({
      account: journalLines.account,
      debit: sql<string>`coalesce(sum(${journalLines.debitMinor}), 0)`,
      credit: sql<string>`coalesce(sum(${journalLines.creditMinor}), 0)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(and(...conds))
    .groupBy(journalLines.account);

  const out = {} as Record<Account, number>;
  for (const r of rows) {
    const d = Number(r.debit);
    const c = Number(r.credit);
    out[r.account as Account] = DEBIT_NORMAL.has(r.account as Account) ? d - c : c - d;
  }
  return out;
}

/**
 * Reverse whatever is currently booked against a source (e.g. a contribution being corrected).
 * Books are append-only: instead of deleting history we post an equal and opposite entry for
 * the *net* of all entries tied to the source, so repeated corrections stay consistent.
 */
export async function reverseJournalsFor(tx: Db, input: { tenantId: string; sourceId: string; occurredOn: string; memo: string; createdBy?: string | null }) {
  const rows = await tx
    .select({
      account: journalLines.account,
      membershipId: journalLines.membershipId,
      net: sql<string>`sum(${journalLines.debitMinor} - ${journalLines.creditMinor})`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(and(eq(journalEntries.tenantId, input.tenantId), inArray(journalEntries.sourceId, [input.sourceId])))
    .groupBy(journalLines.account, journalLines.membershipId);

  const lines: JournalLine[] = rows
    .map((r) => ({ ...r, net: Number(r.net) }))
    .filter((r) => r.net !== 0)
    .map((r) => ({ account: r.account as Account, membershipId: r.membershipId, debit: r.net < 0 ? -r.net : 0, credit: r.net > 0 ? r.net : 0 }));
  if (!lines.length) return;
  await postJournal(tx, {
    tenantId: input.tenantId,
    occurredOn: input.occurredOn,
    memo: input.memo,
    sourceType: "reversal",
    sourceId: input.sourceId,
    createdBy: input.createdBy,
    lines,
  });
}
