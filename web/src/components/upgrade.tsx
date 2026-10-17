import { ArrowRight, Gem, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { PLANS } from "../../../shared/plans";
import { ApiError } from "../lib/api";
import { useFund } from "../lib/session";
import { clsx } from "./ui";

/**
 * Shown where someone reaches something their plan doesn't include. Owners get a
 * one-click path to billing; everyone else is told who can upgrade.
 */
export function UpgradeCard({ title, body, points, compact, className }: { title: string; body: ReactNode; points?: string[]; compact?: boolean; className?: string }) {
  const { can, tenantId } = useFund();
  const owner = can("settings:write");
  return (
    <div className={clsx("relative overflow-hidden rounded-2xl bg-ink-950 text-white shadow-xl shadow-grape-500/10", compact ? "p-4" : "p-6 sm:p-7", className)}>
      <div className="pointer-events-none absolute -top-20 -right-16 size-56 rounded-full bg-grape-600/40 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-24 -left-10 size-56 rounded-full bg-brand-500/30 blur-3xl" aria-hidden />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-coral-500 to-sun-400 text-ink-950 shadow-lg">
          <Gem className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold">{title}</p>
          <p className="mt-0.5 text-sm text-white/70">{body}</p>
          {points && !compact && (
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/70">
              {points.map((p) => (
                <li key={p} className="flex items-center gap-1.5">
                  <Sparkles className="size-3 text-sun-300" /> {p}
                </li>
              ))}
            </ul>
          )}
        </div>
        {owner ? (
          <Link to={`/f/${tenantId}/billing`} className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-ink-950 transition hover:scale-[1.03]">
            See plans <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
          </Link>
        ) : (
          <span className="text-xs text-white/60">Ask your fund owner to upgrade.</span>
        )}
      </div>
    </div>
  );
}

/** The server answers 402 when a plan limit or paid feature is hit. */
export const isPlanError = (e: unknown): e is ApiError => e instanceof ApiError && e.status === 402 && (e.code === "plan_limit" || e.code === "plan_feature");

export const GROWTH_POINTS = PLANS.growth.highlights.slice(0, 4);
