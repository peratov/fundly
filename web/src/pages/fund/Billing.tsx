import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, CreditCard, Gem, Infinity as InfinityIcon, Rocket, ShieldCheck, Smartphone, Sparkles, Users } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { PLANS, type BillingInterval, type PaidPlanId, type PlanId } from "../../../../shared/plans";
import { Badge, Button, Card, clsx, ErrorText, Loading, Modal, PageHeader, StatusBadge, Table, Td, Th, Tr, useToast } from "../../components/ui";
import { api } from "../../lib/api";
import { formatDate, money } from "../../lib/format";
import { useFundQuery } from "../../lib/hooks";
import { Confetti } from "../../lib/motion";
import { useFund } from "../../lib/session";

type Price = { amountMinor: number; currency: string; months: number };
interface BillingData {
  plan: PlanId;
  planExpiresAt: string | null;
  daysLeft: number | null;
  inGrace: boolean;
  graceEndsOn: string | null;
  usage: { members: number; limit: number | null };
  prices: Record<PaidPlanId, Record<BillingInterval, Price>>;
  history: { id: string; reference: string; plan: PaidPlanId; interval: BillingInterval; months: number; amountMinor: number; currency: string; status: string; paidThrough: string | null; createdAt: string }[];
  simulated: boolean;
}
interface Checkout {
  reference: string;
  url: string | null;
  simulated: boolean;
  amountMinor: number;
  currency: string;
}

const RANK: Record<PlanId, number> = { free: 0, growth: 1, pro: 2 };
const ICONS: Record<PlanId, ReactNode> = { free: <Users />, growth: <Rocket />, pro: <InfinityIcon /> };
const ACCENT: Record<PlanId, string> = { free: "from-slate-400 to-slate-600", growth: "from-brand-400 to-grape-600", pro: "from-coral-500 to-sun-400" };

export default function Billing() {
  const { base } = useFund();
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [interval, setInterval] = useState<BillingInterval>("year");
  const [checkout, setCheckout] = useState<(Checkout & { plan: PaidPlanId }) | null>(null);
  const [celebrate, setCelebrate] = useState<PlanId | null>(null);
  const { data, isLoading, refetch } = useFundQuery<BillingData>(["billing"], "/billing");

  const refresh = async () => {
    await Promise.all([refetch(), qc.invalidateQueries({ queryKey: ["me"] })]);
  };

  const start = useMutation({
    mutationFn: (plan: PaidPlanId) => api.post<Checkout>(`${base}/billing/checkout`, { plan, interval }).then((c) => ({ ...c, plan })),
    onSuccess: (c) => {
      if (c.url) window.location.href = c.url;
      else setCheckout(c);
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  // Back from the hosted checkout: confirm with the gateway right away.
  const reference = params.get("reference");
  const verified = useRef(false);
  useEffect(() => {
    if (!reference || verified.current) return;
    verified.current = true;
    api
      .post<{ status: string; plan: PaidPlanId }>(`${base}/billing/verify`, { reference })
      .then(async (r) => {
        await refresh();
        if (r.status === "succeeded") setCelebrate(r.plan);
        else if (r.status === "failed") toast("That payment didn't go through. You haven't been charged for a plan.", "error");
        else toast("We're waiting for the payment to confirm. This page will update when it does.");
      })
      .catch((e) => toast((e as Error).message, "error"))
      .finally(() => setParams({}, { replace: true }));
  }, [reference]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !data) return <Loading />;

  return (
    <>
      <PageHeader title="Plan & billing" subtitle="Free forever for up to 25 members. Upgrade when your fund is ready for more." />

      <CurrentPlan data={data} />

      <div className="mt-10 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight">{data.plan === "free" ? "Ready to grow?" : "Change or extend your plan"}</h2>
          <p className="mt-1 text-sm text-slate-500">Prices in {data.prices.growth.month.currency}. Pay by mobile money or card. No contract; your plan simply runs until the date you've paid for.</p>
        </div>
        <IntervalToggle value={interval} onChange={setInterval} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {(["free", "growth", "pro"] as PlanId[]).map((id) => (
          <PlanCard
            key={id}
            id={id}
            current={data.plan}
            interval={interval}
            price={id === "free" ? null : data.prices[id][interval]}
            monthly={id === "free" ? null : data.prices[id].month}
            members={data.usage.members}
            busy={start.isPending && start.variables === id}
            onChoose={() => id !== "free" && start.mutate(id)}
          />
        ))}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Assurance icon={<ShieldCheck />} title="Your data is never held hostage">If a plan lapses you keep every record. After 7 days' grace the fund simply moves to Free.</Assurance>
        <Assurance icon={<Smartphone />} title="0% markup on collections">Members pay the mobile money provider's standard fee. AwaFund takes nothing on top.</Assurance>
        <Assurance icon={<CalendarClock />} title="Renew early, lose nothing">Paying before your plan ends adds the new time to what's left.</Assurance>
      </div>

      {data.history.length > 0 && (
        <Card title="Billing history" className="mt-10" padded={false}>
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Plan</Th>
                <Th right>Amount</Th>
                <Th>Status</Th>
                <Th>Paid through</Th>
                <Th>Reference</Th>
              </tr>
            </thead>
            <tbody>
              {data.history.map((h) => (
                <Tr key={h.id}>
                  <Td>{formatDate(h.createdAt)}</Td>
                  <Td>
                    {PLANS[h.plan].name} · {h.interval === "year" ? "1 year" : "1 month"}
                  </Td>
                  <Td right>{money(h.amountMinor, h.currency)}</Td>
                  <Td>
                    <StatusBadge status={h.status} />
                  </Td>
                  <Td>{h.paidThrough ? formatDate(h.paidThrough) : "—"}</Td>
                  <Td className="font-mono text-xs text-slate-500">{h.reference}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {checkout && (
        <SimulatedCheckout
          checkout={checkout}
          onClose={() => setCheckout(null)}
          onDone={async (status) => {
            setCheckout(null);
            await refresh();
            if (status === "succeeded") setCelebrate(checkout.plan);
            else toast("Payment declined. Your plan hasn't changed.", "error");
          }}
        />
      )}
      {celebrate && <Welcome plan={celebrate} onClose={() => setCelebrate(null)} />}
    </>
  );
}

function CurrentPlan({ data }: { data: BillingData }) {
  const plan = PLANS[data.plan];
  const { members, limit } = data.usage;
  const pct = limit ? Math.min(100, Math.round((members / limit) * 100)) : 100;
  const status =
    data.plan === "free"
      ? "Free forever. No card, no expiry."
      : !data.planExpiresAt
        ? "Active, managed by AwaFund."
        : data.inGrace
          ? `Ended ${formatDate(data.planExpiresAt)}. Renew by ${formatDate(data.graceEndsOn!)} to keep mobile money collection on.`
          : `Paid through ${formatDate(data.planExpiresAt)}${data.daysLeft !== null ? ` · ${data.daysLeft} day${data.daysLeft === 1 ? "" : "s"} left` : ""}.`;
  return (
    <section className="relative overflow-hidden rounded-3xl bg-ink-950 p-6 text-white shadow-2xl shadow-grape-500/10 sm:p-8">
      <div className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-grape-600/40 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-28 left-10 size-72 rounded-full bg-brand-500/30 blur-3xl" aria-hidden />
      <div className="relative grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold tracking-[0.2em] text-sun-300 uppercase">
            <Gem className="size-3.5" /> Your plan
          </p>
          <p className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{plan.name}</p>
          <p className={clsx("mt-2 text-sm", data.inGrace ? "text-amber-300" : "text-white/70")}>{status}</p>
          <ul className="mt-6 grid gap-2 text-sm sm:grid-cols-2">
            {[
              [plan.memberLimit === null ? "Unlimited members" : `Up to ${plan.memberLimit} members`, true],
              ["Mobile money collection in the app", plan.onlinePayments],
              ["AI credit assessments and reminders", plan.aiAssistant],
              ["Priority WhatsApp support", plan.prioritySupport],
            ].map(([label, on]) => (
              <li key={String(label)} className={clsx("flex items-center gap-2", on ? "text-white/90" : "text-white/35 line-through")}>
                <span className={clsx("flex size-5 items-center justify-center rounded-full", on ? "bg-brand-500/25 text-brand-300" : "bg-white/5 text-white/30")}>
                  <Check className="size-3" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col justify-center rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
          <p className="text-sm text-white/60">Members</p>
          <p className="mt-1 font-display text-4xl font-extrabold">
            {members}
            <span className="text-xl font-bold text-white/40"> / {limit ?? "∞"}</span>
          </p>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/10">
            <div className={clsx("h-full rounded-full bg-gradient-to-r transition-all duration-1000", pct >= 100 ? "from-coral-500 to-rose-500" : pct >= 80 ? "from-sun-400 to-coral-500" : "from-brand-400 to-grape-500")} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-3 text-xs text-white/50">
            {limit === null ? "No limit on Pro." : members >= limit ? "Every spot is taken. Upgrade to add more members." : `${limit - members} spot${limit - members === 1 ? "" : "s"} left on ${plan.name}.`}
          </p>
        </div>
      </div>
    </section>
  );
}

function IntervalToggle({ value, onChange }: { value: BillingInterval; onChange: (v: BillingInterval) => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-white p-1 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800" role="radiogroup" aria-label="Billing period">
      {(["month", "year"] as BillingInterval[]).map((v) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={clsx("flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition", value === v ? "bg-ink-950 text-white dark:bg-white dark:text-ink-950" : "text-slate-500")}
        >
          {v === "month" ? "Monthly" : "Yearly"}
          {v === "year" && <span className="rounded-full bg-sun-400 px-2 py-0.5 text-[10px] text-ink-950">2 months free</span>}
        </button>
      ))}
    </div>
  );
}

function PlanCard({ id, current, interval, price, monthly, members, busy, onChoose }: { id: PlanId; current: PlanId; interval: BillingInterval; price: Price | null; monthly: Price | null; members: number; busy: boolean; onChoose: () => void }) {
  const plan = PLANS[id];
  const isCurrent = id === current;
  const tooSmall = plan.memberLimit !== null && members > plan.memberLimit;
  const featured = id === "growth";
  const label = id === "free" ? (isCurrent ? "Your plan" : "Included free") : tooSmall ? `For up to ${plan.memberLimit} members` : isCurrent ? "Extend" : RANK[id] > RANK[current] ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`;
  return (
    <div className={clsx("relative flex flex-col rounded-3xl bg-white p-6 ring-1 transition dark:bg-slate-900", featured ? "shadow-xl shadow-grape-500/10 ring-2 ring-grape-400" : "ring-slate-200 dark:ring-slate-800", isCurrent && "ring-2 ring-brand-500")}>
      {featured && !isCurrent && <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-r from-brand-500 to-grape-600 px-3 py-1 text-xs font-bold text-white">Most popular</span>}
      {isCurrent && <span className="absolute -top-3 left-6 rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white">Current plan</span>}
      <div className="flex items-center gap-3">
        <span className={clsx("flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br text-white [&>svg]:size-5", ACCENT[id])}>{ICONS[id]}</span>
        <div>
          <p className="font-display text-xl font-bold">{plan.name}</p>
          <p className="text-xs text-slate-500">{plan.tagline}</p>
        </div>
      </div>
      <div className="mt-6 min-h-[4.5rem]">
        {price ? (
          <>
            <p className="flex items-end gap-1">
              <span key={`${id}${interval}`} className="animate-pop font-display text-4xl font-extrabold tracking-tight">
                {money(interval === "year" ? Math.round(price.amountMinor / 12) : price.amountMinor, price.currency)}
              </span>
              <span className="pb-1.5 text-sm text-slate-500">/month</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {interval === "year" ? (
                <>
                  {money(price.amountMinor, price.currency)} billed yearly · <span className="font-semibold text-emerald-600">save {money(monthly!.amountMinor * 2, price.currency)}</span>
                </>
              ) : (
                "Billed monthly"
              )}
            </p>
          </>
        ) : (
          <>
            <p className="font-display text-4xl font-extrabold tracking-tight">Free</p>
            <p className="mt-1 text-xs text-slate-500">Forever, for up to 25 members</p>
          </>
        )}
      </div>
      <ul className="mt-5 flex-1 space-y-2 text-sm">
        {plan.highlights.map((h) => (
          <li key={h} className="flex gap-2 text-slate-700 dark:text-slate-300">
            <Check className="mt-0.5 size-4 shrink-0 text-brand-600" /> {h}
          </li>
        ))}
      </ul>
      <Button className="mt-6 w-full justify-center" variant={featured && !isCurrent ? "primary" : "secondary"} disabled={id === "free" || tooSmall} loading={busy} onClick={onChoose} icon={id !== "free" && !tooSmall ? <CreditCard className="size-4" /> : undefined}>
        {label}
      </Button>
    </div>
  );
}

function Assurance({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <span className="mt-0.5 text-brand-600 [&>svg]:size-5">{icon}</span>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{children}</p>
      </div>
    </div>
  );
}

/** Development stand-in for the gateway's hosted checkout page. */
function SimulatedCheckout({ checkout, onClose, onDone }: { checkout: Checkout & { plan: PaidPlanId }; onClose: () => void; onDone: (status: string) => void }) {
  const { base } = useFund();
  const pay = useMutation({
    mutationFn: (outcome: "succeeded" | "failed") => api.post<{ status: string }>(`${base}/billing/simulate`, { reference: checkout.reference, outcome }),
    onSuccess: (r) => onDone(r.status),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Checkout (simulator)"
      footer={
        <>
          <Button variant="secondary" loading={pay.isPending && pay.variables === "failed"} onClick={() => pay.mutate("failed")}>
            Decline
          </Button>
          <Button loading={pay.isPending && pay.variables === "succeeded"} onClick={() => pay.mutate("succeeded")}>
            Pay {money(checkout.amountMinor, checkout.currency)}
          </Button>
        </>
      }
    >
      <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
        <p className="text-sm text-slate-500">AwaFund {PLANS[checkout.plan].name}</p>
        <p className="mt-1 font-display text-3xl font-extrabold">{money(checkout.amountMinor, checkout.currency)}</p>
        <p className="mt-1 font-mono text-xs text-slate-400">{checkout.reference}</p>
      </div>
      <p className="mt-3 text-sm text-slate-500">Payments are running in simulator mode, so no money moves. With Paystack configured, owners are sent to Paystack's secure checkout to pay by mobile money or card.</p>
      <div className="mt-3">
        <ErrorText error={pay.error} />
      </div>
    </Modal>
  );
}

function Welcome({ plan, onClose }: { plan: PlanId; onClose: () => void }) {
  const info = PLANS[plan];
  return (
    <Modal open onClose={onClose} title={`Welcome to ${info.name}`} footer={<Button onClick={onClose}>Let's go</Button>}>
      <div className="relative overflow-hidden text-center">
        <Confetti pieces={48} />
        <span className={clsx("mx-auto flex size-16 items-center justify-center rounded-3xl bg-gradient-to-br text-white shadow-xl [&>svg]:size-8", ACCENT[plan])}>{ICONS[plan]}</span>
        <p className="mt-4 font-display text-2xl font-extrabold">Your fund just levelled up</p>
        <ul className="mx-auto mt-4 max-w-xs space-y-2 text-left text-sm">
          {info.highlights.slice(0, 4).map((h) => (
            <li key={h} className="flex gap-2">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-grape-500" /> {h}
            </li>
          ))}
        </ul>
        {info.onlinePayments && <Badge tone="green">Members can now pay dues from their phones</Badge>}
      </div>
    </Modal>
  );
}
