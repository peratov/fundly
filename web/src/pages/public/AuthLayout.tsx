import { CheckCircle2, HandCoins, HeartPulse, Smartphone } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "./landing/Nav";

const POINTS = [
  { icon: <Smartphone />, t: "Dues by mobile money", c: "from-coral-400 to-coral-600" },
  { icon: <HandCoins />, t: "Fair, transparent loans", c: "from-grape-400 to-grape-600" },
  { icon: <HeartPulse />, t: "Welfare when it matters", c: "from-brand-400 to-brand-600" },
];

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <aside className="bg-noise relative hidden overflow-hidden bg-ink-950 p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -top-32 -left-24 size-[30rem] animate-aurora rounded-full bg-brand-500/40 blur-[110px]" />
          <div className="absolute right-[-8rem] bottom-[-6rem] size-[28rem] animate-aurora-slow rounded-full bg-coral-500/35 blur-[110px]" />
          <div className="absolute top-1/2 left-1/3 size-72 animate-aurora rounded-full bg-grape-600/35 blur-[100px]" />
          <div className="bg-grid absolute inset-0" />
        </div>
        <div className="relative">
          <Logo />
        </div>
        <div className="relative my-auto max-w-md">
          <h2 className="font-display text-5xl leading-[1.05] font-extrabold tracking-tight">
            Your group's money, <span className="text-rainbow">beautifully</span> in order.
          </h2>
          <ul className="mt-10 space-y-4">
            {POINTS.map((p, i) => (
              <li key={p.t} className="glass flex animate-pop items-center gap-4 rounded-2xl p-4" style={{ animationDelay: `${200 + i * 120}ms` }}>
                <span className={`flex size-11 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg [&>svg]:size-5 ${p.c}`}>{p.icon}</span>
                <span className="font-semibold">{p.t}</span>
                <CheckCircle2 className="ml-auto size-5 text-brand-300" />
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/40">Books that always balance. Members who always know where they stand.</p>
      </aside>

      <main className="flex flex-col items-center justify-center bg-[#fbfaf7] px-4 py-10 dark:bg-slate-950">
        <div className="mb-8 lg:hidden">
          <div className="rounded-2xl bg-ink-950 px-4 py-2">
            <Logo />
          </div>
        </div>
        <div className="w-full max-w-md">
          <h1 className="font-display text-3xl font-extrabold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-slate-500">{subtitle}</p>}
          <div className="mt-8 rounded-3xl bg-white p-6 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200 sm:p-8 dark:bg-slate-900 dark:shadow-none dark:ring-slate-800">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
