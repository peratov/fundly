import { CheckCircle2, XCircle } from "lucide-react";
import { scoreBand, type CreditScore, type Eligibility } from "../../../shared/domain/members";
import { formatBps } from "../../../shared/money";
import { formatDate, formatPeriod, money } from "../lib/format";
import type { Contribution, Loan } from "../lib/types";
import { Card, clsx, EmptyState, ProgressBar, StatusBadge, Table, Td, Th, Tr } from "./ui";

export function ScoreCard({ score, title = "Credit score" }: { score: CreditScore; title?: string }) {
  const band = scoreBand(score.total);
  return (
    <Card title={title}>
      <div className="flex items-end gap-3">
        <p className="num text-4xl font-semibold tracking-tight">{score.total}</p>
        <p className="pb-1 text-sm text-slate-500">/ 1000</p>
        <span className={clsx("mb-1 ml-auto rounded-md px-2 py-0.5 text-xs font-semibold", band.tone === "good" ? "bg-emerald-50 text-emerald-700" : band.tone === "ok" ? "bg-amber-50 text-amber-800" : "bg-rose-50 text-rose-700")}>
          {band.label}
        </span>
      </div>
      <ul className="mt-5 space-y-3">
        {score.pillars.map((p) => (
          <li key={p.key}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">{p.label}</span>
              <span className="num text-slate-500">
                {p.points}/{p.max}
              </span>
            </div>
            <ProgressBar value={p.points} max={p.max} tone={p.points / p.max >= 0.5 ? "brand" : p.points / p.max >= 0.25 ? "amber" : "red"} />
            <p className="mt-1 text-[11px] text-slate-500">{p.note}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function EligibilityList({ eligibility, currency }: { eligibility: Eligibility; currency: string }) {
  return (
    <div>
      <ul className="space-y-2">
        {eligibility.checks.map((c) => (
          <li key={c.label} className="flex items-start gap-2 text-sm">
            {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-rose-500" />}
            <span>
              <span className="font-medium">{c.label}</span> <span className="text-slate-500">— {c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm">
        Borrowing limit: <span className="num font-semibold">{money(eligibility.limitMinor, currency)}</span>
      </p>
    </div>
  );
}

export function ContributionHistory({ items, currency, onEdit }: { items: Contribution[]; currency: string; onEdit?: (c: Contribution) => void }) {
  const rows = [...items].sort((a, b) => b.period.localeCompare(a.period));
  if (!rows.length) return <EmptyState title="No contributions yet" />;
  return (
    <Table>
      <thead>
        <tr>
          <Th>Month</Th>
          <Th>Status</Th>
          <Th right>Amount</Th>
          <Th right>Welfare</Th>
          <Th right>Savings</Th>
          <Th>Paid on</Th>
          <Th>Method</Th>
          {onEdit && <Th />}
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <Tr key={c.id}>
            <Td className="font-medium">{formatPeriod(c.period)}</Td>
            <Td>
              <StatusBadge status={c.status} />
            </Td>
            <Td right>{money(c.amountMinor, currency)}</Td>
            <Td right>{money(c.premiumMinor, currency)}</Td>
            <Td right>{money(c.amountMinor - c.premiumMinor, currency)}</Td>
            <Td>{formatDate(c.paidOn)}</Td>
            <Td className="capitalize">{c.method ?? "—"}</Td>
            {onEdit && (
              <Td>
                <button type="button" className="inline-flex min-h-9 items-center rounded-md px-2 text-xs font-medium text-brand-700 hover:bg-brand-50 sm:min-h-0 sm:px-0 sm:hover:bg-transparent sm:hover:underline dark:hover:bg-white/5" onClick={() => onEdit(c)}>
                  Correct
                </button>
              </Td>
            )}
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

export function LoanSummary({ loan, currency }: { loan: Loan; currency: string }) {
  const paid = loan.paidPrincipalMinor + loan.paidInterestMinor + loan.paidPenaltyMinor;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">{loan.productName}</p>
        <span className="text-xs text-slate-500">{loan.ref}</span>
        <StatusBadge status={loan.status} />
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {money(loan.principalMinor, currency)} at {formatBps(loan.rateBps)} p.a. over {loan.termMonths} months · {loan.purpose}
      </p>
      {loan.disbursedOn && (
        <div className="mt-3">
          <ProgressBar value={paid} max={loan.totalRepayableMinor} tone={loan.status === "overdue" || loan.status === "defaulted" ? "red" : "brand"} />
          <div className="mt-1 flex justify-between text-xs text-slate-500">
            <span>
              Paid {money(paid, currency)} of {money(loan.totalRepayableMinor, currency)}
            </span>
            <span className="num font-medium text-slate-700 dark:text-slate-300">Balance {money(loan.balance.totalMinor, currency)}</span>
          </div>
          {loan.arrearsMinor > 0 && <p className="mt-1 text-xs font-medium text-rose-600">{money(loan.arrearsMinor, currency)} behind schedule</p>}
        </div>
      )}
    </div>
  );
}

export function ScheduleTable({ loan, currency }: { loan: Loan; currency: string }) {
  if (!loan.schedule.length) return <p className="text-sm text-slate-500">The schedule starts once the loan is disbursed.</p>;
  let paid = loan.paidPrincipalMinor + loan.paidInterestMinor;
  return (
    <Table stack={false}>
      <thead>
        <tr>
          <Th>#</Th>
          <Th>Due</Th>
          <Th right>Principal</Th>
          <Th right>Interest</Th>
          <Th right>Instalment</Th>
          <Th>Status</Th>
        </tr>
      </thead>
      <tbody>
        {loan.schedule.map((r) => {
          const covered = paid >= r.installmentMinor;
          paid = Math.max(0, paid - r.installmentMinor);
          const late = !covered && r.dueOn < new Date().toISOString().slice(0, 10);
          return (
            <Tr key={r.n}>
              <Td>{r.n}</Td>
              <Td>{formatDate(r.dueOn)}</Td>
              <Td right>{money(r.principalMinor, currency)}</Td>
              <Td right>{money(r.interestMinor, currency)}</Td>
              <Td right className="font-medium">
                {money(r.installmentMinor, currency)}
              </Td>
              <Td>{covered ? <StatusBadge status="repaid" /> : late ? <StatusBadge status="overdue" /> : <span className="text-xs text-slate-400">Upcoming</span>}</Td>
            </Tr>
          );
        })}
      </tbody>
    </Table>
  );
}
