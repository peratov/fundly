import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, StrictMode, Suspense, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider, useParams } from "react-router";
import { AppShell } from "./components/AppShell";
import { Loading, ToastProvider } from "./components/ui";
import { ApiError } from "./lib/api";
import { useFund, useMe } from "./lib/session";
import "./styles.css";

try {
  const framedDemo = window.self !== window.top && location.pathname.startsWith("/f/demo");
  // Homepage previews: light theme, and no scrollbar inside the device frame.
  if (framedDemo) document.documentElement.classList.add("embed");
  const saved = framedDemo ? "light" : localStorage.getItem("fundly-theme");
  if (saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches)) document.documentElement.classList.add("dark");
} catch {
  /* ignore */
}

// Route-level code splitting keeps the first load small as the app grows.
const Landing = lazy(() => import("./pages/public/Landing"));
const Login = lazy(() => import("./pages/public/Login"));
const Signup = lazy(() => import("./pages/public/Signup"));
const AcceptInvite = lazy(() => import("./pages/public/AcceptInvite"));
const Admin = lazy(() => import("./pages/Admin"));
const MerryGoRound = lazy(() => import("./pages/tools/MerryGoRound"));
const CircleView = lazy(() => import("./pages/tools/CircleView"));
const Overview = lazy(() => import("./pages/fund/Overview"));
const Members = lazy(() => import("./pages/fund/Members"));
const MemberDetail = lazy(() => import("./pages/fund/MemberDetail"));
const Contributions = lazy(() => import("./pages/fund/Contributions"));
const Loans = lazy(() => import("./pages/fund/Loans"));
const LoanDetail = lazy(() => import("./pages/fund/LoanDetail"));
const Claims = lazy(() => import("./pages/fund/Claims"));
const Shares = lazy(() => import("./pages/fund/Shares"));
const Payments = lazy(() => import("./pages/fund/Payments"));
const Reports = lazy(() => import("./pages/fund/Reports"));
const Audit = lazy(() => import("./pages/fund/Audit"));
const ImportData = lazy(() => import("./pages/fund/ImportData"));
const FundSettings = lazy(() => import("./pages/fund/Settings"));
const Portal = lazy(() => import("./pages/portal/Portal"));
const PortalLoans = lazy(() => import("./pages/portal/PortalLoans"));
const PortalWelfare = lazy(() => import("./pages/portal/PortalWelfare"));
const PortalHistory = lazy(() => import("./pages/portal/PortalHistory"));
const PortalProfile = lazy(() => import("./pages/portal/PortalProfile"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

function S({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Loading />}>{children}</Suspense>;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <Loading />;
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  return <>{children}</>;
}

function Home() {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <Loading />;
  if (!me) return <S><Landing /></S>;
  return <Navigate to="/app" replace />;
}

function ChooseFund() {
  const { data: me } = useMe();
  if (!me) return <Loading />;
  if (!me.funds.length) return me.user.isPlatformAdmin ? <Navigate to="/admin" replace /> : <Navigate to="/signup?new=1" replace />;
  let last: string | null = null;
  try {
    last = localStorage.getItem("fundly-last-fund");
  } catch {
    /* ignore */
  }
  const fund = me.funds.find((f) => f.tenantId === last) ?? me.funds[0];
  return <Navigate to={`/f/${fund.tenantId}`} replace />;
}

function FundHome() {
  const { isStaff, tenantId } = useFund();
  const params = useParams();
  try {
    if (!params.tenantId!.startsWith("demo")) localStorage.setItem("fundly-last-fund", params.tenantId!);
  } catch {
    /* ignore */
  }
  return <Navigate to={`/f/${tenantId}/${isStaff ? "overview" : "portal"}`} replace />;
}

const router = createBrowserRouter([
  { path: "/", element: <Home /> },
  { path: "/login", element: <S><Login /></S> },
  { path: "/signup", element: <S><Signup /></S> },
  { path: "/invite/:token", element: <S><AcceptInvite /></S> },
  // Free public growth tool — no account needed.
  { path: "/tools/merry-go-round", element: <S><MerryGoRound /></S> },
  { path: "/c/:slug", element: <S><CircleView /></S> },
  { path: "/app", element: <RequireAuth><ChooseFund /></RequireAuth> },
  { path: "/admin", element: <RequireAuth><S><Admin /></S></RequireAuth> },
  {
    path: "/f/:tenantId",
    element: <RequireAuth><AppShell /></RequireAuth>,
    children: [
      { index: true, element: <FundHome /> },
      { path: "overview", element: <S><Overview /></S> },
      { path: "members", element: <S><Members /></S> },
      { path: "members/:memberId", element: <S><MemberDetail /></S> },
      { path: "contributions", element: <S><Contributions /></S> },
      { path: "loans", element: <S><Loans /></S> },
      { path: "loans/:loanId", element: <S><LoanDetail /></S> },
      { path: "claims", element: <S><Claims /></S> },
      { path: "shares", element: <S><Shares /></S> },
      { path: "payments", element: <S><Payments /></S> },
      { path: "reports", element: <S><Reports /></S> },
      { path: "audit", element: <S><Audit /></S> },
      { path: "import", element: <S><ImportData /></S> },
      { path: "settings", element: <S><FundSettings /></S> },
      { path: "portal", element: <S><Portal /></S> },
      { path: "portal/loans", element: <S><PortalLoans /></S> },
      { path: "portal/welfare", element: <S><PortalWelfare /></S> },
      { path: "portal/history", element: <S><PortalHistory /></S> },
      { path: "portal/profile", element: <S><PortalProfile /></S> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
