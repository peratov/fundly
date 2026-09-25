import { ArrowRight, Check, ChevronDown, FileSpreadsheet, MessageCircleWarning, Rocket, Upload, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { clsx } from "../../../components/ui";
import { Reveal, useInView } from "../../../lib/motion";
import { Logo } from "./Nav";

// ---------------------------------------------------------------- marquee

const GROUPS = ["Alumni associations", "Susu groups", "Church welfare funds", "Market women's associations", "Office co-operatives", "Family funds", "Hometown associations", "Teachers' welfare", "Sports clubs", "Old students' unions"];

export function Marquee() {
  const items = [...GROUPS, ...GROUPS];
  return (
    <div className="relative overflow-hidden border-y border-white/10 bg-ink-900 py-5 text-white">
      <div className="flex w-max animate-marquee gap-10 hover:[animation-play-state:paused]">
        {items.map((g, i) => (
          <span key={i} className="flex items-center gap-10 font-display text-lg font-semibold whitespace-nowrap text-white/70">
            {g}
            <span className="size-2 rotate-45 bg-gradient-to-br from-coral-400 to-sun-400" />
          </span>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-ink-900" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-ink-900" />
    </div>
  );
}

// ---------------------------------------------------------------- how it works

const STEPS = [
  { icon: <Rocket />, t: "Create your fund", b: "Name it, pick your currency, set monthly dues. Two minutes, tops.", c: "from-coral-400 to-coral-600" },
  { icon: <Upload />, t: "Bring your history", b: "Paste in your spreadsheet. We check every row before anything is saved.", c: "from-sun-300 to-sun-500" },
  { icon: <UserPlus />, t: "Invite everyone", b: "Share invite links on WhatsApp. Members see their savings the moment they join.", c: "from-grape-400 to-grape-600" },
];

export function HowItWorks() {
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  return (
    <section id="how" className="bg-white py-24 text-slate-900 sm:py-32 dark:bg-slate-900 dark:text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold tracking-[0.2em] text-grape-600 uppercase dark:text-grape-400">Up and running tonight</p>
          <h2 className="mt-4 font-display text-4xl font-extrabold tracking-tight sm:text-6xl">Three steps. No training.</h2>
        </Reveal>
        <div ref={ref} className="relative mt-16 grid gap-10 md:grid-cols-3">
          <div className="absolute top-8 right-[16%] left-[16%] hidden h-1 overflow-hidden rounded-full bg-slate-100 md:block dark:bg-slate-800">
            <div className="h-full bg-gradient-to-r from-coral-500 via-sun-400 to-grape-500 transition-all duration-[1600ms] ease-out" style={{ width: inView ? "100%" : "0%" }} />
          </div>
          {STEPS.map((s, i) => (
            <Reveal key={s.t} delay={i * 180} className="relative text-center">
              <div className={clsx("relative mx-auto flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-xl ring-8 ring-white [&>svg]:size-7 dark:ring-slate-900", s.c)}>
                {s.icon}
                <span className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-ink-950 text-xs font-bold text-white">{i + 1}</span>
              </div>
              <h3 className="mt-6 font-display text-2xl font-bold">{s.t}</h3>
              <p className="mx-auto mt-2 max-w-xs text-slate-600 dark:text-slate-400">{s.b}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- before / after

const PAIRS = [
  ["Treasurer's spreadsheet on one laptop", "Everyone sees their own balance, anytime"],
  ["Screenshots of MoMo transfers in WhatsApp", "Payments post to the books automatically"],
  ["\"Who approved this loan?\"", "Committee votes and decisions on record"],
  ["Year-end audit takes weeks", "Trial balance and CSV exports in one click"],
  ["Arguments about who is behind", "Standing updates itself from the dues record"],
];

export function Compare() {
  const [fundly, setFundly] = useState(true);
  return (
    <section className="bg-noise relative overflow-hidden bg-ink-950 py-24 text-white sm:py-32">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className={clsx("absolute top-0 left-1/2 size-[40rem] -translate-x-1/2 rounded-full blur-[140px] transition-colors duration-700", fundly ? "bg-brand-500/25" : "bg-rose-600/20")} />
      </div>
      <div className="relative mx-auto max-w-4xl px-4 sm:px-8">
        <Reveal className="text-center">
          <h2 className="font-display text-4xl font-extrabold tracking-tight sm:text-6xl">Sound familiar?</h2>
          <div className="mt-8 inline-flex rounded-full bg-white/10 p-1.5 ring-1 ring-white/15">
            <button onClick={() => setFundly(false)} className={clsx("flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition", !fundly ? "bg-rose-500 text-white shadow-lg" : "text-white/60")}>
              <FileSpreadsheet className="size-4" /> The old way
            </button>
            <button onClick={() => setFundly(true)} className={clsx("flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition", fundly ? "bg-brand-500 text-ink-950 shadow-lg" : "text-white/60")}>
              <Check className="size-4" /> With Fundly
            </button>
          </div>
        </Reveal>
        <ul className="mt-12 space-y-3">
          {PAIRS.map(([old, neu], i) => (
            <li key={i} className="glass flex items-center gap-4 overflow-hidden rounded-2xl px-5 py-4">
              <span className={clsx("flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-500", fundly ? "bg-brand-500 text-ink-950" : "bg-rose-500/80 text-white")}>
                {fundly ? <Check className="size-5" /> : i === 1 ? <MessageCircleWarning className="size-5" /> : <X className="size-5" />}
              </span>
              <span key={String(fundly)} className="animate-pop text-base font-medium sm:text-lg" style={{ animationDelay: `${i * 60}ms` }}>
                {fundly ? neu : old}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- pricing

export function Pricing() {
  const [annual, setAnnual] = useState(true);
  const price = annual ? 250 : 25;
  return (
    <section id="pricing" className="relative overflow-hidden bg-[#fbfaf7] py-24 text-slate-900 sm:py-32 dark:bg-slate-950 dark:text-white">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-8 lg:grid-cols-2">
        <Reveal>
          <p className="text-sm font-bold tracking-[0.2em] text-coral-600 uppercase">Pricing</p>
          <h2 className="mt-4 font-display text-4xl font-extrabold tracking-tight sm:text-6xl">One plan. Every feature. Every member.</h2>
          <p className="mt-5 text-lg text-slate-600 dark:text-slate-400">No per-member fees, so your fund can grow without the bill growing with it. Start with a free 14-day trial; your data stays yours and exports any time.</p>
          <div className="mt-8 inline-flex items-center gap-3 rounded-full bg-white p-1.5 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            <button onClick={() => setAnnual(false)} className={clsx("rounded-full px-4 py-2 text-sm font-bold transition", !annual ? "bg-ink-950 text-white dark:bg-white dark:text-ink-950" : "text-slate-500")}>
              Monthly
            </button>
            <button onClick={() => setAnnual(true)} className={clsx("flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition", annual ? "bg-ink-950 text-white dark:bg-white dark:text-ink-950" : "text-slate-500")}>
              Yearly <span className="rounded-full bg-sun-400 px-2 py-0.5 text-[10px] text-ink-950">2 months free</span>
            </button>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="relative overflow-hidden rounded-[2rem] p-[2px] shadow-2xl shadow-grape-500/25">
            <div className="absolute -inset-[60%] animate-spin-slow" style={{ background: "conic-gradient(from 0deg, #2dd4bf, #a78bfa, #ff6b4a, #ffd23f, #2dd4bf)" }} aria-hidden />
            <div className="relative rounded-[calc(2rem-2px)] bg-ink-950 p-8 text-white sm:p-10">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-display text-2xl font-bold">Fundly Standard</p>
                  <p className="mt-1 text-sm text-white/50">For one fund, unlimited members</p>
                </div>
                <span className="rounded-full bg-coral-500 px-3 py-1 text-xs font-bold">Most groups</span>
              </div>
              <p className="mt-8 flex items-end gap-2">
                <span key={price} className="animate-pop font-display text-7xl font-extrabold tracking-tight">${price}</span>
                <span className="pb-3 text-white/50">/{annual ? "year" : "month"}</span>
              </p>
              {annual && <p className="text-sm text-sun-300">That's about $20.83 a month</p>}
              <ul className="mt-8 grid gap-3 text-sm sm:grid-cols-2">
                {["Unlimited members", "Mobile money collections", "Loans & committee reviews", "Welfare claims", "Shares & dividends", "Double-entry reports", "CSV import & export", "Full audit trail"].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-white/80">
                    <span className="flex size-5 items-center justify-center rounded-full bg-brand-500/20 text-brand-300">
                      <Check className="size-3" />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link to="/signup" className="group relative mt-10 flex items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-coral-500 via-coral-400 to-sun-400 py-4 text-base font-bold text-ink-950 transition hover:scale-[1.02]">
                <span className="absolute inset-y-0 left-0 w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-white/50 to-transparent" />
                <span className="relative">Start 14-day free trial</span>
                <ArrowRight className="relative size-5 transition group-hover:translate-x-1" />
              </Link>
              <p className="mt-3 text-center text-xs text-white/40">No card needed. Cancel anytime.</p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- FAQ

const FAQS = [
  ["Is our money held by Fundly?", "No. Fundly is the record-keeping and collection layer. Money stays in your fund's accounts; mobile money payments settle through the payment provider to your group."],
  ["We already have years of records in Excel. Can we bring them?", "Yes. Import members and contribution history from CSV. Every row is validated first and the whole file is saved together or not at all, so you never end up half-imported."],
  ["Who can see what?", "Members see only their own savings, loans and claims. Managers run the fund, the credit committee reviews loans, and the audit committee gets read-only access to everything plus the audit log."],
  ["How are loan limits and credit scores worked out?", "From five transparent habits: how long someone has been a member, contribution size, regularity, past loan repayment and meeting attendance. Your fund sets the thresholds."],
  ["What happens after the trial?", "Your fund becomes read-only until the owner subscribes. Nothing is deleted, and you can export everything at any time."],
] as const;

export function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="bg-white py-24 text-slate-900 sm:py-32 dark:bg-slate-900 dark:text-white">
      <div className="mx-auto max-w-3xl px-4 sm:px-8">
        <Reveal className="text-center">
          <h2 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Questions, answered</h2>
        </Reveal>
        <div className="mt-12 space-y-3">
          {FAQS.map(([q, a], i) => (
            <Reveal key={q} delay={i * 60}>
              <div className={clsx("overflow-hidden rounded-2xl ring-1 transition", open === i ? "bg-[#fbfaf7] ring-slate-300 dark:bg-slate-800 dark:ring-slate-700" : "ring-slate-200 dark:ring-slate-800")}>
                <button onClick={() => setOpen(open === i ? -1 : i)} className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left" aria-expanded={open === i}>
                  <span className="font-display text-lg font-bold">{q}</span>
                  <ChevronDown className={clsx("size-5 shrink-0 transition-transform duration-300", open === i && "rotate-180")} />
                </button>
                <div className="grid transition-all duration-300" style={{ gridTemplateRows: open === i ? "1fr" : "0fr" }}>
                  <p className="overflow-hidden px-6 text-slate-600 dark:text-slate-400">
                    <span className="block pb-5">{a}</span>
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- final CTA + footer

export function FinalCta() {
  const [email, setEmail] = useState("");
  const navigate = useNavigate();
  return (
    <section className="relative overflow-hidden bg-ink-950 px-4 py-24 sm:px-8 sm:py-32">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-brand-500 via-grape-600 to-coral-500 bg-[length:200%_200%] p-10 text-center text-white shadow-2xl shadow-grape-900/40 animate-gradient sm:p-16">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />
        <div className="absolute -top-20 -left-20 size-72 animate-float rounded-full bg-sun-400/30 blur-3xl" aria-hidden />
        <div className="absolute -right-10 -bottom-24 size-80 animate-float-delayed rounded-full bg-white/20 blur-3xl" aria-hidden />
        <div className="relative">
          <h2 className="font-display text-4xl font-extrabold tracking-tight sm:text-6xl">Your members deserve better than a spreadsheet.</h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-white/85">Set up your fund tonight. Send the invites tomorrow. Watch the dues roll in.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/signup?${new URLSearchParams(email ? { email } : {})}`);
            }}
            className="mx-auto mt-10 flex max-w-md flex-col gap-2 rounded-2xl bg-white/15 p-2 ring-1 ring-white/30 backdrop-blur sm:flex-row"
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email address"
              className="min-w-0 flex-1 rounded-xl bg-transparent px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
            />
            <button type="submit" className="rounded-xl bg-ink-950 px-6 py-3 font-bold text-white transition hover:bg-ink-900">
              Get started free
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-ink-950 py-12 text-white/50">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 sm:flex-row sm:px-8">
        <Logo />
        <nav className="flex flex-wrap justify-center gap-6 text-sm">
          <a href="/#features" className="hover:text-white">
            Features
          </a>
          <a href="/#pricing" className="hover:text-white">
            Pricing
          </a>
          <Link to="/tools/merry-go-round" className="hover:text-white">
            Free merry-go-round planner
          </Link>
          <a href="/learn" className="hover:text-white">
            Guides
          </a>
          <Link to="/login" className="hover:text-white">
            Sign in
          </Link>
<a href="/f/demo/overview" className="hover:text-white">
            Demo
          </a>
        </nav>
        <p className="text-sm">© {new Date().getFullYear()} Fundly</p>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------- free tool teaser

const TEASER_NAMES = ["Ama", "Kofi", "Esi", "Yaw", "Afi", "Kwame"];
const TEASER_COLORS = ["#14b8a6", "#ff6b4a", "#8b5cf6", "#f5b700", "#0ea5e9", "#f43f5e"];

export function ToolTeaser() {
  const arc = (deg: number, r: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [100 + r * Math.cos(rad), 100 + r * Math.sin(rad)];
  };
  return (
    <section className="bg-white py-20 text-slate-900 dark:bg-slate-900 dark:text-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-8">
        <Reveal className="grid items-center gap-10 overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-sun-300 via-coral-400 to-grape-500 p-8 text-ink-950 sm:p-12 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="inline-flex rounded-full bg-ink-950 px-3 py-1 text-xs font-bold text-white">FREE TOOL · NO SIGN-UP</p>
            <h2 className="mt-5 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Just a few friends? Start with a merry-go-round.</h2>
            <p className="mt-4 max-w-lg text-lg text-ink-950/75">Spin a wheel to pick the payout order, get a calendar of who gets paid when, and share one link with the group chat.</p>
            <Link to="/tools/merry-go-round" className="group mt-7 inline-flex items-center gap-2 rounded-2xl bg-ink-950 px-6 py-4 font-bold text-white transition hover:scale-[1.03]">
              Plan one in 60 seconds <ArrowRight className="size-5 transition group-hover:translate-x-1" />
            </Link>
          </div>
          <div className="relative mx-auto aspect-square w-full max-w-[18rem]">
            <svg viewBox="0 0 200 200" className="size-full animate-spin-slow drop-shadow-2xl" aria-hidden>
              {TEASER_NAMES.map((n, i) => {
                const [x0, y0] = arc(i * 60, 96);
                const [x1, y1] = arc((i + 1) * 60, 96);
                const [tx, ty] = arc((i + 0.5) * 60, 60);
                return (
                  <g key={n}>
                    <path d={`M100,100 L${x0},${y0} A96,96 0 0 1 ${x1},${y1} Z`} fill={TEASER_COLORS[i]} stroke="white" strokeWidth="2" />
                    <text x={tx} y={ty} fill="white" fontSize="12" fontWeight="700" textAnchor="middle" dominantBaseline="middle">
                      {n}
                    </text>
                  </g>
                );
              })}
              <circle cx="100" cy="100" r="18" fill="white" />
            </svg>
            <div className="absolute top-[-4px] left-1/2 h-0 w-0 -translate-x-1/2 border-x-[12px] border-t-[20px] border-x-transparent border-t-ink-950" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
