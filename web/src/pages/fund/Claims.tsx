import { HeartPulse } from "lucide-react";
import { useState } from "react";
import { Button, Card, EmptyState, ErrorText, Field, Input, Loading, Modal, MoneyInput, PageHeader, Pagination, SearchInput, StatusBadge, Table, Tabs, Td, Th, Tr, useDebounced } from "../../components/ui";
import { api, qs, type Paged } from "../../lib/api";
import { formatDate, money, toMinor } from "../../lib/format";
import { useAction, useFundQuery } from "../../lib/hooks";
import { useFund } from "../../lib/session";
import type { Claim } from "../../lib/types";

export default function Claims() {
  const { currency, can } = useFund();
  const [status, setStatus] = useState("pending");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const [deciding, setDeciding] = useState<Claim | null>(null);
  const { data, isLoading } = useFundQuery<Paged<Claim>>(["claims", status, dq, page], `/claims${qs({ status, q: dq, page })}`);

  return (
    <>
      <PageHeader title="Welfare claims" subtitle="Medical, funeral, welfare and emergency support paid from the welfare reserve, within each member's package limits." />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={status}
          onChange={(v) => (setStatus(v), setPage(1))}
          tabs={[
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
            { value: "", label: "All" },
          ]}
        />
        <SearchInput value={q} onChange={setQ} placeholder="Member or claim ref" />
      </div>
      <Card padded={false}>
        {isLoading || !data ? (
          <Loading />
        ) : !data.items.length ? (
          <EmptyState icon={<HeartPulse className="size-10" />} title="No claims" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Claim</Th>
                  <Th>Member</Th>
                  <Th>Details</Th>
                  <Th right>Requested</Th>
                  <Th right>Approved</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <Tr key={c.id}>
                    <Td>
                      <p className="font-medium capitalize">{c.type}</p>
                      <p className="text-xs text-slate-500">
                        {c.ref} · {formatDate(c.createdAt)}
                      </p>
                    </Td>
                    <Td>{c.memberName}</Td>
                    <Td className="max-w-xs truncate whitespace-normal">{c.description}</Td>
                    <Td right>{money(c.amountRequestedMinor, currency)}</Td>
                    <Td right>{c.status === "approved" ? money(c.amountApprovedMinor, currency) : "—"}</Td>
                    <Td>
                      <StatusBadge status={c.status} />
                    </Td>
                    <Td>
                      {c.status === "pending" && can("claims:decide") && (
                        <Button size="sm" onClick={() => setDeciding(c)}>
                          Decide
                        </Button>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
      {deciding && <DecideModal claim={deciding} onClose={() => setDeciding(null)} />}
    </>
  );
}

function DecideModal({ claim, onClose }: { claim: Claim; onClose: () => void }) {
  const { base, currency } = useFund();
  const [amount, setAmount] = useState(String(claim.amountRequestedMinor / 100));
  const [notes, setNotes] = useState("");
  const decide = useAction((decision: "approve" | "reject") => api.post(`${base}/claims/${claim.id}/decision`, { decision, amountApprovedMinor: decision === "approve" ? toMinor(amount || "0") : undefined, notes }), {
    success: "Claim decided",
    onSuccess: onClose,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`${claim.ref}: ${claim.memberName}`}
      footer={
        <>
          <Button variant="danger" loading={decide.isPending && decide.variables === "reject"} onClick={() => decide.mutate("reject")}>
            Reject
          </Button>
          <Button variant="success" loading={decide.isPending && decide.variables === "approve"} onClick={() => decide.mutate("approve")}>
            Approve & pay
          </Button>
        </>
      }
    >
      <p className="text-sm">
        <span className="font-medium capitalize">{claim.type}</span> claim for {money(claim.amountRequestedMinor, currency)}
      </p>
      <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300">{claim.description}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Amount to pay" hint="Can be less than requested">
          {(id) => <MoneyInput id={id} currency={currency} value={amount} onChange={setAmount} />}
        </Field>
        <Field label="Note to member">{(id) => <Input id={id} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
      </div>
      <div className="mt-3">
        <ErrorText error={decide.error} />
      </div>
    </Modal>
  );
}
