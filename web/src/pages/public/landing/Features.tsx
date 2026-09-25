import { ArrowUpRight, Gavel, HeartPulse, LayoutDashboard, Scale, ShieldCheck, Smartphone, Sparkles, Users, Wallet } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { clsx } from "../../../components/ui";
import { Reveal } from "../../../lib/motion";
import { LiveScreen } from "./LiveScreen";

/*
 * A tour of the real product. Every screen below is the actual Fundly app running
 * in demo mode on a snapshot of the demo fund (see web/src/demo/demo.ts).
 */

interface Stop {
  key: string;
  icon: ReactNode;
  accent: string;
  title: string;
  body: string;
  src: string;
  device: "desktop" | "phone";
}

const STOPS: Stop[] = [
  {
    key: "dashboard",
    icon: <LayoutDashboard />,
    accent: "from-brand-400 to-brand-700",
    title: "Your whole fund at a glance",
    body: "Cash, savings, loans and the welfare reserve, straight from the books. Plus what needs your attention today.",
    src: "/f/demo/overview",
    device: "desktop",
  },
  {
    key: "dues",
    icon: <Wallet />,
    accent: "from-coral-400 to-coral-600",
    title: "Dues, month by month",
    body: "Who paid, who's late and who's behind, for every member. Record a payment in two taps.",
    src: "/f/demo/contributions",
    device: "desktop",
  },
  {
    key: "committee",
    icon: <Gavel />,
    accent: "from-grape-400 to-grape-600",
    title: "Committees decide together",
    body: "The credit committee reviews with the applicant's full record alongside. The manager approves. Nobody can approve their own loan.",
    src: "/f/demo/loans/featured",
    device: "desktop",
  },
  {
    key: "scores",
    icon: <Sparkles />,
    accent: "from-sky-400 to-sky-600",
    title: "Credit scores anyone can understand",
    body: "Five plain habits make up every member's score and borrowing limit. No black box.",
    src: "/f/demo/members/featured",
    device: "desktop",
  },
  {
    key: "books",
    icon: <Scale />,
    accent: "from-sun-300 to-sun-500",
    title: "Books that balance themselves",
    body: "Every cedi is double-entry. Inflows, outflows and the loan book are ready for the AGM and the auditors.",
    src: "/f/demo/reports",
    device: "desktop",
  },
  {
    key: "member",
    icon: <HeartPulse />,
    accent: "from-rose-400 to-rose-600",
    title: "A member app they'll actually open",
    body: "Members check savings, pay dues by mobile money, apply for loans and see their welfare cover, all from their phone.",
    src: "/f/demo-member/portal",
    device: "phone",
  },
];

function useNarrow() {
  const q = "(max-width: 1023px)";
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}

function PhoneFrame({ src, interactive }: { src: string; interactive: boolean }) {
  return (
    <div className="mx-auto w-[min(19rem,100%)] rounded-[2.4rem] bg-gradient-to-b from-slate-700 to-slate-900 p-2.5 shadow-2xl shadow-slate-900/30 ring-1 ring-slate-900/10">
      <div className="relative overflow-hidden rounded-[1.9rem]">
        <LiveScreen key={src} src={src} width={390} height={780} interactive={interactive} title="Fundly member app, live demo" />
        {!interactive && <OpenOverlay src={src} />}
      </div>
    </div>
  );
}

/** On phones a framed app would trap scrolling, so the preview opens the full demo instead. */
function OpenOverlay({ src }: { src: string }) {
  return (
    <a href={src} className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-ink-950/60 via-transparent to-transparent pb-5">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink-900 shadow-lg">
        Tap to explore <ArrowUpRight className="size-4" />
      </span>
    </a>
  );
}

function BrowserFrame({ stop }: { stop: Stop }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-2xl shadow-slate-900/15 ring-1 ring-slate-900/10 dark:bg-slate-900">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-100 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-3 rounded-full bg-rose-400" />
          <span className="size-3 rounded-full bg-amber-400" />
          <span className="size-3 rounded-full bg-emerald-400" />
        </span>
        <span className="min-w-0 flex-1 truncate rounded-md bg-white px-3 py-1 text-center text-xs text-slate-500 dark:bg-slate-900">app.fundly · {stop.title}</span>
        <a href={stop.src} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">
          Full screen <ArrowUpRight className="size-3.5" />
        </a>
      </div>
      {stop.device === "phone" ? (
        <div className="bg-gradient-to-br from-brand-50 via-white to-grape-50 px-6 py-8 dark:from-slate-900 dark:to-slate-900">
          <PhoneFrame src={stop.src} interactive />
        </div>
      ) : (
        <LiveScreen key={stop.src} src={stop.src} width={1100} height={740} title={`Fundly: ${stop.title} (live demo)`} />
      )}
    </div>
  );
}

function Tour() {
  const [active, setActive] = useState(STOPS[0].key);
  const narrow = useNarrow();
  const stop = STOPS.find((s) => s.key === active)!;

  const tabs = (
    <div role="tablist" aria-label="Product tour" className={clsx(narrow ? "-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2" : "flex flex-col gap-2")}>
      {STOPS.map((s) => {
        const on = s.key === active;
        return (
          <button
            key={s.key}
            role="tab"
            aria-selected={on}
            onClick={() => setActive(s.key)}
            className={clsx(
              "group flex snap-start gap-3 rounded-2xl text-left transition",
              narrow ? "shrink-0 items-center px-4 py-2.5 text-sm font-semibold" : "p-4",
              on ? "bg-white shadow-lg ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700" : "hover:bg-white/70 dark:hover:bg-slate-900/60",
            )}
          >
            <span className={clsx("flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow [&>svg]:size-4", s.accent, narrow ? "size-7" : "size-10 [&>svg]:size-5")}>{s.icon}</span>
            {narrow ? (
              <span className="whitespace-nowrap">{s.title}</span>
            ) : (
              <span className="min-w-0">
                <span className="block font-display text-base font-bold">{s.title}</span>
                <span className={clsx("mt-1 block text-sm text-slate-600 dark:text-slate-400", !on && "line-clamp-1")}>{s.body}</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="mt-14 grid gap-8 lg:grid-cols-[22rem_1fr]">
      {tabs}
      <div role="tabpanel" aria-label={stop.title} className="min-w-0">
        {narrow ? (
          <>
            <p className="mb-5 text-slate-600 dark:text-slate-400">{stop.body}</p>
            <PhoneFrame src={stop.src} interactive={false} />
          </>
        ) : (
          <BrowserFrame stop={stop} />
        )}
      </div>
    </div>
  );
}

export function Features() {
  return (
    <section id="features" className="relative bg-[#fbfaf7] py-24 text-slate-900 sm:py-32 dark:bg-slate-950 dark:text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-8">
        <Reveal className="max-w-3xl">
          <p className="text-sm font-bold tracking-[0.2em] text-brand-700 uppercase dark:text-brand-300">The real product, not a mock-up</p>
          <h2 className="mt-4 font-display text-4xl font-extrabold tracking-tight sm:text-6xl">
            Serious money tools. <span className="bg-gradient-to-r from-coral-500 to-grape-600 bg-clip-text text-transparent">Surprisingly fun to use.</span>
          </h2>
          <p className="mt-5 text-lg text-slate-600 dark:text-slate-400">
            Every screen below is Fundly itself, running on a demo fund with seven years of history. Click around: nothing you do is saved.{" "}
            <a href="/f/demo/overview" className="font-semibold text-brand-700 hover:underline dark:text-brand-300">
              Open the full demo →
            </a>
          </p>
        </Reveal>

        <Tour />

        <Reveal className="mt-14 grid gap-5 sm:grid-cols-3">
          {[
            { i: <Smartphone />, t: "Mobile money built in", b: "MTN, Telecel and AirtelTigo prompts straight to members' phones.", c: "text-coral-500" },
            { i: <Users />, t: "Roles for everyone", b: "Owner, manager, credit and audit committees, and members. Each sees just what they need.", c: "text-grape-500" },
            { i: <ShieldCheck />, t: "An audit trail for everything", b: "Every change is recorded with who did it and when. Nothing is ever silently edited.", c: "text-brand-600" },
          ].map((x) => (
            <div key={x.t} className="flex gap-4 rounded-3xl bg-white p-6 ring-1 ring-slate-200/80 dark:bg-slate-900 dark:ring-slate-800">
              <span className={clsx("mt-0.5 [&>svg]:size-6", x.c)}>{x.i}</span>
              <div>
                <p className="font-display font-bold">{x.t}</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{x.b}</p>
              </div>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
