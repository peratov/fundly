import { AlertTriangle, ArrowRight, Gavel, HeartPulse, Smartphone } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, Loading, PageHeader, ProgressBar, Stat } from "../../components/ui";
import { useFundQuery } from "../../lib/hooks";
import { formatPeriod, money, timeAgo } from "../../lib/format";
import { useFund } from "../../lib/session";
import type { AuditEvent } from "../../lib/types";

interface OverviewData {
  period: string;
  balances: Record<string, number>;
  members: { active: number; behind: number; voided: number };
  thisMonth: { paidCount: number; collectedMinor: number; expectedCount: number };
  trend: { period: string; label: string; collectedMinor: number; paid: number; missed: number }[];
  queues: { pendingCommittee: number; pendingManager: number; overdue: number; activeLoans: number; pendingClaims: number; unallocatedPayments: number };
  activity: AuditEvent[];
}

export default function Overview() {
  const { fund, currency, can } = useFund();
  const { data, isLoading } = useFundQuery<OverviewData>(["overview"], "/overview");
  if (isLoading || !data) return <Loading />;
  const b = data.balances;
  const m = (v: number | undefined) => money(v ?? 0, currency);
  const collectionPct = data.thisMonth.expectedCount ? Math.round((data.thisMonth.paidCount / data.thisMonth.expectedCount) * 100) : 0;
  const q = data.queues;

  return (
    <>
      <PageHeader title={fund?.name ?? "Overview"} subtitle={`Position as of today · ${formatPeriod(data.period, "long")}`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cash on hand" value={m(b.cash)} hint="Available to lend or pay out" />
        <Stat label="Member savings" value={m(b.member_savings)} hint={`${data.members.active} active members`} />
        <Stat label="Loans outstanding" value={m(b.loans_receivable)} hint={`${q.activeLoans + q.overdue} open loans`} tone={q.overdue ? "warn" : undefined} />
        <Stat label="Welfare reserve" value={m(b.welfare_reserve)} hint="Ring-fenced for claims" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Contributions collected — last 12 months" className="lg:col-span-2">
          <div className="h-64" role="img" aria-label="Bar chart of contributions collected per month">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke="currentColor" className="text-slate-200 dark:text-slate-800" />
                <XAxis dataKey="period" tickFormatter={(p: string) => formatPeriod(p).slice(0, 3)} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis tickFormatter={(v: number) => money(v, currency, true).replace(`${currency} `, "")} tickLine={false} axisLine={false} width={48} tick={{ fontSize: 11, fill: "#64748b" }} />
                <Tooltip
                  cursor={{ fill: "rgba(148,163,184,0.12)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0].payload as OverviewData["trend"][number];
                    return (
                      <div className="rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
                        <p className="font-semibold text-slate-900 dark:text-white">{row.label}</p>
                        <p className="num mt-1 text-slate-700 dark:text-slate-200">{money(row.collectedMinor, currency)}</p>
                        <p className="text-slate-500">
                          {row.paid} paid · {row.missed} missed
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="collectedMinor" fill="#0d9488" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="This month">
          <p className="num text-3xl font-semibold tracking-tight">{m(data.thisMonth.collectedMinor)}</p>
          <p className="mt-1 text-sm text-slate-500">
            {data.thisMonth.paidCount} of {data.thisMonth.expectedCount} members paid ({collectionPct}%)
          </p>
          <div className="mt-3">
            <ProgressBar value={data.thisMonth.paidCount} max={data.thisMonth.expectedCount} />
          </div>
          <dl className="mt-5 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Behind on dues</dt>
              <dd className="font-medium text-amber-600">{data.members.behind}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Voided</dt>
              <dd className="font-medium text-rose-600">{data.members.voided}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Interest earned (all time)</dt>
              <dd className="num font-medium">{m(b.interest_income)}</dd>
            </div>
          </dl>
          {can("contributions:write") && (
            <Link to="../contributions" relative="path" className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-brand-700">
              Record contributions <ArrowRight className="size-4" />
            </Link>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Needs attention" className="lg:col-span-1" padded={false}>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            <Queue to="../loans?status=pending_committee" icon={<Gavel />} label="Loans awaiting committee" n={q.pendingCommittee} />
            <Queue to="../loans?status=pending_manager" icon={<Gavel />} label="Loans awaiting decision" n={q.pendingManager} />
            <Queue to="../loans?status=overdue,defaulted" icon={<AlertTriangle />} label="Overdue or defaulted loans" n={q.overdue} bad />
            <Queue to="../claims" icon={<HeartPulse />} label="Welfare claims pending" n={q.pendingClaims} />
            <Queue to="../payments" icon={<Smartphone />} label="Payments needing allocation" n={q.unallocatedPayments} bad />
          </ul>
        </Card>
        <Card title="Recent activity" className="lg:col-span-2" padded={false} actions={can("audit:read") || can("members:write") ? <Link to="../audit" relative="path" className="text-xs font-medium text-brand-700">View audit log</Link> : undefined}>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.activity.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-4 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-slate-800 dark:text-slate-200">{a.summary}</p>
                  <p className="text-xs text-slate-500">{a.actorName}</p>
                </div>
                <span className="shrink-0 text-xs text-slate-400">{timeAgo(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

function Queue({ to, icon, label, n, bad }: { to: string; icon: ReactNode; label: string; n: number; bad?: boolean }) {
  return (
    <li>
      <Link to={to} relative="path" className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 [&>svg]:size-4 [&>svg]:text-slate-400">
        {icon}
        <span className="flex-1 text-slate-700 dark:text-slate-300">{label}</span>
        <span className={`num rounded-md px-2 py-0.5 text-xs font-semibold ${n ? (bad ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800") : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>{n}</span>
      </Link>
    </li>
  );
}
