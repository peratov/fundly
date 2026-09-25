import type { ReactNode } from "react";
import { Link } from "react-router";
import { scoreBand } from "../../../shared/domain/members";
import { CountUp } from "../lib/motion";
import { clsx } from "./ui";

/** Colour families used across the member portal. */
export const TONES = {
  teal: { grad: "from-brand-400 via-brand-600 to-brand-800", soft: "bg-brand-500/10 text-brand-700 dark:text-brand-300", solid: "bg-brand-600" },
  coral: { grad: "from-coral-400 via-coral-500 to-rose-600", soft: "bg-coral-500/10 text-coral-600 dark:text-coral-400", solid: "bg-coral-500" },
  grape: { grad: "from-grape-400 via-grape-500 to-indigo-700", soft: "bg-grape-500/10 text-grape-600 dark:text-grape-400", solid: "bg-grape-500" },
  sun: { grad: "from-sun-300 via-sun-400 to-orange-500", soft: "bg-sun-400/15 text-amber-700 dark:text-sun-300", solid: "bg-sun-400" },
  rose: { grad: "from-rose-400 via-rose-500 to-fuchsia-600", soft: "bg-rose-500/10 text-rose-600 dark:text-rose-400", solid: "bg-rose-500" },
} as const;
export type PortalTone = keyof typeof TONES;

/** Gradient banner that heads every member-portal page. */
export function PortalHeader({ icon, title, subtitle, tone, children }: { icon: ReactNode; title: string; subtitle?: ReactNode; tone: PortalTone; children?: ReactNode }) {
  return (
    <div className={clsx("bg-noise relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br p-6 text-white shadow-lg sm:p-8", TONES[tone].grad)}>
      <div className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-white/15 blur-2xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-20 left-1/3 size-48 rounded-full bg-black/10 blur-2xl" aria-hidden />
      <div className="relative flex flex-wrap items-center gap-4">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30 backdrop-blur [&>svg]:size-6">{icon}</span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-white/80">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function ScoreRing({ score, size = 132, light }: { score: number; size?: number; light?: boolean }) {
  const band = scoreBand(score);
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, score / 1000));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
        <defs>
          <linearGradient id="scoreGrad" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#2dd4bf" />
            <stop offset="50%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#ff8a65" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className={light ? "stroke-white/20" : "stroke-slate-100 dark:stroke-slate-800"} />
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" strokeLinecap="round" stroke="url(#scoreGrad)" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1)" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-3xl font-extrabold">
          <CountUp value={score} format={(n) => String(Math.round(n))} />
        </span>
        <span className={clsx("text-[11px] font-semibold", light ? "text-white/80" : "text-slate-500")}>{band.label}</span>
      </div>
    </div>
  );
}

/** Big colourful call-to-action tile used on the portal dashboard. */
export function ActionTile({ icon, label, hint, tone, to, onClick }: { icon: ReactNode; label: string; hint?: string; tone: PortalTone; to?: string; onClick?: () => void }) {
  const inner = (
    <>
      <span className={clsx("flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6 [&>svg]:size-5", TONES[tone].grad)}>{icon}</span>
      <span className="mt-3 block font-display text-base font-bold">{label}</span>
      {hint && <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
    </>
  );
  const cls = "group block rounded-3xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200/80 transition hover:-translate-y-1 hover:shadow-lg dark:bg-slate-900 dark:ring-slate-800";
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <button onClick={onClick} className={clsx(cls, "w-full")}>
      {inner}
    </button>
  );
}

/** Colourful stat tile for the member portal. */
export function PortalStat({ icon, label, value, hint, tone }: { icon: ReactNode; label: string; value: ReactNode; hint?: ReactNode; tone: PortalTone }) {
  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-900 dark:ring-slate-800">
      <div className="flex items-center gap-2">
        <span className={clsx("flex size-8 items-center justify-center rounded-xl [&>svg]:size-4", TONES[tone].soft)}>{icon}</span>
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      </div>
      <p className="num mt-2 font-display text-2xl font-extrabold tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}
