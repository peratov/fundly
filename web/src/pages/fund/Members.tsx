import { Download, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { RoleBadges } from "../../components/AppShell";
import { Badge, Button, Card, EmptyState, Loading, PageHeader, Pagination, SearchInput, Select, StatusBadge, Table, Td, Th, Tr, useDebounced } from "../../components/ui";
import { qs, type Paged } from "../../lib/api";
import { formatDate, formatPeriod, formatShares, money } from "../../lib/format";
import { useFundQuery } from "../../lib/hooks";
import { useFund } from "../../lib/session";
import type { MemberRow } from "../../lib/types";
import { InviteLinkModal, MemberFormModal } from "./MemberForm";

export default function Members() {
  const { currency, can, base } = useFund();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const dq = useDebounced(q);
  const standing = params.get("standing") ?? "";
  const status = params.get("status") ?? "active";
  const page = Number(params.get("page") ?? 1);
  const [adding, setAdding] = useState(false);
  const [invite, setInvite] = useState<{ url: string; name: string } | null>(null);

  const { data, isLoading } = useFundQuery<Paged<MemberRow>>(["members", dq, standing, status, page], `/members${qs({ q: dq, standing, status, page, pageSize: 25 })}`);
  const update = (k: string, v: string) => setParams((p) => (v ? p.set(k, v) : p.delete(k), p.delete("page"), p), { replace: true });

  return (
    <>
      <PageHeader
        title="Members"
        subtitle="Everyone registered in the fund, with their standing and savings."
        actions={
          <>
            {can("reports:read") && (
              <a href={`/api${base}/export/members.csv`}>
                <Button variant="secondary" icon={<Download className="size-4" />}>
                  Export
                </Button>
              </a>
            )}
            {can("members:write") && (
              <Button icon={<UserPlus className="size-4" />} onClick={() => setAdding(true)}>
                Add member
              </Button>
            )}
          </>
        }
      />
      <Card padded={false}>
        <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row dark:border-slate-800">
          <SearchInput value={q} onChange={setQ} placeholder="Search name, number, email, phone" />
          <Select value={standing} onChange={(e) => update("standing", e.target.value)} className="sm:w-40" aria-label="Standing">
            <option value="">All standings</option>
            <option value="active">Active</option>
            <option value="behind">Behind</option>
            <option value="voided">Voided</option>
          </Select>
          <Select value={status} onChange={(e) => update("status", e.target.value)} className="sm:w-36" aria-label="Status">
            <option value="active">Current</option>
            <option value="exited">Exited</option>
          </Select>
        </div>
        {isLoading ? (
          <Loading />
        ) : !data?.items.length ? (
          <EmptyState icon={<Users className="size-10" />} title="No members found">
            {q || standing ? "Try a different search or filter." : "Add your first member or import them from a spreadsheet."}
          </EmptyState>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Member</Th>
                  <Th>Standing</Th>
                  <Th right>Savings</Th>
                  <Th right>Shares</Th>
                  <Th>Last paid</Th>
                  <Th>Joined</Th>
                  <Th>Portal</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((m) => (
                  <Tr key={m.id} onClick={() => navigate(m.id)}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">{m.name}</p>
                          <p className="text-xs text-slate-500">{m.memberNo}{m.phone ? ` · ${m.phone}` : ""}</p>
                        </div>
                        <RoleBadges roles={m.roles} />
                      </div>
                    </Td>
                    <Td>
                      <StatusBadge status={m.status === "exited" ? "exited" : m.standing} />
                    </Td>
                    <Td right>{money(m.savingsMinor, currency)}</Td>
                    <Td right>{formatShares(m.microShares)}</Td>
                    <Td>{m.lastPaidPeriod ? formatPeriod(m.lastPaidPeriod) : "—"}</Td>
                    <Td>{formatDate(m.joinedOn)}</Td>
                    <Td>{m.hasLogin ? <Badge tone="green">Active</Badge> : m.email ? <Badge>Not joined</Badge> : <span className="text-xs text-slate-400">No email</span>}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.page} pages={data.pages} total={data.total} onPage={(p) => setParams((s) => (s.set("page", String(p)), s))} />
          </>
        )}
      </Card>
      {adding && <MemberFormModal open onClose={() => setAdding(false)} onCreated={(r) => r.invite && setInvite({ url: r.invite.url, name: r.member.name })} />}
      <InviteLinkModal url={invite?.url ?? null} name={invite?.name} onClose={() => setInvite(null)} />
    </>
  );
}
