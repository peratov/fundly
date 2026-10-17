import { ArrowRight, Check, ChevronDown, Infinity as InfinityIcon, Minus, Rocket, ShieldCheck, Smartphone, Sparkles, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { PLANS, PRICE_CURRENCIES, priceFor, recommendPlan, type BillingInterval, type PlanId } from "../../../../../shared/plans";
import { clsx } from "../../../components/ui";
import { money } from "../../../lib/format";
import { Confetti, CountUp, Reveal } from "../../../lib/motion";

/*
 * The pricing section is a calculator, not a table: visitors drag in their member count,
 * say whether they want members paying by mobile money, and see exactly what they'd pay.
 * Every number comes from shared/plans.ts, the same source the server bills from.
 */

// Slider position (0-100) to members, with more travel where the plan boundaries are.
const FREE_AT = 40;
const GROWTH_AT = 75;
function toMembers(pos: number) {
  if (pos <= FREE_AT) return Math.round(2 + (pos / FREE_AT) * 23);
  if (pos <= GROWTH_AT) return Math.round(25 + ((pos - FREE_AT) / (GROWTH_AT - FREE_AT)) * 125);
  return Math.round(150 + ((pos - GROWTH_AT) / (100 - GROWTH_AT)) * 350);
}
function toPos(members: number) {
  if (members <= 25) return ((members - 2) / 23) * FREE_AT;
  if (members <= 150) return FREE_AT + ((members - 25) / 125) * (GROWTH_AT - FREE_AT);
  return GROWTH_AT + ((members - 150) / 350) * (100 - GROWTH_AT);
}

function guessCurrency() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz === "Africa/Accra") return "GHS";
    if (tz === "Africa/Lagos") return "NGN";
    if (tz === "Africa/Nairobi") return "KES";
  } catch {
    /* default below */
  }
  return "GHS";
}

const ICON: Record<PlanId, ReactNode> = { free: <Users />, growth: <Rocket />, pro: <InfinityIcon /> };
const GLOW: Record<PlanId, string> = { free: "from-brand-400 to-brand-600", growth: "from-brand-400 via-grape-500 to-grape-700", pro: "from-coral-500 to-sun-400" };

export function Pricing() {
  const [members, setMembers] = useState(18);
  const [momo, setMomo] = useState(false);
  const [interval, setInterval] = useState<BillingInterval>("year");
  const [currency, setCurrency] = useState(guessCurrency);
  const plan = recommendPlan(members, momo);

  // A little celebration whenever the answer becomes "free".
  const [burst, setBurst] = useState(0);
  const prev = useRef(plan);
  useEffect(() => {
    if (plan === "free" && prev.current !== "free") setBurst((b) => b + 1);
    prev.current = plan;
  }, [plan]);

  const price = plan === "free" ? null : priceFor(plan, interval, currency);
  const monthly = price ? (interval === "year" ? price.amountMinor / 12 : price.amountMinor) : 0;
  const perMember = price ? monthly / members : 0;

  return (
    <section id="pricing" className="relative overflow-hidden bg-[#fbfaf7] py-24 text-slate-900 sm:py-32 dark:bg-slate-950 dark:text-white">
      <div className="pointer-events-none absolute top-40 -left-40 size-[32rem] rounded-full bg-brand-300/30 blur-[120px]" aria-hidden />
      <div className="pointer-events-none absolute -right-40 bottom-20 size-[32rem] rounded-full bg-grape-300/30 blur-[120px]" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-bold tracking-[0.2em] text-coral-600 uppercase">Pricing</p>
          <h2 className="mt-4 font-display text-4xl font-extrabold tracking-tight sm:text-6xl">
            Free forever. <span className="bg-gradient-to-r from-brand-600 via-grape-600 to-coral-500 bg-clip-text text-transparent">Seriously.</span>
          </h2>
          <p className="mt-5 text-lg text-slate-600 dark:text-slate-400">
            Every fund gets the books, loans, welfare and member app free for up to 25 members. Pay only when you grow, or when you want dues to collect themselves.
          </p>
        </Reveal>

        <Reveal delay={100} className="mt-14">
          <div className="grid overflow-hidden rounded-[2rem] bg-white shadow-2xl ring-1 shadow-slate-900/10 ring-slate-200 lg:grid-cols-[1.15fr_1fr] dark:bg-slate-900 dark:ring-slate-800">
            {/* Inputs */}
            <div className="p-6 sm:p-10">
              <div className="flex items-center justify-between gap-4">
                <label htmlFor="members" className="text-sm font-semibold text-slate-500">
                  How many members in your fund?
                </label>
                <div className="flex gap-1 rounded-full bg-slate-100 p-1 dark:bg-slate-800" role="radiogroup" aria-label="Currency">
                  {PRICE_CURRENCIES.map((c) => (
                    <button key={c} role="radio" aria-checked={currency === c} onClick={() => setCurrency(c)} className={clsx("rounded-full px-2.5 py-1 text-[11px] font-bold transition", currency === c ? "bg-white text-ink-950 shadow dark:bg-slate-950 dark:text-white" : "text-slate-500")}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mt-3 font-display text-7xl font-extrabold tracking-tight tabular-nums sm:text-8xl">
                {members}
                {members >= 500 && "+"}
              </p>

              <div className="relative mt-6 pb-8">
                <div className="pointer-events-none absolute top-[9px] right-0 left-0 h-2.5 overflow-hidden rounded-full" aria-hidden>
                  <div className="absolute inset-y-0 left-0 bg-brand-400/70" style={{ width: `${FREE_AT}%` }} />
                  <div className="absolute inset-y-0 bg-grape-400/60" style={{ left: `${FREE_AT}%`, width: `${GROWTH_AT - FREE_AT}%` }} />
                  <div className="absolute inset-y-0 right-0 bg-coral-400/60" style={{ left: `${GROWTH_AT}%` }} />
                </div>
                <input
                  id="members"
                  type="range"
                  min={0}
                  max={100}
                  step={0.25}
                  value={toPos(members)}
                  onChange={(e) => setMembers(toMembers(Number(e.target.value)))}
                  className="awa-range relative w-full"
                  aria-valuetext={`${members} members`}
                />
                <div className="absolute right-0 bottom-0 left-0 text-[11px] font-semibold text-slate-500">
                  <span className="absolute left-0">2</span>
                  <span className="absolute -translate-x-1/2 text-brand-700 dark:text-brand-300" style={{ left: `${FREE_AT}%` }}>
                    25 · free up to here
                  </span>
                  <span className="absolute -translate-x-1/2 text-grape-700 dark:text-grape-300" style={{ left: `${GROWTH_AT}%` }}>
                    150
                  </span>
                  <span className="absolute right-0">500+</span>
                </div>
              </div>

              <Seats members={members} />

              <button
                role="switch"
                aria-checked={momo}
                onClick={() => setMomo((m) => !m)}
                className={clsx("mt-8 flex w-full items-center gap-4 rounded-2xl p-4 text-left ring-1 transition", momo ? "bg-grape-50 ring-grape-300 dark:bg-grape-500/10 dark:ring-grape-500/40" : "bg-slate-50 ring-slate-200 hover:ring-slate-300 dark:bg-slate-800/60 dark:ring-slate-700")}
              >
                <span className={clsx("flex size-11 shrink-0 items-center justify-center rounded-xl text-white transition", momo ? "bg-gradient-to-br from-grape-500 to-grape-700" : "bg-slate-300 dark:bg-slate-700")}>
                  <Smartphone className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">Members pay dues by mobile money, in the app</span>
                  <span className="block text-sm text-slate-500">Payments post to the right month or loan by themselves. 0% AwaFund markup.</span>
                </span>
                <span className={clsx("relative h-7 w-12 shrink-0 rounded-full transition", momo ? "bg-grape-600" : "bg-slate-300 dark:bg-slate-600")}>
                  <span className={clsx("absolute top-1 size-5 rounded-full bg-white shadow transition-all", momo ? "left-6" : "left-1")} />
                </span>
              </button>
            </div>

            {/* Answer */}
            <div className="relative overflow-hidden bg-ink-950 p-6 text-white sm:p-10">
              <div className={clsx("pointer-events-none absolute -top-24 -right-20 size-80 rounded-full bg-gradient-to-br opacity-40 blur-3xl transition-all duration-700", GLOW[plan])} aria-hidden />
              {burst > 0 && plan === "free" && <Confetti key={burst} pieces={40} />}
              <div className="relative flex h-full flex-col">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold tracking-[0.2em] text-white/50 uppercase">Your fund on</p>
                  <div className="flex gap-1 rounded-full bg-white/10 p-1" role="radiogroup" aria-label="Billing period">
                    {(["month", "year"] as BillingInterval[]).map((v) => (
                      <button key={v} role="radio" aria-checked={interval === v} onClick={() => setInterval(v)} className={clsx("rounded-full px-3 py-1 text-xs font-bold transition", interval === v ? "bg-white text-ink-950" : "text-white/60")}>
                        {v === "month" ? "Monthly" : "Yearly −17%"}
                      </button>
                    ))}
                  </div>
                </div>
                <div key={plan} className="mt-4 flex animate-pop items-center gap-3">
                  <span className={clsx("flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg [&>svg]:size-6", GLOW[plan])}>{ICON[plan]}</span>
                  <p className="font-display text-4xl font-extrabold">{PLANS[plan].name}</p>
                </div>

                <div className="mt-8">
                  {price ? (
                    <>
                      <p className="flex items-end gap-2">
                        <span className="font-display text-6xl font-extrabold tracking-tight">
                          <CountUp key={`${plan}${currency}${interval}`} value={monthly} duration={600} format={(n) => money(Math.round(n), currency)} />
                        </span>
                        <span className="pb-2 text-white/50">/month</span>
                      </p>
                      <p className="mt-2 text-sm text-sun-300">
                        That's {money(Math.max(1, Math.round(perMember)), currency)} per member a month{interval === "year" ? `, billed ${money(price.amountMinor, currency)} yearly` : ""}.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-display text-6xl font-extrabold tracking-tight">{money(0, currency)}</p>
                      <p className="mt-2 text-sm text-brand-300">Not a trial. Free for as long as your fund has 25 members or fewer.</p>
                    </>
                  )}
                </div>

                <ul className="mt-8 flex-1 space-y-2.5 text-sm">
                  {PLANS[plan].highlights.slice(0, 5).map((h) => (
                    <li key={h} className="flex gap-2.5 text-white/85">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-white/10">
                        <Check className="size-3" />
                      </span>
                      {h}
                    </li>
                  ))}
                </ul>

                <Link to="/signup" className="group relative mt-8 flex items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-coral-500 via-coral-400 to-sun-400 py-4 text-base font-bold text-ink-950 transition hover:scale-[1.02]">
                  <span className="absolute inset-y-0 left-0 w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-white/50 to-transparent" />
                  <span className="relative">{plan === "free" ? "Start free, no card" : "Start free, upgrade in two taps"}</span>
                  <ArrowRight className="relative size-5 transition group-hover:translate-x-1" />
                </Link>
                <p className="mt-3 text-center text-xs text-white/40">Every fund starts on Free. Upgrade from inside the app whenever you're ready.</p>
              </div>
            </div>
          </div>
        </Reveal>

        <PlanRow active={plan} currency={currency} interval={interval} onPick={(p) => (p === "free" ? (setMembers(Math.min(members, 25)), setMomo(false)) : p === "growth" ? (setMembers(Math.min(Math.max(members, 26), 150)), setMomo(true)) : setMembers(Math.max(members, 151)))} />

        <Reveal className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            { icon: <Smartphone />, t: "0% markup on collections", b: "Members pay the mobile money provider's standard fee. AwaFund adds nothing on top, ever." },
            { icon: <ShieldCheck />, t: "Never held hostage", b: "If a paid plan lapses, every record stays. After 7 days' grace your fund simply moves to Free." },
            { icon: <Sparkles />, t: "No card to start", b: "Sign up, invite your committee and import your spreadsheet tonight. Pay nothing until you choose to." },
          ].map((x) => (
            <div key={x.t} className="flex gap-4 rounded-3xl bg-white p-6 ring-1 ring-slate-200/80 dark:bg-slate-900 dark:ring-slate-800">
              <span className="mt-0.5 text-grape-600 [&>svg]:size-6">{x.icon}</span>
              <div>
                <p className="font-display font-bold">{x.t}</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{x.b}</p>
              </div>
            </div>
          ))}
        </Reveal>

        <Compare />
      </div>
    </section>
  );
}

/** One dot per member (scaled past 60): the first 25 sit in the free zone. */
function Seats({ members }: { members: number }) {
  const shown = Math.min(members, 60);
  const scale = members / shown;
  const dots = useMemo(() => Array.from({ length: shown }, (_, i) => Math.floor(i * scale) < 25), [shown, scale]);
  return (
    <div className="mt-6" aria-hidden>
      <div className="flex flex-wrap gap-1.5">
        {dots.map((free, i) => (
          <span key={i} className={clsx("size-3.5 animate-pop rounded-full transition-colors", free ? "bg-brand-500" : "bg-grape-500")} style={{ animationDelay: `${Math.min(i, 30) * 8}ms` }} />
        ))}
      </div>
      <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-brand-500" /> Free seats ({Math.min(members, 25)})
        </span>
        {members > 25 && (
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-grape-500" /> Paid plan seats ({members - 25})
          </span>
        )}
        {scale > 1 && <span>Each dot ≈ {scale.toFixed(1)} members</span>}
      </p>
    </div>
  );
}

function PlanRow({ active, currency, interval, onPick }: { active: PlanId; currency: string; interval: BillingInterval; onPick: (p: PlanId) => void }) {
  return (
    <div className="mt-10 grid gap-4 md:grid-cols-3">
      {(["free", "growth", "pro"] as PlanId[]).map((id, i) => {
        const p = PLANS[id];
        const on = id === active;
        const price = id === "free" ? null : priceFor(id, interval, currency);
        return (
          <Reveal key={id} delay={i * 80}>
            <button
              onClick={() => onPick(id)}
              className={clsx(
                "group relative flex h-full w-full flex-col rounded-3xl bg-white p-6 text-left ring-1 transition duration-300 dark:bg-slate-900",
                on ? "scale-[1.02] shadow-2xl ring-2 shadow-grape-500/15 ring-grape-400" : "opacity-80 ring-slate-200 hover:opacity-100 dark:ring-slate-800",
              )}
              aria-pressed={on}
            >
              {on && <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-r from-brand-500 to-grape-600 px-3 py-1 text-xs font-bold text-white">Right for your fund</span>}
              <div className="flex items-center gap-3">
                <span className={clsx("flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br text-white [&>svg]:size-5", GLOW[id])}>{ICON[id]}</span>
                <div>
                  <p className="font-display text-xl font-bold">{p.name}</p>
                  <p className="text-xs text-slate-500">{p.memberLimit === null ? "Unlimited members" : `Up to ${p.memberLimit} members`}</p>
                </div>
              </div>
              <p className="mt-5 font-display text-3xl font-extrabold tracking-tight">
                {price ? money(Math.round(interval === "year" ? price.amountMinor / 12 : price.amountMinor), price.currency) : "Free"}
                <span className="text-sm font-medium text-slate-500">{price ? " /month" : " forever"}</span>
              </p>
              <ul className="mt-5 space-y-2 text-sm">
                {p.highlights.map((h) => (
                  <li key={h} className="flex gap-2 text-slate-700 dark:text-slate-300">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand-600" /> {h}
                  </li>
                ))}
              </ul>
            </button>
          </Reveal>
        );
      })}
    </div>
  );
}

const ROWS: [string, boolean | string, boolean | string, boolean | string][] = [
  ["Members", "25", "150", "Unlimited"],
  ["Dues tracking and contribution grid", true, true, true],
  ["Loans with credit committee reviews", true, true, true],
  ["Welfare claims with enforced limits", true, true, true],
  ["Shares and dividends", true, true, true],
  ["Double-entry books and financial reports", true, true, true],
  ["Member app for every member", true, true, true],
  ["Record cash, bank and MoMo transfers", true, true, true],
  ["Spreadsheet import and CSV export", true, true, true],
  ["Roles, permissions and full audit trail", true, true, true],
  ["Members pay by mobile money in the app", false, true, true],
  ["Payments post to the books automatically", false, true, true],
  ["AI credit assessments and reminder drafts", false, true, true],
  ["Priority WhatsApp support", false, false, true],
  ["Guided onboarding and data migration", false, false, true],
];

function Compare() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-10">
      <button onClick={() => setOpen((o) => !o)} className="mx-auto flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold ring-1 ring-slate-200 transition hover:ring-slate-300 dark:bg-slate-900 dark:ring-slate-800" aria-expanded={open}>
        Compare every feature <ChevronDown className={clsx("size-4 transition-transform", open && "rotate-180")} />
      </button>
      <div className="grid transition-all duration-500" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
        <div className="overflow-hidden">
          <div className="mt-6 overflow-x-auto rounded-3xl bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="p-4 text-left font-semibold text-slate-500">Feature</th>
                  {(["free", "growth", "pro"] as PlanId[]).map((p) => (
                    <th key={p} className="p-4 text-center font-display font-bold">
                      {PLANS[p].name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map(([label, ...cells]) => (
                  <tr key={label} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                    <td className="p-4 text-slate-700 dark:text-slate-300">{label}</td>
                    {cells.map((c, i) => (
                      <td key={i} className="p-4 text-center">
                        {typeof c === "string" ? (
                          <span className="font-semibold">{c}</span>
                        ) : c ? (
                          <Check className="mx-auto size-5 text-brand-600" aria-label="Included" />
                        ) : (
                          <Minus className="mx-auto size-4 text-slate-300" aria-label="Not included" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
