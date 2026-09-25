import { AlertTriangle, ArrowRight, BellRing, CalendarPlus, Check, Copy, Crown, KeyRound, Link2, MailCheck, MessageCircle, PartyPopper, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router";
import { buildSchedule, currentRoundIndex, FREQUENCY_LABELS, roundProgress, toIcs } from "../../../../shared/domain/rotation";
import { clsx, Spinner, useToast } from "../../components/ui";
import { formatDate, todayIso } from "../../lib/format";
import { Confetti } from "../../lib/motion";
import { Logo } from "../public/landing/Nav";
import { RecoverLinkModal } from "./RecoverLink";
import { circleApi, colorFor, download, errorMessage, fmt, getToken, ownerUrl, saveToken, shareUrl, whatsappLink, type CircleView as View } from "./circle-shared";

function daysUntil(date: string) {
  return Math.round((new Date(`${date}T00:00:00Z`).getTime() - new Date(`${todayIso()}T00:00:00Z`).getTime()) / 86_400_000);
}

export default function CircleView() {
  const { slug = "" } = useParams();
  const [params] = useSearchParams();
  const toast = useToast();
  const [data, setData] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const welcome = params.has("welcome");
  const emailedTo = (useLocation().state as { emailedTo?: string | null } | null)?.emailedTo;
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    root.classList.remove("dark");
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    document.head.appendChild(robots);

    const load = () => {
      // An organiser link carries the token in the URL fragment; keep it on this device and tidy the URL.
      const m = location.hash.match(/edit=([\w-]+)/);
      if (m) {
        saveToken(slug, m[1]);
        history.replaceState(history.state, "", location.pathname + location.search);
      }
      const t = getToken(slug);
      setToken(t);
      circleApi<View>("GET", `/circles/${slug}`, undefined, t)
        .then((v) => {
          setData(v);
          document.title = `${v.circle.name} · merry-go-round`;
        })
        .catch((e) => setError(errorMessage(e)));
    };
    load();
    // Opening an organiser link while this page is already open only changes the fragment — no reload.
    const onHash = () => location.hash.includes("edit=") && load();
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("hashchange", onHash);
      robots.remove();
      if (wasDark) root.classList.add("dark");
    };
  }, [slug]);

  const derived = useMemo(() => {
    if (!data) return null;
    const c = data.circle;
    const schedule = buildSchedule({ startDate: c.startDate, frequency: c.frequency, amountMinor: c.amountMinor, order: c.order });
    const colorIndex = new Map(c.members.map((m, i) => [m.id, i]));
    const byId = new Map(c.members.map((m) => [m.id, m]));
    const current = currentRoundIndex(schedule, todayIso());
    return { c, schedule, colorIndex, byId, current, pot: c.amountMinor * c.members.length };
  }, [data]);

  if (error) {
    return (
      <Shell>
        <div className="mx-auto max-w-md py-24 text-center">
          <p className="font-display text-2xl font-bold">We couldn't find that circle.</p>
          <p className="mt-2 text-slate-500">{error}</p>
          <Link to="/tools/merry-go-round" className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-ink-950 px-5 py-3 font-bold text-white">
            Start a new circle <ArrowRight className="size-4" />
          </Link>
        </div>
      </Shell>
    );
  }
  if (!data || !derived) {
    return (
      <Shell>
        <div className="flex justify-center py-32">
          <Spinner className="size-8" />
        </div>
      </Shell>
    );
  }

  const { c, schedule, colorIndex, byId, current, pot } = derived;
  const owner = data.canEdit && !!token;
  const next = schedule[Math.min(current, schedule.length - 1)];
  const finished = current >= schedule.length;
  const nextName = byId.get(next.recipientId)?.name ?? "";
  const days = daysUntil(next.date);
  const link = shareUrl(slug);
  const shareText = `Our merry-go-round "${c.name}": ${fmt(c.amountMinor, c.currency)} ${FREQUENCY_LABELS[c.frequency].toLowerCase()}, pot of ${fmt(pot, c.currency)}. See the payout order and dates: ${link}`;

  const togglePaid = async (round: number, memberId: string) => {
    if (!owner) return;
    const key = String(round);
    const before = data.payments;
    const paid = before[key] ?? [];
    const nextPaid = paid.includes(memberId) ? paid.filter((x) => x !== memberId) : [...paid, memberId];
    const payments = { ...before, [key]: nextPaid };
    setData({ ...data, payments });
    try {
      const saved = await circleApi<View>("PATCH", `/circles/${slug}`, { payments }, token);
      setData(saved);
    } catch (e) {
      setData({ ...data, payments: before });
      toast(errorMessage(e), "error");
    }
  };

  const copy = (text: string, msg: string) => {
    navigator.clipboard?.writeText(text);
    toast(msg);
  };

  return (
    <Shell>
      {/* Hero */}
      <section className="bg-noise relative overflow-hidden bg-ink-950 pt-28 pb-16 text-white">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -top-32 -left-10 size-[28rem] animate-aurora rounded-full bg-grape-600/40 blur-[110px]" />
          <div className="absolute right-0 -bottom-32 size-[26rem] animate-aurora-slow rounded-full bg-coral-500/35 blur-[110px]" />
          <div className="bg-grid absolute inset-0" />
        </div>
        {welcome && owner && <Confetti pieces={48} />}
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-white/15">
              {owner ? <Crown className="size-3.5 text-sun-300" /> : <Sparkles className="size-3.5 text-sun-300" />}
              {owner ? "You're the organiser" : `Organised by ${data.organizerName}`}
            </p>
            <h1 className="mt-5 font-display text-4xl font-extrabold tracking-tight sm:text-6xl">{c.name}</h1>
            <p className="mt-4 text-lg text-white/70">
              {c.members.length} friends · {fmt(c.amountMinor, c.currency)} {FREQUENCY_LABELS[c.frequency].toLowerCase()} · pot of <span className="font-bold text-white">{fmt(pot, c.currency)}</span>
            </p>
            <div className="mt-6 flex -space-x-2">
              {c.order.map((id) => (
                <span key={id} title={byId.get(id)?.name} className={clsx("flex size-10 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold ring-4 ring-ink-950", colorFor(colorIndex.get(id) ?? 0).grad)}>
                  {byId.get(id)?.name[0]?.toUpperCase()}
                </span>
              ))}
            </div>
          </div>
          <div className="glass rounded-3xl p-6">
            {finished ? (
              <div className="text-center">
                <PartyPopper className="mx-auto size-10 text-sun-300" />
                <p className="mt-3 font-display text-2xl font-extrabold">Circle complete!</p>
                <p className="mt-1 text-sm text-white/60">Everyone has had their turn. Start another round?</p>
              </div>
            ) : (
              <>
                <p className="text-xs font-semibold tracking-[0.2em] text-white/50 uppercase">{current === 0 && days > 0 ? "First payout" : "Next payout"}</p>
                <div className="mt-3 flex items-center gap-4">
                  <span className={clsx("flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br font-display text-xl font-extrabold", colorFor(colorIndex.get(next.recipientId) ?? 0).grad)}>{nextName[0]?.toUpperCase()}</span>
                  <div>
                    <p className="font-display text-2xl font-extrabold">{nextName}</p>
                    <p className="text-sm text-white/60">
                      {formatDate(next.date)} · round {next.index + 1} of {schedule.length}
                    </p>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
                    <p className="font-display text-3xl font-extrabold text-sun-300">{days <= 0 ? "Today" : days}</p>
                    <p className="text-xs text-white/50">{days <= 0 ? "payout day" : days === 1 ? "day to go" : "days to go"}</p>
                  </div>
                  <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
                    <p className="font-display text-3xl font-extrabold">{fmt(next.potMinor, c.currency)}</p>
                    <p className="text-xs text-white/50">in the pot</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          {welcome && owner && (
            <div className="animate-pop rounded-3xl bg-gradient-to-r from-brand-500 via-grape-500 to-coral-500 p-[2px]">
              <div className="rounded-[calc(1.5rem-2px)] bg-white p-5">
                <p className="font-display text-xl font-extrabold">🎉 Your circle is live</p>
                {emailedTo ? (
                  <p className="mt-2 flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    <MailCheck className="mt-0.5 size-4 shrink-0" />
                    <span>
                      We've emailed your private organiser link to <b>{emailedTo}</b>. Keep that email — it's how you edit from another phone.
                    </span>
                  </p>
                ) : (
                  <p className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <span>We couldn't send the email just now. Copy your organiser link below and keep it somewhere safe.</span>
                  </p>
                )}
                <p className="mt-2 text-sm text-slate-600">Next: share the link in your group chat.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <a href={whatsappLink(shareText)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-600">
                    <MessageCircle className="size-4" /> Share on WhatsApp
                  </a>
                  <button onClick={() => copy(ownerUrl(slug, token!), "Organiser link copied — keep it private")} className="inline-flex items-center gap-2 rounded-xl bg-ink-950 px-4 py-2.5 text-sm font-bold text-white">
                    <KeyRound className="size-4" /> Copy my organiser link
                  </button>
                </div>
              </div>
            </div>
          )}

          <h2 className="font-display text-2xl font-extrabold tracking-tight">Payout calendar</h2>
          <ol className="space-y-3">
            {schedule.map((r) => {
              const m = byId.get(r.recipientId)!;
              const col = colorFor(colorIndex.get(m.id) ?? 0);
              const paid = data.payments[String(r.index)] ?? [];
              const prog = roundProgress(r, c.order, paid, c.amountMinor);
              const state = r.index < current ? "past" : r.index === current ? "now" : "future";
              const unpaid = c.order.filter((id) => id !== r.recipientId && !paid.includes(id)).map((id) => byId.get(id)!);
              return (
                <li key={r.index} className={clsx("overflow-hidden rounded-3xl bg-white ring-1 transition", state === "now" ? "shadow-xl ring-2 ring-coral-400" : "ring-slate-200", state === "past" && prog.complete && "opacity-80")}>
                  <div className="flex items-center gap-4 p-4">
                    <span className={clsx("flex size-12 shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-br text-white", col.grad)}>
                      <span className="text-[10px] leading-none font-semibold opacity-80">ROUND</span>
                      <span className="font-display text-lg leading-none font-extrabold">{r.index + 1}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-lg font-bold">{m.name}</p>
                      <p className="text-sm text-slate-500">{formatDate(r.date)}</p>
                    </div>
                    <div className="text-right">
                      <p className="num font-display text-lg font-extrabold">{fmt(r.potMinor, c.currency)}</p>
                      {state === "now" ? (
                        <span className="rounded-full bg-coral-500 px-2 py-0.5 text-[11px] font-bold text-white">Up next</span>
                      ) : prog.complete ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                          <Check className="size-3.5" /> All paid
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">{state === "past" ? `${prog.paid}/${prog.expected} paid` : "Upcoming"}</span>
                      )}
                    </div>
                  </div>
                  {(owner || prog.paid > 0) && state !== "future" && (
                    <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3">
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-600">
                          {prog.paid} of {prog.expected} paid in · {fmt(prog.collectedMinor, c.currency)}
                        </span>
                        {owner && unpaid.length > 0 && (
                          <a
                            href={whatsappLink(`Hi everyone 👋 Round ${r.index + 1} of "${c.name}" goes to ${m.name} on ${formatDate(r.date)}. Still waiting on ${fmt(c.amountMinor, c.currency)} from: ${unpaid.map((u) => u.name).join(", ")}. Thank you! ${link}`)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-bold text-emerald-700 hover:underline"
                          >
                            <BellRing className="size-3.5" /> Remind on WhatsApp
                          </a>
                        )}
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-emerald-500 transition-all duration-500" style={{ width: `${prog.expected ? (prog.paid / prog.expected) * 100 : 0}%` }} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {c.order
                          .filter((id) => id !== r.recipientId)
                          .map((id) => {
                            const isPaid = paid.includes(id);
                            return (
                              <button
                                key={id}
                                type="button"
                                disabled={!owner}
                                onClick={() => togglePaid(r.index, id)}
                                className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition", isPaid ? "bg-emerald-500 text-white ring-emerald-500" : "bg-white text-slate-600 ring-slate-200", owner && "hover:scale-105")}
                                aria-pressed={isPaid}
                              >
                                {isPaid && <Check className="size-3" />} {byId.get(id)?.name}
                              </button>
                            );
                          })}
                      </div>
                      {owner && <p className="mt-2 text-[11px] text-slate-400">Tap a name to mark their payment.</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <p className="font-display text-lg font-bold">Share & save</p>
            <div className="mt-4 grid gap-2">
              <a href={whatsappLink(shareText)} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl bg-emerald-500 px-4 py-3 font-bold text-white hover:bg-emerald-600">
                <MessageCircle className="size-5" /> Send to the group chat
              </a>
              <button onClick={() => copy(link, "Link copied")} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-left font-semibold ring-1 ring-slate-200 hover:bg-slate-100">
                <Link2 className="size-5 text-grape-500" /> Copy share link
              </button>
              <button
                onClick={() => download(`${c.name.replace(/\W+/g, "-")}.ics`, toIcs({ name: c.name, currencyLabel: (mn) => fmt(mn, c.currency), schedule, members: c.members, url: link }), "text/calendar")}
                className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-left font-semibold ring-1 ring-slate-200 hover:bg-slate-100"
              >
                <CalendarPlus className="size-5 text-coral-500" /> Add dates to my calendar
              </button>
              {owner && (
                <button onClick={() => copy(ownerUrl(slug, token!), "Organiser link copied — keep it private")} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-left font-semibold ring-1 ring-slate-200 hover:bg-slate-100">
                  <KeyRound className="size-5 text-sun-500" />
                  <span>
                    Copy organiser link
                    <span className="block text-xs font-normal text-slate-500">Opens this page with editing on any phone. Don't share it.</span>
                  </span>
                  <Copy className="ml-auto size-4 text-slate-400" />
                </button>
              )}
            </div>
          </div>

          {/* Upsell / lead conversion */}
          <div className="bg-noise relative overflow-hidden rounded-3xl bg-ink-950 p-6 text-white">
            <div className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-coral-500/40 blur-3xl" aria-hidden />
            <div className="relative">
              <Logo />
              {owner ? (
                <>
                  <p className="mt-5 font-display text-2xl leading-tight font-extrabold">Ready for more than a merry-go-round?</p>
                  <p className="mt-2 text-sm text-white/70">Turn this circle into a proper fund: savings that earn shares, loans between friends, welfare cover and mobile money collection.</p>
                  <Link to={`/signup?${new URLSearchParams({ currency: c.currency, dues: String(c.amountMinor / 100), fund: c.name })}`} className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-coral-500 to-sun-400 px-5 py-3 font-bold text-ink-950 hover:scale-[1.02]">
                    Upgrade to a Fundly fund <ArrowRight className="size-4" />
                  </Link>
                  <p className="mt-2 text-xs text-white/40">14 days free · your circle stays free forever</p>
                </>
              ) : (
                <>
                  <p className="mt-5 font-display text-2xl leading-tight font-extrabold">Start your own circle — free</p>
                  <p className="mt-2 text-sm text-white/70">Spin the wheel for the order, share one link, and never argue about whose turn it is again.</p>
                  <Link to="/tools/merry-go-round" className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-coral-500 to-sun-400 px-5 py-3 font-bold text-ink-950 hover:scale-[1.02]">
                    Plan a merry-go-round <ArrowRight className="size-4" />
                  </Link>
                  <button type="button" onClick={() => setRecovering(true)} className="mt-4 block text-left text-xs text-white/60 hover:text-white">
                    Are you the organiser? <span className="font-semibold underline">Email me my organiser link</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </aside>
      </main>
      {recovering && <RecoverLinkModal slug={slug} onClose={() => setRecovering(false)} />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#fbfaf7] font-sans text-slate-900">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-8">
          <Logo />
          <Link to="/tools/merry-go-round" className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20 hover:bg-white/20">
            Plan your own
          </Link>
        </div>
      </header>
      {children}
      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500">
        Made with the free merry-go-round planner from{" "}
        <Link to="/" className="font-semibold text-slate-800 hover:underline">
          Fundly
        </Link>
      </footer>
    </div>
  );
}
