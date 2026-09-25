import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Shield, ShieldOff } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { useMe } from "../lib/session";
import { PLANS, TENANT_STATUSES } from "../../../shared/enums";
import { Badge, Card, Input, Loading, PageHeader, Pagination, SearchInput, Select, Stat, StatusBadge, Table, Tabs, Td, Th, Tr, useDebounced, useToast } from "../components/ui";
import { api, qs, type Paged } from "../lib/api";
import { formatDate, money, timeAgo } from "../lib/format";

interface TenantRow {
  id: string;
  name: string;
  currency: string;
  status: string;
  plan: string;
  trialEndsAt: string | null;
  createdAt: string;
  members: number;
  cashMinor: number;
  owner: string | null;
  lastActivity: string | null;
}

export default function Admin() {
  const { data: me } = useMe();
  if (me && !me.user.isPlatformAdmin) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-100 px-4 dark:bg-slate-950">
        <Card className="max-w-sm text-center">
          <ShieldOff className="mx-auto size-8 text-slate-400" />
          <h1 className="mt-3 text-lg font-semibold">Operators only</h1>
          <p className="mt-1 text-sm text-slate-500">This console is for Fundly platform administrators. Your account doesn't have access.</p>
          <Link to="/app" className="mt-4 inline-flex text-sm font-semibold text-brand-700 hover:underline">
            Go to my funds
          </Link>
        </Card>
      </div>
    );
  }
  return <Console />;
}

const CLOSING = new Set(["suspended", "cancelled"]);

function Console() {
  const [tab, setTab] = useState<"tenants" | "leads">("tenants");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", dq, page],
    queryFn: () => api.get<Paged<TenantRow> & { stats: { funds: number; active: number; trial: number; suspended: number; users: number } }>(`/admin/tenants${qs({ q: dq, page })}`),
  });
  const setStatus = (t: TenantRow, status: string) => {
    // Suspending or cancelling blocks every write for that fund's staff, so make it deliberate.
    if (CLOSING.has(status) && !window.confirm(`${status === "suspended" ? "Suspend" : "Cancel"} ${t.name}? Its staff will only be able to view data until it's reactivated.`)) return;
    update.mutate({ id: t.id, status });
  };
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; status?: string; plan?: string; trialEndsAt?: string }) => api.patch(`/admin/tenants/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast("Subscription updated");
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  return (
    <div className="min-h-dvh bg-slate-100 dark:bg-slate-950">
      <header className="border-b border-white/10 bg-ink-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4 sm:px-8">
          <span className="flex size-8 items-center justify-center rounded-md bg-white/10 ring-1 ring-white/15">
            <Shield className="size-4 text-brand-300" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold tracking-wide">Fundly Operations</p>
            <p className="text-xs text-white/50">Restricted · platform administrators only</p>
          </div>
          <Link to="/app" className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-white/70 ring-1 ring-white/15 hover:bg-white/5 hover:text-white">
            <ArrowLeft className="size-3.5" /> Back to my funds
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
      <div className="mb-6">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: "tenants", label: "Tenants" }, { value: "leads", label: "Leads" }]} />
      </div>
      {tab === "leads" ? (
        <Leads />
      ) : (
      <>
      <PageHeader title="Tenants" subtitle="Every fund on the platform, its subscription status and last activity." />
      {isLoading || !data ? (
        <Loading />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Funds" value={data.stats.funds} />
            <Stat label="Paying" value={data.stats.active} tone="good" />
            <Stat label="On trial" value={data.stats.trial} />
            <Stat label="Suspended / cancelled" value={data.stats.suspended} tone={data.stats.suspended ? "bad" : undefined} />
            <Stat label="Users" value={data.stats.users} />
          </div>
          <Card padded={false}>
            <div className="border-b border-slate-100 p-4 dark:border-slate-800">
              <SearchInput value={q} onChange={(v) => (setQ(v), setPage(1))} placeholder="Search funds" />
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>Fund</Th>
                  <Th right>Members</Th>
                  <Th right>Cash</Th>
                  <Th>Status</Th>
                  <Th>Plan</Th>
                  <Th>Trial ends</Th>
                  <Th>Last activity</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((t) => (
                  <Tr key={t.id}>
                    <Td>
                      <p className="font-medium">{t.name}</p>
                      <p className="text-xs text-slate-500">
                        {t.owner ?? "—"} · created {formatDate(t.createdAt)}
                      </p>
                    </Td>
                    <Td right>{t.members}</Td>
                    <Td right>{money(t.cashMinor, t.currency)}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={t.status} />
                        <Select className="h-10 w-36 sm:h-8 sm:w-32 sm:text-xs" value={t.status} disabled={update.isPending} onChange={(e) => setStatus(t, e.target.value)} aria-label={`Status of ${t.name}`}>
                          {TENANT_STATUSES.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </Select>
                      </div>
                    </Td>
                    <Td>
                      <Select className="h-10 w-36 sm:h-8 sm:w-32 sm:text-xs" value={t.plan} disabled={update.isPending} onChange={(e) => update.mutate({ id: t.id, plan: e.target.value })} aria-label={`Plan of ${t.name}`}>
                        {PLANS.map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </Select>
                    </Td>
                    <Td>
                      <Input
                        key={t.trialEndsAt ?? "none"}
                        type="date"
                        className="h-10 w-40 sm:h-8 sm:text-xs"
                        defaultValue={t.trialEndsAt ?? ""}
                        onBlur={(e) => e.target.value && e.target.value !== t.trialEndsAt && update.mutate({ id: t.id, trialEndsAt: e.target.value })}
                        aria-label={`Trial end for ${t.name}`}
                      />
                    </Td>
                    <Td className="text-xs">{t.lastActivity ? timeAgo(t.lastActivity) : "—"}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
          </Card>
        </>
      )}
      </>
      )}
      </div>
    </div>
  );
}

interface LeadRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  source: string;
  marketingConsent: boolean;
  convertedUserId: string | null;
  meta: { circleName?: string; members?: number; currency?: string; amountMinor?: number; frequency?: string } | null;
  createdAt: string;
  circles: number;
  views: number;
}

function Leads() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-leads", dq, page],
    queryFn: () => api.get<Paged<LeadRow> & { stats: { leads: number; consented: number; converted: number; last7: number; circles: number } }>(`/admin/leads${qs({ q: dq, page })}`),
  });
  if (isLoading || !data) return <Loading />;
  const s = data.stats;
  const rate = s.leads ? Math.round((s.converted / s.leads) * 100) : 0;
  return (
    <>
      <PageHeader
        title="Leads"
        subtitle="People who used the free merry-go-round planner. Only contact those who opted in to marketing."
        actions={
          <a
            href="/api/admin/leads.csv"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700"
          >
            <Download className="size-4" /> Export CSV
          </a>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Leads" value={s.leads} hint={`${s.last7} in the last 7 days`} />
        <Stat label="Circles created" value={s.circles} />
        <Stat label="Opted in to marketing" value={s.consented} />
        <Stat label="Converted to customers" value={s.converted} tone={s.converted ? "good" : undefined} />
        <Stat label="Conversion rate" value={`${rate}%`} />
      </div>
      <Card padded={false}>
        <div className="border-b border-slate-100 p-4 dark:border-slate-800">
          <SearchInput value={q} onChange={(v) => (setQ(v), setPage(1))} placeholder="Search name or email" />
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Lead</Th>
              <Th>Circle</Th>
              <Th right>Circles</Th>
              <Th right>Link views</Th>
              <Th>Marketing</Th>
              <Th>Status</Th>
              <Th>Captured</Th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((l) => (
              <Tr key={l.id}>
                <Td>
                  <p className="font-medium">{l.name}</p>
                  <p className="text-xs text-slate-500">
                    {l.email}
                    {l.phone ? ` · ${l.phone}` : ""}
                  </p>
                </Td>
                <Td>
                  <p>{l.meta?.circleName ?? "—"}</p>
                  {l.meta?.members && l.meta.amountMinor ? (
                    <p className="text-xs text-slate-500">
                      {l.meta.members} friends · {money(l.meta.amountMinor, l.meta.currency ?? "GHS")} {l.meta.frequency}
                    </p>
                  ) : null}
                </Td>
                <Td right>{l.circles}</Td>
                <Td right>{l.views}</Td>
                <Td>{l.marketingConsent ? <Badge tone="green">Opted in</Badge> : <Badge>No</Badge>}</Td>
                <Td>{l.convertedUserId ? <Badge tone="violet">Customer</Badge> : <Badge tone="blue">Lead</Badge>}</Td>
                <Td className="text-xs">{timeAgo(l.createdAt)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
      </Card>
    </>
  );
}
