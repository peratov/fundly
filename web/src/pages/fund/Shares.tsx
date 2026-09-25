import { Gift } from "lucide-react";
import { useState } from "react";
import { MemberPicker } from "../../components/MemberPicker";
import { Button, Card, ErrorText, Field, Input, Loading, Modal, PageHeader, Pagination, ProgressBar, SearchInput, Stat, StatusBadge, Table, Td, Th, Tr, useDebounced } from "../../components/ui";
import { api, qs, type Paged } from "../../lib/api";
import { formatPeriod, formatShares, money } from "../../lib/format";
import { useAction, useFundQuery } from "../../lib/hooks";
import { useFund } from "../../lib/session";

interface ShareRow {
  id: string;
  name: string;
  memberNo: string;
  status: string;
  microShares: number;
  grantedMicroShares: number;
  valueMinor: number;
  pct: number;
}

interface SharesData extends Paged<ShareRow> {
  sharePriceMinor: number;
  sharePrices: { effectivePeriod: string; priceMinor: number }[];
  totalMicroShares: number;
  totalValueMinor: number;
}

export default function Shares() {
  const { currency, can } = useFund();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [granting, setGranting] = useState(false);
  const dq = useDebounced(q);
  const { data, isLoading } = useFundQuery<SharesData>(["shares", dq, page], `/shares${qs({ q: dq, page, pageSize: 50 })}`);
  if (isLoading || !data) return <Loading />;
  const top = data.items[0]?.pct ?? 0;

  return (
    <>
      <PageHeader
        title="Shares register"
        subtitle="Savings buy shares at the price in force for each month. Bonus shares are explicit, audited grants."
        actions={
          can("shares:write") && (
            <Button icon={<Gift className="size-4" />} onClick={() => setGranting(true)}>
              Grant bonus shares
            </Button>
          )
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Current share price" value={money(data.sharePriceMinor, currency)} />
        <Stat label="Shares issued" value={formatShares(data.totalMicroShares, 0)} />
        <Stat label="Value at current price" value={money(data.totalValueMinor, currency)} />
        <Stat label="Price history" value={data.sharePrices.length} hint={data.sharePrices.map((p) => `${formatPeriod(p.effectivePeriod)}: ${money(p.priceMinor, currency)}`).join(" · ")} />
      </div>
      <Card padded={false}>
        <div className="border-b border-slate-100 p-4 dark:border-slate-800">
          <SearchInput value={q} onChange={(v) => (setQ(v), setPage(1))} placeholder="Search member" />
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Member</Th>
              <Th right>Shares</Th>
              <Th right>of which bonus</Th>
              <Th right>Value</Th>
              <Th className="w-1/4">Ownership</Th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((r) => (
              <Tr key={r.id}>
                <Td>
                  <p className="font-medium">
                    {r.name} {r.status === "exited" && <StatusBadge status="exited" />}
                  </p>
                  <p className="text-xs text-slate-500">{r.memberNo}</p>
                </Td>
                <Td right>{formatShares(r.microShares)}</Td>
                <Td right>{r.grantedMicroShares ? formatShares(r.grantedMicroShares) : "—"}</Td>
                <Td right>{money(r.valueMinor, currency)}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <ProgressBar value={r.pct} max={top || 1} />
                    <span className="num w-12 text-right text-xs">{r.pct.toFixed(1)}%</span>
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
      </Card>
      {granting && <GrantModal onClose={() => setGranting(false)} />}
    </>
  );
}

function GrantModal({ onClose }: { onClose: () => void }) {
  const { base } = useFund();
  const [member, setMember] = useState<{ id: string; name: string } | null>(null);
  const [shares, setShares] = useState("15");
  const [reason, setReason] = useState("Manager service bonus");
  const grant = useAction(() => api.post(`${base}/shares/grants`, { membershipId: member!.id, shares: Number(shares), reason }), { success: "Shares granted", onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      title="Grant bonus shares"
      footer={
        <Button loading={grant.isPending} disabled={!member || !Number(shares) || reason.length < 3} onClick={() => grant.mutate(undefined)}>
          Grant
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Member">{(id) => <MemberPicker id={id} value={member} onChange={setMember} />}</Field>
        <Field label="Number of shares" hint="Use a negative number to reverse a grant">
          {(id) => <Input id={id} type="number" step="0.01" value={shares} onChange={(e) => setShares(e.target.value)} />}
        </Field>
        <Field label="Reason">{(id) => <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        <ErrorText error={grant.error} />
      </div>
    </Modal>
  );
}
