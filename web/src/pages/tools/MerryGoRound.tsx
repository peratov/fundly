import { ArrowDown, ArrowRight, ArrowUp, CalendarDays, Check, Coins, Lock, RotateCcw, Share2, Shuffle, Sparkles, Trash2, UserPlus, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { buildSchedule, FREQUENCY_LABELS, shuffle, type Frequency } from "../../../../shared/domain/rotation";
import { clsx, Modal } from "../../components/ui";
import { formatDate, todayIso, toMinor } from "../../lib/format";
import { Reveal } from "../../lib/motion";
import { Footer } from "../public/landing/Sections";
import { Nav } from "../public/landing/Nav";
import { circleApi, colorFor, CURRENCY_OPTIONS, errorMessage, fmt, newId, saveToken, type Circle, type CircleView } from "./circle-shared";
import { RecoverLinkModal } from "./RecoverLink";
import { Wheel } from "./Wheel";

const DRAFT_KEY = "fundly-mgr-draft";

interface Draft {
  name: string;
  currency: string;
  amount: string;
  frequency: Frequency;
  startDate: string;
  members: { id: string; name: string; phone?: string }[];
  order: string[];
}

function nextFriday() {
  const d = new Date();
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

const EMPTY: Draft = { name: "", currency: "GHS", amount: "200", frequency: "monthly", startDate: nextFriday(), members: [], order: [] };

function loadDraft(): Draft {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
    return d ? { ...EMPTY, ...d } : EMPTY;
  } catch {
    return EMPTY;
  }
}

function safeMinor(v: string) {
  try {
    return v ? toMinor(v) : 0;
  } catch {
    return 0;
  }
}

export default function MerryGoRound() {
  const [d, setD] = useState<Draft>(loadDraft);
  const [step, setStep] = useState(d.members.length >= 2 ? (d.order.length === d.members.length ? 3 : 2) : 1);
  const [saving, setSaving] = useState(false);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    document.title = "Free merry-go-round planner for friends · Fundly";
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    root.classList.remove("dark");
    return () => {
      if (wasDark) root.classList.add("dark");
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch {
      /* ignore */
    }
  }, [d]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((s) => ({ ...s, [k]: v }));
  const amountMinor = safeMinor(d.amount);
  const orderComplete = d.members.length >= 2 && d.order.length === d.members.length;
  const colorIndex = useMemo(() => new Map(d.members.map((m, i) => [m.id, i])), [d.members]);
  const schedule = orderComplete ? buildSchedule({ startDate: d.startDate, frequency: d.frequency, amountMinor, order: d.order }) : [];
  const pot = amountMinor * d.members.length;
  const step1Ok = d.name.trim().length >= 2 && amountMinor > 0 && !!d.startDate;

  const circle: Circle | null = orderComplete && step1Ok ? { name: d.name.trim(), currency: d.currency as Circle["currency"], amountMinor, frequency: d.frequency, startDate: d.startDate, members: d.members, order: d.order } : null;

  return (
    <div className="min-h-dvh bg-[#fbfaf7] font-sans text-slate-900">
      <Nav />
      <header className="bg-noise relative overflow-hidden bg-ink-950 pt-32 pb-20 text-white">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -top-32 left-0 size-[30rem] animate-aurora rounded-full bg-coral-500/35 blur-[110px]" />
          <div className="absolute right-0 -bottom-40 size-[30rem] animate-aurora-slow rounded-full bg-grape-600/40 blur-[110px]" />
          <div className="bg-grid absolute inset-0" />
        </div>
        <div className="relative mx-auto max-w-5xl px-4 text-center sm:px-8">
          <p className="inline-flex animate-pop items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold ring-1 ring-white/15">
            <Sparkles className="size-4 text-sun-300" /> Free forever · no sign-up to plan
          </p>
          <h1 className="mt-6 animate-rise font-display text-5xl leading-[1.02] font-extrabold tracking-tight sm:text-7xl">
            The <span className="text-rainbow">merry-go-round</span> planner for friends
          </h1>
          <p className="mx-auto mt-6 max-w-2xl animate-rise text-lg text-white/70 [animation-delay:120ms]">
            Susu, chama, esusu, tontine — whatever you call it. Add your friends, spin the wheel to decide who gets paid first, and share one link so everyone knows exactly when it's their turn.
          </p>
        </div>
      </header>

      <main className="mx-auto -mt-10 grid max-w-6xl gap-6 px-4 pb-24 sm:px-8 lg:grid-cols-[1.15fr_0.85fr]">
        {/* Builder */}
        <section className="relative rounded-[2rem] bg-white p-5 shadow-xl shadow-slate-200/70 ring-1 ring-slate-200 sm:p-8">
          <Stepper step={step} onStep={(s) => (s === 1 || (s === 2 && step1Ok) || (s === 3 && step1Ok && d.members.length >= 2)) && setStep(s)} />

          {step === 1 && (
            <div className="mt-8 animate-pop space-y-6">
              <label className="block">
                <span className="text-sm font-semibold">What's your circle called?</span>
                <input value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Friday Friends Susu" maxLength={80} className="mt-2 w-full rounded-2xl border-0 bg-slate-50 px-4 py-3.5 font-display text-xl font-bold ring-1 ring-slate-200 focus:ring-2 focus:ring-coral-500" />
              </label>
              <div>
                <span className="text-sm font-semibold">Everyone pays</span>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <div className="flex items-center rounded-2xl bg-slate-50 ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-coral-500">
                    <select value={d.currency} onChange={(e) => set("currency", e.target.value)} className="rounded-l-2xl border-0 bg-transparent py-3.5 pr-2 pl-4 text-base font-bold focus:ring-0" aria-label="Currency">
                      {CURRENCY_OPTIONS.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                    <input inputMode="decimal" value={d.amount} onChange={(e) => set("amount", e.target.value.replace(/[^\d.]/g, ""))} className="num w-32 border-0 bg-transparent py-3.5 pr-4 font-display text-2xl font-extrabold focus:ring-0" aria-label="Amount" />
                  </div>
                  <div className="flex gap-1 rounded-2xl bg-slate-100 p-1">
                    {(Object.keys(FREQUENCY_LABELS) as Frequency[]).map((f) => (
                      <button key={f} type="button" onClick={() => set("frequency", f)} className={clsx("rounded-xl px-3 py-2.5 text-sm font-bold transition", d.frequency === f ? "bg-white shadow" : "text-slate-500 hover:text-slate-900")}>
                        {FREQUENCY_LABELS[f].replace("Every ", "")}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <label className="block">
                <span className="text-sm font-semibold">First payout date</span>
                <input type="date" value={d.startDate} min={todayIso()} onChange={(e) => set("startDate", e.target.value)} className="mt-2 block rounded-2xl border-0 bg-slate-50 px-4 py-3 font-semibold ring-1 ring-slate-200 focus:ring-2 focus:ring-coral-500" />
              </label>
              <NextButton disabled={!step1Ok} onClick={() => setStep(2)}>
                Add your friends
              </NextButton>
            </div>
          )}

          {step === 2 && <FriendsStep d={d} setD={setD} onNext={() => setStep(3)} />}

          {step === 3 && <OrderStep d={d} setD={setD} colorIndex={colorIndex} onSave={() => setSaving(true)} canSave={!!circle} />}
        </section>

        {/* Live summary */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="overflow-hidden rounded-[2rem] bg-ink-950 text-white shadow-2xl">
            <div className="relative bg-gradient-to-br from-coral-500 via-grape-600 to-brand-600 p-6">
              <div className="bg-grid pointer-events-none absolute inset-0 opacity-50" aria-hidden />
              <p className="relative text-sm font-semibold text-white/80">{d.name || "Your circle"}</p>
              <p className="relative mt-3 text-xs tracking-[0.2em] text-white/70 uppercase">Each payout</p>
              <p className="relative font-display text-5xl font-extrabold tracking-tight">{fmt(pot, d.currency)}</p>
              <p className="relative mt-2 text-sm text-white/80">
                {d.members.length || "?"} friends × {fmt(amountMinor, d.currency)} · {FREQUENCY_LABELS[d.frequency].toLowerCase()}
              </p>
            </div>
            <div className="p-6">
              {schedule.length ? (
                <ol className="relative space-y-3 before:absolute before:top-2 before:bottom-2 before:left-[1.1rem] before:w-px before:bg-white/15">
                  {schedule.slice(0, 8).map((r) => {
                    const m = d.members.find((x) => x.id === r.recipientId)!;
                    const c = colorFor(colorIndex.get(m.id) ?? 0);
                    return (
                      <li key={r.index} className="relative flex animate-pop items-center gap-3" style={{ animationDelay: `${r.index * 60}ms` }}>
                        <span className={clsx("relative flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold ring-4 ring-ink-950", c.grad)}>{r.index + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{m.name}</span>
                          <span className="block text-xs text-white/50">{formatDate(r.date)}</span>
                        </span>
                        <span className="num text-sm font-semibold text-sun-300">{fmt(r.potMinor, d.currency)}</span>
                      </li>
                    );
                  })}
                  {schedule.length > 8 && <li className="pl-12 text-xs text-white/50">+ {schedule.length - 8} more rounds, ending {formatDate(schedule.at(-1)!.date)}</li>}
                </ol>
              ) : (
                <div className="py-6 text-center text-sm text-white/50">
                  <CalendarDays className="mx-auto mb-3 size-8 text-white/30" />
                  {d.members.length < 2 ? "Add at least two friends to see the payout calendar." : "Spin the wheel to fill in the payout order."}
                </div>
              )}
              {schedule.length > 0 && (
                <div className="mt-6 grid grid-cols-2 gap-3 text-center text-xs">
                  <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
                    <p className="text-white/50">Each friend pays in</p>
                    <p className="num mt-1 font-display text-lg font-bold">{fmt(amountMinor * (d.members.length - 1), d.currency)}</p>
                  </div>
                  <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
                    <p className="text-white/50">Circle ends</p>
                    <p className="mt-1 font-display text-lg font-bold">{formatDate(schedule.at(-1)!.date)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-500">
            <Lock className="size-3.5" /> Your plan stays on this device until you choose to share it.
          </p>
          <p className="mt-2 text-center text-xs text-slate-500">
            Already organising a circle?{" "}
            <button type="button" onClick={() => setRecovering(true)} className="font-semibold text-coral-600 hover:underline">
              Email me my organiser link
            </button>
          </p>
        </aside>
      </main>

      <HowItWorksStrip />
      {recovering && <RecoverLinkModal onClose={() => setRecovering(false)} />}
      {saving && circle && <SaveModal circle={circle} onClose={() => setSaving(false)} onSaved={() => localStorage.removeItem(DRAFT_KEY)} />}
      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------- steps

function Stepper({ step, onStep }: { step: number; onStep: (s: number) => void }) {
  const steps = [
    { n: 1, label: "The basics", icon: <Coins /> },
    { n: 2, label: "Friends", icon: <Users /> },
    { n: 3, label: "Payout order", icon: <Shuffle /> },
  ];
  return (
    <ol className="flex items-center gap-2">
      {steps.map((s, i) => (
        <li key={s.n} className="flex flex-1 items-center gap-2">
          <button type="button" onClick={() => onStep(s.n)} className={clsx("flex items-center gap-2 rounded-full py-1.5 pr-3 pl-1.5 text-sm font-bold transition [&_svg]:size-4", step === s.n ? "bg-ink-950 text-white" : step > s.n ? "text-brand-700" : "text-slate-400")}>
            <span className={clsx("flex size-7 items-center justify-center rounded-full", step === s.n ? "bg-gradient-to-br from-coral-500 to-sun-400 text-ink-950" : step > s.n ? "bg-brand-100" : "bg-slate-100")}>{step > s.n ? <Check /> : s.icon}</span>
            <span className="hidden sm:inline">{s.label}</span>
          </button>
          {i < steps.length - 1 && <span className={clsx("h-0.5 flex-1 rounded-full", step > s.n ? "bg-brand-400" : "bg-slate-100")} />}
        </li>
      ))}
    </ol>
  );
}

function NextButton({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="group inline-flex items-center gap-2 rounded-2xl bg-ink-950 px-6 py-3.5 font-bold text-white transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100">
      {children} <ArrowRight className="size-4 transition group-hover:translate-x-1" />
    </button>
  );
}

function FriendsStep({ d, setD, onNext }: { d: Draft; setD: React.Dispatch<React.SetStateAction<Draft>>; onNext: () => void }) {
  const [name, setName] = useState("");
  const add = (raw: string) => {
    // Accept one name or a pasted list (new lines or commas).
    const names = raw
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 50 - d.members.length);
    if (!names.length) return;
    const added = names.map((n) => ({ id: newId(), name: n.slice(0, 60) }));
    setD((s) => ({ ...s, members: [...s.members, ...added], order: [] }));
    setName("");
  };
  const remove = (id: string) => setD((s) => ({ ...s, members: s.members.filter((m) => m.id !== id), order: [] }));

  return (
    <div className="mt-8 animate-pop">
      <p className="text-sm font-semibold">Who's in the circle?</p>
      <p className="text-sm text-slate-500">Type a name and press Enter, or paste a whole list from WhatsApp.</p>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add(name);
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} onPaste={(e) => {
          const t = e.clipboardData.getData("text");
          if (/[\n,]/.test(t)) {
            e.preventDefault();
            add(t);
          }
        }} placeholder="Friend's name" className="min-w-0 flex-1 rounded-2xl border-0 bg-slate-50 px-4 py-3 font-semibold ring-1 ring-slate-200 focus:ring-2 focus:ring-coral-500" aria-label="Friend's name" />
        <button type="submit" disabled={!name.trim() || d.members.length >= 50} className="inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-coral-500 to-sun-400 px-5 font-bold text-ink-950 disabled:opacity-40">
          <UserPlus className="size-4" /> Add
        </button>
      </form>
      <ul className="mt-5 flex flex-wrap gap-2">
        {d.members.map((m, i) => (
          <li key={m.id} className="group flex animate-pop items-center gap-2 rounded-full bg-slate-50 py-1 pr-2 pl-1 ring-1 ring-slate-200">
            <span className={clsx("flex size-7 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white", colorFor(i).grad)}>{m.name[0]?.toUpperCase()}</span>
            <span className="text-sm font-semibold">{m.name}</span>
            <button type="button" onClick={() => remove(m.id)} className="rounded-full p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${m.name}`}>
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
        {!d.members.length && <li className="text-sm text-slate-400">No one yet — start with yourself!</li>}
      </ul>
      <div className="mt-8 flex items-center gap-4">
        <NextButton disabled={d.members.length < 2} onClick={onNext}>
          Decide the order
        </NextButton>
        <span className="text-sm text-slate-500">{d.members.length} of 50</span>
      </div>
    </div>
  );
}

function OrderStep({ d, setD, colorIndex, onSave, canSave }: { d: Draft; setD: React.Dispatch<React.SetStateAction<Draft>>; colorIndex: Map<string, number>; onSave: () => void; canSave: boolean }) {
  const [last, setLast] = useState<string | null>(null);
  const remaining = d.members.filter((m) => !d.order.includes(m.id));
  const byId = new Map(d.members.map((m) => [m.id, m]));
  const pick = (id: string) => {
    setLast(id);
    setD((s) => (s.order.includes(id) ? s : { ...s, order: [...s.order, id] }));
  };
  const move = (i: number, dir: -1 | 1) =>
    setD((s) => {
      const o = [...s.order];
      const j = i + dir;
      if (j < 0 || j >= o.length) return s;
      [o[i], o[j]] = [o[j], o[i]];
      return { ...s, order: o };
    });

  return (
    <div className="mt-8 animate-pop">
      <div className="grid items-start gap-8 md:grid-cols-2">
        <div>
          {remaining.length > 0 ? (
            <>
              <Wheel slices={remaining.map((m) => ({ id: m.id, name: m.name, color: colorFor(colorIndex.get(m.id) ?? 0).bg }))} onPick={pick} />
              <p className="mt-4 text-center text-sm text-slate-500">
                Spin to draw who gets paid {d.order.length ? "next" : "first"}. {remaining.length} left.
              </p>
            </>
          ) : (
            <div className="flex aspect-square flex-col items-center justify-center rounded-full bg-gradient-to-br from-brand-50 to-grape-50 text-center">
              <Sparkles className="size-10 text-grape-500" />
              <p className="mt-3 font-display text-2xl font-extrabold">Order set!</p>
              <p className="text-sm text-slate-500">Nudge it with the arrows if needed.</p>
            </div>
          )}
          {last && remaining.length > 0 && (
            <p key={last} className="mt-3 animate-pop text-center font-display text-lg font-bold">
              🎉 {byId.get(last)?.name} is #{d.order.indexOf(last) + 1}
            </p>
          )}
        </div>
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            {remaining.length > 1 && (
              <button type="button" onClick={() => setD((s) => ({ ...s, order: [...s.order, ...shuffle(s.members.filter((m) => !s.order.includes(m.id)).map((m) => m.id), () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32)] }))} className="inline-flex items-center gap-1.5 rounded-full bg-grape-500/10 px-3 py-1.5 text-xs font-bold text-grape-700 hover:bg-grape-500/20">
                <Shuffle className="size-3.5" /> Draw everyone at once
              </button>
            )}
            {d.order.length > 0 && (
              <button type="button" onClick={() => (setD((s) => ({ ...s, order: [] })), setLast(null))} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">
                <RotateCcw className="size-3.5" /> Start over
              </button>
            )}
          </div>
          <ol className="space-y-2">
            {d.order.map((id, i) => {
              const m = byId.get(id)!;
              return (
                <li key={id} className="flex animate-pop items-center gap-3 rounded-2xl bg-slate-50 p-2 pr-3 ring-1 ring-slate-200">
                  <span className={clsx("flex size-9 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-extrabold text-white", colorFor(colorIndex.get(id) ?? 0).grad)}>{i + 1}</span>
                  <span className="flex-1 truncate font-semibold">{m.name}</span>
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-800 disabled:opacity-30" aria-label="Move up">
                    <ArrowUp className="size-4" />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === d.order.length - 1} className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-800 disabled:opacity-30" aria-label="Move down">
                    <ArrowDown className="size-4" />
                  </button>
                </li>
              );
            })}
            {!d.order.length && <li className="rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">The payout order appears here as you spin.</li>}
          </ol>
        </div>
      </div>
      <div className="mt-8 flex flex-col gap-3 rounded-3xl bg-gradient-to-r from-coral-500/10 via-grape-500/10 to-brand-500/10 p-5 ring-1 ring-slate-200 sm:flex-row sm:items-center">
        <p className="flex-1 text-sm text-slate-700">
          <span className="font-bold">Ready?</span> Save your circle to get a link for the group chat and your own tracker for who has paid.
        </p>
        <button type="button" onClick={onSave} disabled={!canSave} className="group relative inline-flex shrink-0 items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-coral-500 via-coral-400 to-sun-400 px-6 py-3.5 font-bold text-ink-950 shadow-lg shadow-coral-500/30 transition hover:scale-[1.03] disabled:opacity-40 disabled:hover:scale-100">
          <span className="absolute inset-y-0 left-0 w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-white/50 to-transparent" />
          <Share2 className="relative size-4" /> <span className="relative">Save & share free</span>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- save (lead capture)

function SaveModal({ circle, onClose, onSaved }: { circle: Circle; onClose: () => void; onSaved: () => void }) {
  const navigate = useNavigate();
  const [f, setF] = useState({ name: "", email: "", phone: "", consent: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await circleApi<CircleView & { editToken: string; emailSent: boolean }>("POST", "/circles", {
        circle,
        organizer: { name: f.name, email: f.email, phone: f.phone || undefined, marketingConsent: f.consent },
      });
      saveToken(res.slug, res.editToken);
      onSaved();
      navigate(`/c/${res.slug}?welcome=1`, { state: { emailedTo: res.emailSent ? f.email : null } });
    } catch (e) {
      setErr(errorMessage(e));
      setBusy(false);
    }
  };
  const ok = f.name.trim().length >= 2 && /\S+@\S+\.\S+/.test(f.email);
  return (
    <Modal open onClose={onClose} title="Save your circle">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) submit();
        }}
      >
        <p className="text-sm text-slate-600 dark:text-slate-400">We'll email you a private organiser link for ticking off payments from any phone, plus a link to share with your friends.</p>
        <label className="block">
          <span className="text-sm font-semibold">Your name</span>
          <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" className="mt-1.5 w-full rounded-xl border-0 bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200 focus:ring-2 focus:ring-coral-500 dark:bg-slate-800 dark:ring-slate-700" />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Email</span>
          <input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" className="mt-1.5 w-full rounded-xl border-0 bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200 focus:ring-2 focus:ring-coral-500 dark:bg-slate-800 dark:ring-slate-700" />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">WhatsApp number <span className="font-normal text-slate-400">(optional)</span></span>
          <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/[^+\d\s()-]/g, "") })} inputMode="tel" autoComplete="tel" className="mt-1.5 w-full rounded-xl border-0 bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200 focus:ring-2 focus:ring-coral-500 dark:bg-slate-800 dark:ring-slate-700" />
        </label>
        <label className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-400">
          <input type="checkbox" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} className="mt-0.5 size-4 rounded accent-coral-500" />
          Send me occasional tips for running savings groups and news about Fundly. Unsubscribe anytime.
        </label>
        {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}
        <button type="submit" disabled={!ok || busy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink-950 py-3.5 font-bold text-white transition hover:bg-ink-900 disabled:opacity-40 dark:bg-white dark:text-ink-950">
          {busy ? "Saving…" : "Create my circle"} <ArrowRight className="size-4" />
        </button>
        <p className="text-center text-xs text-slate-400">Free forever. We never share your details or your friends' names.</p>
      </form>
    </Modal>
  );
}

function HowItWorksStrip() {
  const items = [
    ["1", "Everyone chips in", "Each round every friend pays the same amount."],
    ["2", "One friend takes the pot", "The whole pot goes to whoever's turn it is."],
    ["3", "Repeat until everyone's had a turn", "Everyone pays in and takes out exactly the same."],
  ];
  return (
    <section className="border-t border-slate-200 bg-white py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-8">
        <Reveal className="text-center">
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">How a merry-go-round works</h2>
          <p className="mt-2 text-slate-600">
            New to this? Read our <a href="/learn/what-is-a-merry-go-round" className="font-semibold text-coral-600 hover:underline">complete guide to merry-go-rounds</a> and the <a href="/learn/merry-go-round-rules-template" className="font-semibold text-coral-600 hover:underline">free rules template</a>.
          </p>
        </Reveal>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {items.map(([n, t, b], i) => (
            <Reveal key={n} delay={i * 120} className="rounded-3xl bg-[#fbfaf7] p-6 ring-1 ring-slate-200">
              <span className={clsx("flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br font-display font-extrabold text-white", colorFor(i + 1).grad)}>{n}</span>
              <p className="mt-4 font-display text-xl font-bold">{t}</p>
              <p className="mt-1 text-slate-600">{b}</p>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-10 flex flex-col items-center gap-3 rounded-3xl bg-ink-950 p-8 text-center text-white sm:flex-row sm:text-left">
          <p className="flex-1 text-lg">
            <span className="font-bold">Outgrowing the group chat?</span> <span className="text-white/70">Fundly runs full savings funds with loans, welfare cover and mobile money collection.</span>
          </p>
          <Link to="/" className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-white px-5 py-3 font-bold text-ink-950 hover:scale-[1.02]">
            See Fundly <ArrowRight className="size-4" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
