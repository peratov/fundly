import { CalendarCheck, Flame, HandCoins, HeartPulse, History, PiggyBank, Smartphone, TrendingUp, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { LoanSummary } from "../../components/finance";
import { ActionTile, PortalStat, ScoreRing } from "../../components/portal";
import { Card, clsx, Loading, StatusBadge } from "../../components/ui";
import { formatPeriod, formatShares, money } from "../../lib/format";
import { useFundQuery } from "../../lib/hooks";
import { CountUp } from "../../lib/motion";
import { useFund } from "../../lib/session";
import type { PortalData } from "../../lib/types";
import { PayModal } from "./PayModal";

export function usePortal() {
  return useFundQuery<PortalData>(["me"], "/me");
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function Portal() {
  const { currency, fund } = useFund();
  const { data, isLoading } = usePortal();
  const [params, setParams] = useSearchParams();
  const [paying, setPaying] = useState<null | "dues" | string>(null);
  // Arriving from the mobile tab bar's "Pay" button.
  useEffect(() => {
    if (params.get("pay") && data) {
      const open = data.loans.find((l) => ["active", "overdue", "defaulted"].includes(l.status));
      setPaying(data.duePeriods.length ? "dues" : open ? open.id : null);
      setParams({}, { replace: true });
    }
  }, [params, data, setParams]);
  if (isLoading || !data) return <Loading />;
  const { totals, member } = data;
  const m = (v: number) => money(v, currency);
  const openLoan = data.loans.find((l) => ["active", "overdue", "defaulted"].includes(l.status));
  const pendingLoan = data.loans.find((l) => l.status.startsWith("pending"));
  const sorted = [...data.contributions].sort((a, b) => b.period.localeCompare(a.period));
  const last12 = sorted.slice(0, 12).reverse();
  let streak = 0;
  for (const c of sorted) {
    if (c.status === "missed") break;
    streak++;
  }

  return (
    <>
      {/* Hero */}
      <section className="bg-noise relative mb-6 overflow-hidden rounded-[2rem] bg-ink-950 p-6 text-white shadow-xl sm:p-8">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -top-24 -left-16 size-80 animate-aurora rounded-full bg-brand-500/50 blur-[90px]" />
          <div className="absolute -right-10 -bottom-24 size-80 animate-aurora-slow rounded-full bg-coral-500/40 blur-[90px]" />
          <div className="absolute top-0 right-1/3 size-64 animate-aurora rounded-full bg-grape-600/40 blur-[90px]" />
        </div>
        <div className="relative grid items-center gap-8 md:grid-cols-[1fr_auto]">
          <div>
            <p className="text-sm text-white/70">
              {greeting()}, <span className="font-semibold text-white">{member.name.split(" ")[0]}</span> · {fund?.shortName || fund?.name}
            </p>
            <p className="mt-5 text-xs font-semibold tracking-[0.2em] text-white/50 uppercase">Your savings</p>
            <p className="mt-1 font-display text-5xl font-extrabold tracking-tight sm:text-6xl">
              <CountUp value={totals.savingsMinor} format={(n) => money(Math.round(n), currency)} duration={1200} />
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15">
                <TrendingUp className="size-3.5 text-brand-300" /> {formatShares(totals.microShares)} shares · {m(totals.shareValueMinor)}
              </span>
              <StatusBadge status={member.standing} />
              {streak >= 3 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-coral-500 to-sun-400 px-3 py-1 text-xs font-bold text-ink-950">
                  <Flame className="size-3.5" /> {streak}-month streak
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4 md:flex-col">
            <ScoreRing score={data.score.total} light />
            <p className="max-w-[9rem] text-xs text-white/60 md:text-center">
              Credit score · borrow up to <span className="font-semibold text-white">{m(data.eligibility.limitMinor)}</span>
            </p>
          </div>
        </div>

        {data.duePeriods.length > 0 && (
          <div className="relative mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur">
            <CalendarCheck className="size-5 text-sun-300" />
            {/* The text keeps a readable width; on narrow phones the button drops to its own full-width row. */}
            <div className="min-w-[11rem] flex-1 text-sm">
              <p className="font-semibold">Due: {data.duePeriods.map((p) => formatPeriod(p)).join(", ")}</p>
              <p className="text-white/60">Minimum {m(data.minContributionMinor)} per month</p>
            </div>
            <button onClick={() => setPaying("dues")} className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl sm:w-auto bg-gradient-to-r from-coral-500 to-sun-400 px-5 py-2.5 text-sm font-bold text-ink-950 shadow-lg shadow-coral-500/30 transition hover:scale-[1.03]">
              <span className="absolute inset-y-0 left-0 w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-white/50 to-transparent" />
              <Smartphone className="relative size-4" /> <span className="relative">Pay with MoMo</span>
            </button>
          </div>
        )}
      </section>

      {data.pendingPayments.length > 0 && (
        <p className="mb-4 flex items-center gap-2 rounded-2xl bg-sun-400/15 px-4 py-3 text-sm font-medium text-amber-800 ring-1 ring-sun-400/40 dark:text-sun-300">
          <Smartphone className="size-4" /> {data.pendingPayments.length} payment(s) waiting for your approval on your phone.
        </p>
      )}

      {/* Quick actions */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {data.duePeriods.length ? (
          <ActionTile icon={<Wallet />} label="Pay dues" hint="Mobile money, in seconds" tone="coral" onClick={() => setPaying("dues")} />
        ) : (
          <ActionTile icon={<Wallet />} label="All paid up" hint="Nothing due right now" tone="coral" to="history" />
        )}
        <ActionTile icon={<HandCoins />} label="Borrow" hint={data.eligibility.eligible ? `Up to ${m(data.eligibility.limitMinor)}` : "See how to qualify"} tone="grape" to="loans" />
        <ActionTile icon={<HeartPulse />} label="Welfare" hint={`${data.welfare.package.name} cover`} tone="rose" to="welfare" />
        <ActionTile icon={<History />} label="History" hint={`${totals.paidPeriods} months paid`} tone="sun" to="history" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <PortalStat icon={<PiggyBank />} tone="teal" label="Total put in" value={m(totals.totalContributedMinor)} hint={`${m(totals.welfarePremiumsMinor)} to welfare`} />
        <PortalStat icon={<TrendingUp />} tone="grape" label="Share value" value={m(totals.shareValueMinor)} hint={`at ${m(totals.sharePriceMinor)} / share`} />
        <PortalStat icon={<HandCoins />} tone="coral" label="Loan balance" value={m(totals.loanBalanceMinor)} hint={openLoan ? openLoan.ref : "No active loan"} />
        <PortalStat icon={<Flame />} tone="sun" label="Months paid" value={totals.paidPeriods} hint={totals.missedPeriods ? `${totals.missedPeriods} missed` : "Never missed one"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="My loan" className="rounded-3xl" actions={<Link to="loans" className="text-xs font-semibold text-grape-600">All loans →</Link>}>
          {openLoan ? (
            <>
              <LoanSummary loan={openLoan} currency={currency} />
              <button onClick={() => setPaying(openLoan.id)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-grape-500 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-grape-500/25 transition hover:scale-[1.02]">
                <Smartphone className="size-4" /> Make a repayment
              </button>
            </>
          ) : pendingLoan ? (
            <LoanSummary loan={pendingLoan} currency={currency} />
          ) : (
            <div className="flex items-center gap-4">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-grape-500/10 text-grape-600">
                <HandCoins className="size-6" />
              </span>
              <div className="text-sm">
                <p className="font-medium">No active loan.</p>
                <Link to="loans" className="font-semibold text-grape-600">
                  {data.eligibility.eligible ? `Apply for up to ${m(data.eligibility.limitMinor)} →` : "See what you need to qualify →"}
                </Link>
              </div>
            </div>
          )}
        </Card>

        <Card title="Last 12 months" className="rounded-3xl" actions={<Link to="history" className="text-xs font-semibold text-brand-700">Full history →</Link>}>
          <div className="flex items-end gap-1.5">
            {last12.map((c, i) => {
              const h = c.status === "missed" ? 18 : Math.max(30, Math.min(100, (c.amountMinor / Math.max(1, data.minContributionMinor * 3)) * 100));
              return (
                <div key={c.id} className="group flex flex-1 flex-col items-center gap-1.5">
                  <div className="relative flex h-24 w-full items-end">
                    <div
                      title={`${formatPeriod(c.period)}: ${c.status === "missed" ? "missed" : m(c.amountMinor)}`}
                      className={clsx("w-full origin-bottom animate-rise rounded-lg transition group-hover:brightness-110", c.status === "missed" ? "bg-rose-300 dark:bg-rose-500/60" : c.status === "late" ? "bg-gradient-to-t from-sun-500 to-sun-300" : "bg-gradient-to-t from-brand-600 to-brand-300")}
                      style={{ height: `${h}%`, animationDelay: `${i * 50}ms` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400">{formatPeriod(c.period).slice(0, 3)}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded bg-brand-500" /> On time
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded bg-sun-400" /> Late
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded bg-rose-300" /> Missed
            </span>
          </div>
        </Card>
      </div>

      {paying === "dues" && <PayModal target={{ kind: "dues", periods: data.duePeriods, minMinor: data.minContributionMinor }} phone={member.phone} simulated={data.simulatedPayments} onClose={() => setPaying(null)} />}
      {paying && paying !== "dues" && openLoan && (
        <PayModal
          target={{ kind: "loan", loanId: openLoan.id, ref: openLoan.ref, balanceMinor: openLoan.balance.totalMinor, suggestedMinor: Math.min(openLoan.balance.totalMinor, Math.max(openLoan.arrearsMinor, openLoan.schedule[0]?.installmentMinor ?? 0)) }}
          phone={member.phone}
          simulated={data.simulatedPayments}
          onClose={() => setPaying(null)}
        />
      )}
    </>
  );
}
