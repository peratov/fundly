import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Building2,
  ChevronDown,
  Coins,
  FileBarChart,
  HandCoins,
  HeartPulse,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Moon,
  PieChart,
  ScrollText,
  Settings,
  Shield,
  Smartphone,
  Sun,
  Upload,
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { ROLE_LABELS } from "../../../shared/enums";
import type { Permission } from "../../../shared/permissions";
import { api } from "../lib/api";
import { initials, timeAgo } from "../lib/format";
import { useFund, useSetMe } from "../lib/session";
import { Badge, clsx, Loading } from "./ui";
import { IS_DEMO, IS_EMBED } from "../demo/demo";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  perm?: Permission[];
  end?: boolean;
}

const STAFF_NAV: NavItem[] = [
  { to: "overview", label: "Overview", icon: <LayoutDashboard />, perm: ["members:read"] },
  { to: "members", label: "Members", icon: <Users />, perm: ["members:read"] },
  { to: "contributions", label: "Contributions", icon: <Wallet />, perm: ["contributions:read"] },
  { to: "loans", label: "Loans", icon: <HandCoins />, perm: ["loans:read"] },
  { to: "claims", label: "Welfare claims", icon: <HeartPulse />, perm: ["claims:read", "claims:decide"] },
  { to: "shares", label: "Shares", icon: <PieChart />, perm: ["members:read"] },
  { to: "payments", label: "Payments", icon: <Smartphone />, perm: ["payments:read"] },
  { to: "reports", label: "Reports", icon: <FileBarChart />, perm: ["reports:read"] },
  { to: "audit", label: "Audit log", icon: <ScrollText />, perm: ["audit:read", "members:write"] },
  { to: "import", label: "Import data", icon: <Upload />, perm: ["import:write"] },
  { to: "settings", label: "Fund settings", icon: <Settings />, perm: ["settings:write"] },
];

const MEMBER_NAV: NavItem[] = [
  { to: "portal", label: "My dashboard", icon: <Coins />, end: true },
  { to: "portal/loans", label: "My loans", icon: <HandCoins /> },
  { to: "portal/welfare", label: "Welfare cover", icon: <HeartPulse /> },
  { to: "portal/history", label: "Payment history", icon: <History /> },
  { to: "portal/profile", label: "My profile", icon: <UserRound /> },
];

function useDarkMode() {
  const [dark, setDark] = useState(() => {
    // Homepage previews are always light; the demo never touches the visitor's saved theme.
    if (IS_EMBED) return false;
    try {
      const saved = localStorage.getItem("fundly-theme");
      return saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    if (IS_DEMO) return;
    try {
      localStorage.setItem("fundly-theme", dark ? "dark" : "light");
    } catch {
      /* private mode */
    }
  }, [dark]);
  return [dark, setDark] as const;
}

export function AppShell() {
  const { fund, me, can, tenantId } = useFund();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  if (!me) return <Loading />;
  if (!fund) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="text-sm text-slate-600">You don't have access to this fund.</p>
        <Link to="/app" className="mt-3 inline-block text-sm font-medium text-brand-700">
          Go to my funds
        </Link>
      </div>
    );
  }

  const staff = STAFF_NAV.filter((n) => !n.perm || n.perm.some(can));
  const trialDays = fund.status === "trial" && fund.trialEndsAt ? Math.ceil((new Date(fund.trialEndsAt).getTime() - Date.now()) / 86_400_000) : null;

  const sidebar = (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-4">
      <FundSwitcher />
      {staff.length > 0 && <NavGroup title="Manage" items={staff} base={`/f/${tenantId}`} />}
      <NavGroup title="My account" items={MEMBER_NAV} base={`/f/${tenantId}`} />
      {me.user.isPlatformAdmin && <NavGroup title="Platform" items={[{ to: "/admin", label: "Operator console", icon: <Shield /> }]} base="" />}
      <div className="mt-auto flex items-center gap-2 px-3 pt-4 text-xs text-white/30">
        <span className="size-1.5 rounded-full bg-emerald-400" /> Books balanced · Fundly
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-64 shrink-0 bg-ink-900 text-white lg:block">
        <div className="sticky top-0 h-dvh">{sidebar}</div>
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-ink-900 text-white shadow-xl">
            <button onClick={() => setOpen(false)} className="absolute top-4 right-3 rounded-md p-1 text-slate-400" aria-label="Close menu">
              <X className="size-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setOpen(true)} />
        {IS_DEMO && !IS_EMBED && <DemoBanner />}
        {trialDays !== null && (
          <div className={clsx("px-4 py-2 text-center text-xs font-medium sm:px-8", trialDays > 0 ? "bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300" : "bg-rose-50 text-rose-800")}>
            {trialDays > 0 ? `Free trial: ${trialDays} day${trialDays === 1 ? "" : "s"} left.` : "Your free trial has ended — the fund is read-only until the owner upgrades."}
          </div>
        )}
        {/* Extra bottom padding on phones so content clears the tab bar. */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-5 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-8 sm:pt-8 lg:pb-8">
          <Outlet />
        </main>
      </div>
      <BottomNav staff={staff.length > 0} base={`/f/${tenantId}`} onMenu={() => setOpen(true)} />
    </div>
  );
}

/**
 * Phone-only tab bar: the five things people do most, within thumb reach.
 * Members get a raised "Pay" button; staff get "Record" (a contribution).
 */
function BottomNav({ staff, base, onMenu }: { staff: boolean; base: string; onMenu: () => void }) {
  const tabs = staff
    ? [
        { to: `${base}/overview`, label: "Home", icon: <LayoutDashboard /> },
        { to: `${base}/members`, label: "Members", icon: <Users /> },
        { to: `${base}/contributions`, label: "Record", icon: <Plus />, primary: true },
        { to: `${base}/loans`, label: "Loans", icon: <HandCoins /> },
      ]
    : [
        { to: `${base}/portal`, label: "Home", icon: <Coins />, end: true },
        { to: `${base}/portal/loans`, label: "Loans", icon: <HandCoins /> },
        { to: `${base}/portal?pay=1`, label: "Pay", icon: <Wallet />, primary: true },
        { to: `${base}/portal/welfare`, label: "Welfare", icon: <HeartPulse /> },
      ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden dark:border-slate-800 dark:bg-slate-900/95" aria-label="Main">
      <ul className="mx-auto grid max-w-md grid-cols-5 items-end px-2">
        {tabs.slice(0, 2).map((t) => (
          <Tab key={t.label} {...t} />
        ))}
        <Tab {...tabs[2]} />
        {tabs.slice(3).map((t) => (
          <Tab key={t.label} {...t} />
        ))}
        <li>
          <button onClick={onMenu} className="flex w-full flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold text-slate-500 [&>svg]:size-6">
            <Menu />
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}

function Tab({ to, label, icon, primary, end }: { to: string; label: string; icon: ReactNode; primary?: boolean; end?: boolean }) {
  if (primary) {
    return (
      <li className="flex justify-center">
        <Link to={to} className="-mt-6 flex flex-col items-center gap-1 text-[11px] font-bold text-slate-700 dark:text-slate-200" aria-label={label}>
          <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-coral-500 to-sun-400 text-ink-950 shadow-lg shadow-coral-500/40 ring-4 ring-white active:scale-95 dark:ring-slate-900 [&>svg]:size-6">{icon}</span>
          {label}
        </Link>
      </li>
    );
  }
  return (
    <li>
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) => clsx("flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition-colors [&>svg]:size-6", isActive ? "text-brand-700 dark:text-brand-300" : "text-slate-500")}
      >
        {icon}
        {label}
      </NavLink>
    </li>
  );
}

function NavGroup({ title, items, base }: { title: string; items: NavItem[]; base: string }) {
  return (
    <div>
      <p className="mb-1.5 px-3 text-[10px] font-semibold tracking-[0.14em] text-white/35 uppercase">{title}</p>
      <ul className="space-y-0.5">
        {items.map((n) => (
          <li key={n.to}>
            <NavLink
              to={n.to.startsWith("/") ? n.to : `${base}/${n.to}`}
              end={n.end}
              className={({ isActive }) =>
                clsx(
                  "relative flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-colors [&>svg]:size-4",
                  isActive ? "bg-white/10 text-white before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-brand-400 [&>svg]:text-brand-300" : "text-white/60 hover:bg-white/5 hover:text-white [&>svg]:text-white/40",
                )
              }
            >
              {n.icon}
              {n.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FundSwitcher() {
  const { fund, me } = useFund();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  if (!fund || !me) return null;
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left ring-1 ring-white/10 hover:bg-white/5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-brand-500 to-brand-800 text-sm font-bold text-white">{initials(fund.shortName || fund.name)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{fund.shortName || fund.name}</span>
          <span className="block truncate text-xs text-white/45">{fund.roles.filter((r) => r !== "member").map((r) => ROLE_LABELS[r]).join(", ") || "Member"}</span>
        </span>
        <ChevronDown className="size-4 text-white/40" />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 rounded-xl bg-white p-1 text-slate-900 shadow-lg ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700">
          {me.funds.map((f) => (
            <button
              key={f.tenantId}
              onClick={() => {
                setOpen(false);
                navigate(`/f/${f.tenantId}`);
              }}
              className={clsx("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800", f.tenantId === fund.tenantId && "font-semibold")}
            >
              <Building2 className="size-4 text-slate-400" />
              <span className="truncate">{f.name}</span>
            </button>
          ))}
          <Link to="/signup?new=1" className="mt-1 block rounded-lg border-t border-slate-100 px-3 py-2 text-sm text-brand-700 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800">
            + Start another fund
          </Link>
        </div>
      )}
    </div>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { me } = useFund();
  const setMe = useSetMe();
  const navigate = useNavigate();
  const [dark, setDark] = useDarkMode();
  const logout = useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSuccess: () => {
      setMe(null);
      navigate("/login");
    },
  });
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-8 dark:border-slate-800 dark:bg-slate-900/90">
      <button onClick={onMenu} className="-ml-1 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
        <Menu className="size-5" />
      </button>
      <div className="flex-1" />
      <button onClick={() => setDark(!dark)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Toggle dark mode">
        {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
      <Notifications />
      <div className="ml-1 flex items-center gap-2 border-l border-slate-200 pl-3 dark:border-slate-700">
        <span className="flex size-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">{initials(me?.user.name ?? "?")}</span>
        <span className="hidden text-sm font-medium sm:block">{me?.user.name}</span>
        <button onClick={() => logout.mutate()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Sign out" title="Sign out">
          <LogOut className="size-4" />
        </button>
      </div>
    </header>
  );
}

interface NotificationRow {
  id: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

function Notifications() {
  const { base, tenantId } = useFund();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ["notifications", tenantId],
    queryFn: () => api.get<{ items: NotificationRow[]; unread: number }>(`${base}/notifications`),
    refetchInterval: 60_000,
  });
  const markRead = useMutation({
    mutationFn: (ids?: string[]) => api.post(`${base}/notifications/read`, { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", tenantId] }),
  });
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Notifications">
        <Bell className="size-4" />
        {!!data?.unread && <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white">{data.unread > 9 ? "9+" : data.unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <p className="text-sm font-semibold">Notifications</p>
              {!!data?.unread && (
                <button onClick={() => markRead.mutate(undefined)} className="text-xs font-medium text-brand-700">
                  Mark all read
                </button>
              )}
            </div>
            <ul className="max-h-96 overflow-y-auto">
              {!data?.items.length && <li className="px-4 py-8 text-center text-sm text-slate-500">You're all caught up.</li>}
              {data?.items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      if (!n.readAt) markRead.mutate([n.id]);
                      setOpen(false);
                      if (n.link) navigate(`/f/${tenantId}${n.link}`);
                    }}
                    className="flex w-full gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                  >
                    <span className={clsx("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-brand-600")} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{n.title}</span>
                      <span className="block text-xs text-slate-500">{n.body}</span>
                      <span className="mt-1 block text-[11px] text-slate-400">{timeAgo(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

export function RoleBadges({ roles }: { roles: string[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {roles
        .filter((r) => r !== "member")
        .map((r) => (
          <Badge key={r} tone={r === "owner" ? "violet" : r === "manager" ? "blue" : "gray"}>
            {ROLE_LABELS[r as keyof typeof ROLE_LABELS] ?? r}
          </Badge>
        ))}
    </span>
  );
}

/** Full-page demo: make it obvious this is sample data and offer the real thing. */
function DemoBanner() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-gradient-to-r from-grape-600 via-brand-700 to-brand-600 px-4 py-2 text-center text-xs font-medium text-white sm:text-sm">
      <span>You're exploring a demo fund with sample data. Changes aren't saved.</span>
      <span className="flex gap-3">
        <a href="/signup" className="rounded-full bg-white px-3 py-1 font-semibold text-ink-900 hover:bg-white/90">
          Start your fund free
        </a>
        <a href="/" className="rounded-full px-2 py-1 text-white/80 underline-offset-2 hover:text-white hover:underline">
          Exit demo
        </a>
      </span>
    </div>
  );
}
