import { MailCheck } from "lucide-react";
import { useState } from "react";
import { Modal } from "../../components/ui";
import { circleApi, errorMessage } from "./circle-shared";

/** "Email me my organiser link" — works for one circle (slug) or all circles for that email. */
export function RecoverLinkModal({ slug, onClose }: { slug?: string; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setState("busy");
    setErr(null);
    try {
      await circleApi("POST", "/circles/recover", { email, slug });
      setState("sent");
    } catch (e) {
      setErr(errorMessage(e));
      setState("idle");
    }
  };
  return (
    <Modal open onClose={onClose} title="Get your organiser link">
      {state === "sent" ? (
        <div className="py-4 text-center">
          <span className="mx-auto flex size-14 animate-pop items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-emerald-600 text-white">
            <MailCheck className="size-7" />
          </span>
          <p className="mt-4 font-display text-xl font-extrabold">Check your inbox</p>
          <p className="mt-1 text-sm text-slate-500">If that email organises {slug ? "this circle" : "any circles"}, we've just sent a fresh organiser link. It can take a minute — peek in spam too.</p>
          <button onClick={onClose} className="mt-6 rounded-xl bg-ink-950 px-5 py-2.5 text-sm font-bold text-white dark:bg-white dark:text-ink-950">
            Done
          </button>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <p className="text-sm text-slate-600 dark:text-slate-400">Enter the email you used when you saved {slug ? "this circle" : "your circle"}. We'll send a new private link — any links you already have keep working.</p>
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="Email"
            autoComplete="email"
            className="w-full rounded-xl border-0 bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200 focus:ring-2 focus:ring-coral-500 dark:bg-slate-800 dark:ring-slate-700"
          />
          {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}
          <button type="submit" disabled={state === "busy" || !/\S+@\S+\.\S+/.test(email)} className="w-full rounded-2xl bg-ink-950 py-3 font-bold text-white disabled:opacity-40 dark:bg-white dark:text-ink-950">
            {state === "busy" ? "Sending…" : "Email me my link"}
          </button>
        </form>
      )}
    </Modal>
  );
}
