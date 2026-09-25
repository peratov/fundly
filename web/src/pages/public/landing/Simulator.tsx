import { ArrowRight, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { clsx } from "../../../components/ui";
import { CountUp, Reveal, useInView } from "../../../lib/motion";

const CURRENCIES = [
  { code: "GHS", symbol: "GH₵", dues: 50 },
  { code: "NGN", symbol: "₦", dues: 5000 },
  { code: "KES", symbol: "KSh", dues: 1000 },
  { code: "USD", symbol: "$", dues: 20 },
];

interface Inputs {
  members: number;
  dues: number;
  years: number;
  lentPct: number;
  rate: number;
}

/**
 * A deliberately simple model so visitors can reason about it:
 * dues accumulate monthly; a share of the pool is lent at a flat annual rate;
 * interest is added back to the pool (i.e. shared with members).
 */
function project({ members, dues, years, lentPct, rate }: Inputs) {
  const months = years * 12;
  let pool = 0;
  let contributed = 0;
  let interest = 0;
  const series: { m: number; contributed: number; total: number }[] = [{ m: 0, contributed: 0, total: 0 }];
  for (let m = 1; m <= months; m++) {
    contributed += members * dues;
    pool += members * dues;
    const earned = pool * (lentPct / 100) * (rate / 100 / 12);
    interest += earned;
    pool += earned;
    series.push({ m, contributed, total: pool });
  }
  return { contributed, interest, total: pool, perMember: pool / Math.max(1, members), lendable: pool * (lentPct / 100), series };
}

function Slider({ label, value, min, max, step, onChange, display, hint }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; display: string; hint?: string }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <span className="mb-3 flex items-baseline justify-between">
        <span className="text-sm font-medium text-white/70">{label}</span>
        <span className="font-display text-2xl font-bold text-white">{display}</span>
      </span>
      <input
        type="range"
        className="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ background: `linear-gradient(90deg, #2dd4bf, #a78bfa ${pct / 2}%, #ff6b4a ${pct}%, rgba(255,255,255,0.1) ${pct}%)` }}
      />
      {hint && <span className="mt-2 block text-xs text-white/40">{hint}</span>}
    </label>
  );
}

function Chart({ series, start }: { series: ReturnType<typeof project>["series"]; start: boolean }) {
  const W = 600;
  const H = 240;
  const max = Math.max(1, ...series.map((s) => s.total));
  const x = (m: number) => (m / (series.length - 1)) * W;
  const y = (v: number) => H - (v / max) * (H - 16);
  const line = (key: "total" | "contributed") => series.map((s, i) => `${i ? "L" : "M"}${x(s.m).toFixed(1)},${y(s[key]).toFixed(1)}`).join(" ");
  const area = (key: "total" | "contributed") => `${line(key)} L${W},${H} L0,${H} Z`;
  const years = Math.round((series.length - 1) / 12);
  return (
    <svg viewBox={`0 0 ${W} ${H + 24}`} className="h-auto w-full overflow-visible" role="img" aria-label="Projected growth of the fund over time">
      <defs>
        <linearGradient id="simTotal" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#ff6b4a" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ff6b4a" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="simContrib" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.05" />
        </linearGradient>
        <clipPath id="simReveal">
          <rect x="0" y="0" height={H + 24} width={start ? W : 0} style={{ transition: "width 1.6s cubic-bezier(0.16,1,0.3,1)" }} />
        </clipPath>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="rgba(255,255,255,0.06)" />
      ))}
      <g clipPath="url(#simReveal)">
        <path d={area("total")} fill="url(#simTotal)" style={{ transition: "d 0.6s ease" }} />
        <path d={area("contributed")} fill="url(#simContrib)" style={{ transition: "d 0.6s ease" }} />
        <path d={line("total")} fill="none" stroke="#ff8a65" strokeWidth="2.5" style={{ transition: "d 0.6s ease" }} />
        <path d={line("contributed")} fill="none" stroke="#2dd4bf" strokeWidth="2" style={{ transition: "d 0.6s ease" }} />
      </g>
      {Array.from({ length: years + 1 }, (_, i) => (
        <text key={i} x={x(i * 12)} y={H + 18} fill="rgba(255,255,255,0.4)" fontSize="11" textAnchor={i === 0 ? "start" : i === years ? "end" : "middle"}>
          {i === 0 ? "Today" : `Yr ${i}`}
        </text>
      ))}
    </svg>
  );
}

export function Simulator() {
  const [cur, setCur] = useState(CURRENCIES[0]);
  const [inp, setInp] = useState<Inputs>({ members: 60, dues: 50, years: 5, lentPct: 40, rate: 12 });
  const set = (k: keyof Inputs) => (v: number) => setInp((s) => ({ ...s, [k]: v }));
  const p = useMemo(() => project(inp), [inp]);
  const [ref, inView] = useInView<HTMLDivElement>(0.25);
  const fmt = (n: number) => `${cur.symbol}${Math.round(n).toLocaleString("en")}`;
  const duesMax = cur.dues * 10;
  const growth = p.contributed ? ((p.total - p.contributed) / p.contributed) * 100 : 0;

  const signupHref = `/signup?${new URLSearchParams({ currency: cur.code, dues: String(inp.dues) })}`;

  return (
    <section id="simulator" className="relative overflow-hidden bg-ink-950 py-24 text-white sm:py-32">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute top-1/3 -right-40 size-[34rem] rounded-full bg-coral-500/15 blur-[120px]" />
        <div className="absolute bottom-0 -left-40 size-[30rem] rounded-full bg-brand-500/15 blur-[120px]" />
      </div>
      <div className="relative mx-auto max-w-7xl px-4 sm:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-bold tracking-[0.2em] text-coral-400 uppercase">Play with it</p>
          <h2 className="mt-4 font-display text-4xl font-extrabold tracking-tight sm:text-6xl">
            What could your group <span className="text-rainbow">build together?</span>
          </h2>
          <p className="mt-5 text-lg text-white/60">Slide the numbers for your group and watch the fund grow as members borrow from each other and the interest flows back to everyone.</p>
        </Reveal>

        <div ref={ref} className="mt-16 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="glass space-y-8 rounded-3xl p-6 sm:p-8">
            <div className="flex flex-wrap gap-2">
              {CURRENCIES.map((c) => (
                <button
                  key={c.code}
                  onClick={() => {
                    setCur(c);
                    setInp((s) => ({ ...s, dues: c.dues }));
                  }}
                  className={clsx("rounded-full px-4 py-1.5 text-sm font-semibold transition", c.code === cur.code ? "bg-white text-ink-950" : "bg-white/5 text-white/70 hover:bg-white/10")}
                >
                  {c.code}
                </button>
              ))}
            </div>
            <Slider label="Members" value={inp.members} min={5} max={500} step={5} onChange={set("members")} display={String(inp.members)} />
            <Slider label="Monthly dues per member" value={inp.dues} min={Math.round(cur.dues / 5)} max={duesMax} step={Math.max(1, Math.round(cur.dues / 10))} onChange={set("dues")} display={fmt(inp.dues)} />
            <Slider label="Years" value={inp.years} min={1} max={10} step={1} onChange={set("years")} display={`${inp.years} yr${inp.years > 1 ? "s" : ""}`} />
            <Slider label="Share of the pool lent to members" value={inp.lentPct} min={0} max={80} step={5} onChange={set("lentPct")} display={`${inp.lentPct}%`} hint="The rest stays in cash for welfare and withdrawals." />
            <Slider label="Loan interest (flat, per year)" value={inp.rate} min={0} max={30} step={1} onChange={set("rate")} display={`${inp.rate}%`} />
          </div>

          <div className="glass flex flex-col rounded-3xl p-6 sm:p-8">
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              <Metric label="Fund after" sub={`${inp.years} years`} value={p.total} fmt={fmt} start={inView} tone="text-coral-400" />
              <Metric label="Members put in" value={p.contributed} fmt={fmt} start={inView} tone="text-brand-300" />
              <Metric label="Interest earned" sub={`+${growth.toFixed(1)}%`} value={p.interest} fmt={fmt} start={inView} tone="text-sun-400" />
              <Metric label="Each member's share" value={p.perMember} fmt={fmt} start={inView} tone="text-grape-400" />
            </div>
            <div className="mt-8 flex-1">
              <Chart series={p.series} start={inView} />
              <div className="mt-3 flex gap-5 text-xs text-white/60">
                <span className="flex items-center gap-1.5">
                  <span className="h-1 w-4 rounded bg-brand-400" /> Dues paid in
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1 w-4 rounded bg-coral-400" /> Fund value incl. interest
                </span>
              </div>
            </div>
            <div className="mt-8 flex flex-col gap-4 rounded-2xl bg-gradient-to-r from-brand-500/20 via-grape-500/20 to-coral-500/20 p-5 ring-1 ring-white/10 sm:flex-row sm:items-center">
              <p className="flex-1 text-sm text-white/80">
                By year {inp.years}, members could borrow up to <span className="font-bold text-white">{fmt(p.lendable)}</span> from their own fund instead of a bank.
              </p>
              <Link to={signupHref} className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-ink-950 transition hover:scale-[1.03]">
                Start with these numbers <ArrowRight className="size-4 transition group-hover:translate-x-1" />
              </Link>
            </div>
            <p className="mt-4 flex items-start gap-1.5 text-xs text-white/35">
              <Info className="mt-0.5 size-3.5 shrink-0" /> An illustration, not a forecast. Real results depend on repayments, withdrawals and welfare payouts.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, sub, value, fmt, start, tone }: { label: string; sub?: string; value: number; fmt: (n: number) => string; start: boolean; tone: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-white/50">{label}</p>
      <p className={clsx("mt-1 truncate font-display text-2xl font-extrabold sm:text-3xl", tone)}>
        <CountUp value={value} format={fmt} start={start} duration={700} />
      </p>
      {sub && <p className="text-xs text-white/40">{sub}</p>}
    </div>
  );
}
