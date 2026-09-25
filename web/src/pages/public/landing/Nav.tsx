import { ArrowRight, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { clsx } from "../../../components/ui";

const LINKS = [
  { href: "#simulator", label: "Simulator" },
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export function Logo({ light = true }: { light?: boolean }) {
  return (
    <Link to="/" className={clsx("flex items-center gap-2 font-display text-xl font-extrabold tracking-tight", light ? "text-white" : "text-slate-900 dark:text-white")}>
      <span className="relative flex size-9 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-brand-400 via-grape-500 to-coral-500 text-white shadow-lg shadow-grape-500/30">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M7 20V5h10M7 12h8" />
        </svg>
      </span>
      Fundly
    </Link>
  );
}

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  // Section anchors only exist on the home page; elsewhere link back to them.
  const onHome = useLocation().pathname === "/";
  const href = (h: string) => (onHome ? h : `/${h}`);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header className={clsx("fixed inset-x-0 top-0 z-50 transition-all duration-300", scrolled ? "bg-ink-950/70 py-3 shadow-lg shadow-black/20 backdrop-blur-xl" : "py-5")}>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-8">
        <Logo />
        <nav className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={href(l.href)} className="rounded-full px-4 py-2 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white">
              {l.label}
            </a>
          ))}
          <a href="/learn" className="rounded-full px-4 py-2 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white">
            Learn
          </a>
          <Link to="/tools/merry-go-round" className="ml-1 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/10">
            Merry-go-round <span className="rounded-full bg-gradient-to-r from-coral-500 to-sun-400 px-1.5 py-px text-[10px] font-bold text-ink-950">FREE</span>
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/login" className="hidden rounded-full px-4 py-2 text-sm font-semibold text-white/80 hover:text-white sm:block">
            Sign in
          </Link>
          <Link to="/signup" className="group relative inline-flex items-center gap-1.5 overflow-hidden rounded-full bg-white px-5 py-2.5 text-sm font-bold text-ink-950 shadow-lg shadow-white/10 transition hover:scale-[1.03]">
            <span className="absolute inset-y-0 left-0 w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-brand-200/60 to-transparent" />
            <span className="relative">Start free</span>
            <ArrowRight className="relative size-4 transition group-hover:translate-x-0.5" />
          </Link>
          <button className="rounded-full p-2 text-white lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="mx-4 mt-3 grid gap-1 rounded-2xl bg-ink-900/95 p-3 ring-1 ring-white/10 backdrop-blur-xl lg:hidden">
          {LINKS.map((l) => (
            <a key={l.href} href={href(l.href)} onClick={() => setOpen(false)} className="rounded-xl px-4 py-3 text-sm font-medium text-white/80 hover:bg-white/10">
              {l.label}
            </a>
          ))}
          <a href="/learn" className="rounded-xl px-4 py-3 text-sm font-medium text-white/80 hover:bg-white/10">
            Learn — guides &amp; templates
          </a>
          <Link to="/tools/merry-go-round" className="rounded-xl px-4 py-3 text-sm font-semibold text-sun-300 hover:bg-white/10">
            Free merry-go-round planner
          </Link>
          <Link to="/login" className="rounded-xl px-4 py-3 text-sm font-medium text-white/80 hover:bg-white/10">
            Sign in
          </Link>
        </nav>
      )}
    </header>
  );
}
