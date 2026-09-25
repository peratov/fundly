import { Download, HandCoins, Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { formatBps } from "../../../../shared/money";
import { MemberPicker } from "../../components/MemberPicker";
import { Badge, Button, Card, EmptyState, Field, Loading, Modal, PageHeader, Pagination, SearchInput, StatusBadge, Table, Tabs, Td, Th, Tr, useDebounced } from "../../components/ui";
import { qs, type Paged } from "../../lib/api";
import { formatDate, money } from "../../lib/format";
import { useFundQuery } from "../../lib/hooks";
import { useFund } from "../../lib/session";
import type { Loan } from "../../lib/types";
import { LoanApplicationForm } from "../portal/PortalLoans";

const TABS = [
  { value: "pending_committee", label: "Committee review" },
  { value: "pending_manager", label: "Awaiting decision" },
  { value: "active,overdue,defaulted", label: "Active" },
  { value: "overdue,defaulted", label: "In arrears" },
  { value: "repaid,declined,written_off", label: "Closed" },
  { value: "", label: "All" },
];

export default function Loans() {
  const { currency, can, base } = useFund();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? (can("loans:review") && !can("loans:decide") ? "pending_committee" : "active,overdue,defaulted");
  const page = Number(params.get("page") ?? 1);
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [newFor, setNewFor] = useState<{ id: string; name: string } | null | undefined>(undefined);
  const { data, isLoading } = useFundQuery<Paged<Loan>>(["loans", status, dq, page], `/loans${qs({ status, q: dq, page, pageSize: 25 })}`);

  return (
    <>
      <PageHeader
        title="Loans"
        subtitle="Applications move from committee review to a manager decision, then disbursement and repayment."
        actions={
          <>
            {can("reports:read") && (
              <a href={`/api${base}/export/loans.csv`}>
                <Button variant="secondary" icon={<Download className="size-4" />}>
                  Export
                </Button>
              </a>
            )}
            {can("members:write") && (
              <Button icon={<Plus className="size-4" />} onClick={() => setNewFor(null)}>
                Apply on behalf
              </Button>
            )}
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={status} onChange={(v) => setParams({ status: v }, { replace: true })} tabs={TABS} />
        <SearchInput value={q} onChange={setQ} placeholder="Member or loan ref" />
      </div>
      <Card padded={false}>
        {isLoading || !data ? (
          <Loading />
        ) : !data.items.length ? (
          <EmptyState icon={<HandCoins className="size-10" />} title="No loans here" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Loan</Th>
                  <Th>Member</Th>
                  <Th>Status</Th>
                  <Th right>Principal</Th>
                  <Th right>Balance</Th>
                  <Th right>Arrears</Th>
                  <Th>Applied</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((l) => (
                  <Tr key={l.id} onClick={() => navigate(l.id)}>
                    <Td>
                      <p className="font-medium text-slate-900 dark:text-white">
                        {l.ref} {l.specialReview && <Badge tone="violet">Special review</Badge>}
                      </p>
                      <p className="text-xs text-slate-500">
                        {l.productName} · {formatBps(l.rateBps)} · {l.termMonths} mo
                      </p>
                    </Td>
                    <Td>{l.memberName}</Td>
                    <Td>
                      <StatusBadge status={l.status} />
                    </Td>
                    <Td right>{money(l.principalMinor, currency)}</Td>
                    <Td right>{l.disbursedOn ? money(l.balance.totalMinor, currency) : "—"}</Td>
                    <Td right className={l.arrearsMinor ? "text-rose-600" : undefined}>
                      {l.arrearsMinor ? money(l.arrearsMinor, currency) : "—"}
                    </Td>
                    <Td>{formatDate(l.createdAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.page} pages={data.pages} total={data.total} onPage={(p) => setParams((s) => (s.set("page", String(p)), s))} />
          </>
        )}
      </Card>
      {newFor !== undefined && (
        <Modal open onClose={() => setNewFor(undefined)} title="Loan application on behalf of a member" wide>
          <Field label="Member" className="mb-4">
            {(id) => <MemberPicker id={id} value={newFor} onChange={setNewFor} />}
          </Field>
          {newFor && <LoanApplicationForm membershipId={newFor.id} onDone={() => setNewFor(undefined)} />}
        </Modal>
      )}
    </>
  );
}
