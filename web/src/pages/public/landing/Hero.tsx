import { ArrowRight, BadgeCheck, CheckCircle2, Gavel, HeartPulse, Play, Scale, Smartphone, Sparkles, TrendingUp } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { clsx } from "../../../components/ui";
import { useReducedMotion, useTilt } from "../../../lib/motion";
import { LiveScreen } from "./LiveScreen";

const WORDS = ["alumni class", "susu group", "church welfare", "market association", "office co-op", "family fund"];

function RotatingWord() {
  const [i, setI] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setI((x) => (x + 1) % WORDS.length), 2200);
    return () => clearInterval(t);
  }, [reduced]);
  return (
    <span className="relative inline-grid max-w-full overflow-hidden align-bottom">
      {WORDS.map((w, idx) => (
        <span
          key={w}
          className={clsx("col-start-1 row-start-1 text-rainbow transition-all duration-700 sm:whitespace-nowrap", idx === i ? "translate-y-0 opacity-100" : idx === (i - 1 + WORDS.length) % WORDS.length ? "-translate-y-full opacity-0" : "translate-y-full opacity-0")}
          aria-hidden={idx !== i}
        >
          {w}
        </span>
      ))}
    </span>
  );
}

export function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  // Cursor spotlight: CSS variables updated on pointer move, no re-render.
  const onMove = (e: React.PointerEvent) => {
    const el = sectionRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  return (
    <section ref={sectionRef} onPointerMove={onMove} className="bg-noise relative isolate overflow-hidden bg-ink-950 pt-32 pb-24 text-white sm:pt-40 lg:pb-32">
      {/* Aurora blobs */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="absolute -top-40 -left-32 size-[38rem] animate-aurora rounded-full bg-brand-500/40 blur-[120px]" />
        <div className="absolute top-10 right-[-10rem] size-[34rem] animate-aurora-slow rounded-full bg-grape-600/40 blur-[120px]" />
        <div className="absolute bottom-[-14rem] left-1/3 size-[30rem] animate-aurora rounded-full bg-coral-500/30 blur-[120px]" />
        <div className="bg-grid absolute inset-0" />
        <div className="absolute inset-0" style={{ background: "radial-gradient(500px circle at var(--mx, 50%) var(--my, 30%), rgba(255,255,255,0.08), transparent 60%)" }} />
      </div>

      <div className="mx-auto grid max-w-7xl items-center gap-16 px-4 sm:px-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="min-w-0">
          <Link to="/tools/merry-go-round" className="group mb-6 inline-flex animate-pop items-center gap-2 rounded-full bg-white/10 py-1.5 pr-4 pl-1.5 text-sm font-medium text-white/90 ring-1 ring-white/15 backdrop-blur transition hover:bg-white/15">
            <span className="rounded-full bg-gradient-to-r from-coral-500 to-sun-400 px-2.5 py-0.5 text-xs font-bold text-ink-950">FREE</span>
            Plan a merry-go-round with friends
            <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
          </Link>
          <h1 className="animate-rise font-display text-[2.6rem] leading-[1.04] font-extrabold tracking-tight sm:text-7xl">
            Run your <br className="hidden sm:block" />
            <RotatingWord />
            <br />
            like a real bank.
          </h1>
          <p className="mt-7 max-w-xl animate-rise text-lg leading-relaxed text-white/70 [animation-delay:120ms] sm:text-xl">
            Dues, shares, loans and welfare in one beautiful place. Members pay from their phones, committees decide together, and every cedi lands in books that <span className="font-semibold text-white">always balance</span>.
          </p>
          <div className="mt-10 flex animate-rise flex-wrap items-center gap-4 [animation-delay:220ms]">
            <Link
              to="/signup"
              className="group relative inline-flex items-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-coral-500 via-coral-400 to-sun-400 px-7 py-4 text-base font-bold text-ink-950 shadow-2xl shadow-coral-500/30 transition hover:scale-[1.03] hover:shadow-coral-500/50"
            >
              <span className="absolute inset-y-0 left-0 w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-white/50 to-transparent" />
              <span className="relative">Start your fund free</span>
              <ArrowRight className="relative size-5 transition group-hover:translate-x-1" />
            </Link>
            {/* A full page load: the demo runs the app in its own offline mode. */}
            <a href="/f/demo/overview" className="inline-flex items-center gap-2 rounded-2xl px-6 py-4 text-base font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/10">
              <Play className="size-4 fill-current" /> Try the live demo
            </a>
          </div>
          <ul className="mt-10 flex animate-rise flex-wrap gap-x-6 gap-y-2 text-sm text-white/60 [animation-delay:320ms]">
            {["14 days free", "No card needed", "Unlimited members", "Import your spreadsheet"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-brand-300" /> {t}
              </li>
            ))}
          </ul>
        </div>

        <LiveStage />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- live product stage

interface DemoEvent {
  id: number;
  action: string;
  summary: string;
  actorName: string | null;
  createdAt: string;
}

const EVENT_STYLE: [prefix: string, icon: ReactNode, tone: string][] = [
  ["contribution", <Smartphone />, "from-brand-400 to-brand-600"],
  ["payment", <Smartphone />, "from-brand-400 to-brand-600"],
  ["loan", <Gavel />, "from-grape-400 to-grape-600"],
  ["claim", <HeartPulse />, "from-coral-400 to-coral-600"],
  ["member", <BadgeCheck />, "from-sky-400 to-sky-600"],
  ["shares", <TrendingUp />, "from-sun-300 to-sun-500"],
];
const styleOf = (action: string) => EVENT_STYLE.find(([p]) => action.startsWith(p)) ?? ["", <Scale />, "from-sun-300 to-sun-500"];

/** Real activity from the demo fund's audit log, the same feed staff see on their dashboard. */
function useDemoActivity() {
  const [events, setEvents] = useState<DemoEvent[]>([]);
  useEffect(() => {
    let live = true;
    fetch("/demo/fixtures.json")
      .then((r) => r.json())
      .then((f: { responses: Record<string, { activity?: DemoEvent[] }> }) => live && setEvents(f.responses["/t/demo/overview"]?.activity ?? []))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return events;
}

function LiveStage() {
  const tilt = useTilt(6);
  const reduced = useReducedMotion();
  const events = useDemoActivity();
  const [feed, setFeed] = useState(0);
  // On touch screens a framed app would trap page scrolling, so the phone opens the full demo instead.
  const [touch] = useState(() => typeof window !== "undefined" && window.matchMedia("(hover: none)").matches);

  useEffect(() => {
    if (reduced || events.length < 2) return;
    const t = setInterval(() => setFeed((x) => x + 1), 3200);
    return () => clearInterval(t);
  }, [reduced, events.length]);

  const visible = events.length ? [0, 1, 2].map((k) => events[(feed + k) % events.length]) : [];

  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none" {...tilt}>
      {/* Spinning ring behind the phone */}
      <div className="absolute top-1/2 left-1/2 -z-10 size-[26rem] -translate-x-1/2 -translate-y-1/2 animate-spin-slow rounded-full opacity-60" style={{ background: "conic-gradient(from 0deg, #2dd4bf, #a78bfa, #ff6b4a, #ffd23f, #2dd4bf)", mask: "radial-gradient(circle, transparent 62%, black 63%, black 64%, transparent 65%)" }} aria-hidden />

      {/* Phone running the real member app */}
      <div className="relative mx-auto w-[18rem] rounded-[2.6rem] bg-gradient-to-b from-slate-700 to-slate-900 p-2.5 shadow-2xl shadow-black/60 ring-1 ring-white/20" style={{ transform: "translateZ(40px)" }}>
        <div className="relative overflow-hidden rounded-[2.1rem] bg-ink-900">
          <div className="flex h-7 items-center justify-between px-6 text-[10px] font-semibold text-white/80" aria-hidden>
            <span>9:41</span>
            <span className="h-4 w-20 rounded-full bg-black" />
            <span>5G ▮▮▮</span>
          </div>
          <LiveScreen src="/f/demo-member/portal" width={390} height={780} eager interactive={!touch} title="The Fundly member app, running live with demo data" />
          {touch && (
            <a href="/f/demo-member/portal" className="absolute inset-0" aria-label="Open the member app demo">
              <span className="sr-only">Open the member app demo</span>
            </a>
          )}
        </div>
      </div>

      {/* Floating activity feed: real events from the demo fund */}
      <div className="pointer-events-none absolute inset-0" style={{ transform: "translateZ(80px)" }}>
        {visible.map((f, k) => {
          const [, icon, tone] = styleOf(f.action);
          return (
            <div
              key={`${feed}-${k}`}
              className={clsx(
                "absolute hidden w-64 animate-pop items-center gap-3 rounded-2xl bg-ink-900/95 p-3 text-white shadow-2xl shadow-black/50 ring-1 ring-white/15 backdrop-blur-xl xl:flex",
                k === 0 && "top-10 left-[calc(50%-21rem)]",
                k === 1 && "top-[46%] left-[calc(50%+6.5rem)]",
                k === 2 && "bottom-10 left-[calc(50%-20rem)]",
              )}
              style={{ animationDelay: `${k * 120}ms` }}
            >
              <span className={clsx("flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg [&>svg]:size-5", tone)}>{icon}</span>
              <span className="min-w-0">
                <span className="line-clamp-2 text-sm leading-snug font-semibold">{f.summary}</span>
                <span className="block truncate text-xs text-white/60">{f.actorName ?? "Fundly"}</span>
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-white/50">
        <Sparkles className="size-3.5 shrink-0" />
        <span>
          The real member app with demo data. {touch ? "Tap to explore." : "Go ahead, click around."}{" "}
          <a href="/f/demo/overview" className="font-semibold text-white/80 underline-offset-2 hover:text-white hover:underline">
            Open the staff demo →
          </a>
        </span>
      </p>
    </div>
  );
}
