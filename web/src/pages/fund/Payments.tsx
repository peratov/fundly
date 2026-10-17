import { Download, Smartphone } from "lucide-react";
import { useState } from "react";
import { Button, Card, EmptyState, Loading, PageHeader, Pagination, SearchInput, StatusBadge, Table, Td, Th, Tr, useDebounced } from "../../components/ui";
import { qs, type Paged } from "../../lib/api";
import { formatDate, formatPeriod, money } from "../../lib/format";
import { useFundQuery } from "../../lib/hooks";
import { useFund } from "../../lib/session";
import type { Payment } from "../../lib/types";
import { GROWTH_POINTS, UpgradeCard } from "../../components/upgrade";

export default function Payments() {
  const { currency, base, plan } = useFund();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, isLoading } = useFundQuery<Paged<Payment> & { simulated: boolean }>(["payments", dq, page], `/payments${qs({ q: dq, page })}`);
  return (
    <>
      <PageHeader
        title="Mobile money payments"
        subtitle="Payments members make from their phones. Successful payments post to contributions or loans automatically."
        actions={
          <a href={`/api${base}/export/payments.csv`}>
            <Button variant="secondary" icon={<Download className="size-4" />}>
              Export
            </Button>
          </a>
        }
      />
      {!plan.onlinePayments && (
        <UpgradeCard
          className="mb-6"
          title="Let dues collect themselves"
          body="On Growth, members pay from their phones by mobile money and every payment posts to the right month or loan automatically, with an instant confirmation. AwaFund adds 0% on top of the provider's fee."
          points={GROWTH_POINTS}
        />
      )}
      {data?.simulated && plan.onlinePayments && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800 ring-1 ring-amber-200">Payments are running in simulator mode. Set PAYMENT_PROVIDER=paystack to collect real mobile money.</p>}
      <Card padded={false}>
        <div className="border-b border-slate-100 p-4 dark:border-slate-800">
          <SearchInput value={q} onChange={(v) => (setQ(v), setPage(1))} placeholder="Member or reference" />
        </div>
        {isLoading || !data ? (
          <Loading />
        ) : !data.items.length ? (
          <EmptyState icon={<Smartphone className="size-10" />} title="No payments yet" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Reference</Th>
                  <Th>Member</Th>
                  <Th>For</Th>
                  <Th right>Amount</Th>
                  <Th>Status</Th>
                  <Th>Date</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <Tr key={p.id}>
                    <Td className="font-mono text-xs">{p.providerRef}</Td>
                    <Td>
                      <p>{p.memberName}</p>
                      <p className="text-xs text-slate-500">
                        {p.network?.toUpperCase()} {p.phone}
                      </p>
                    </Td>
                    <Td className="whitespace-normal">{p.purpose === "contribution" ? `Dues: ${(p.target.periods ?? []).map((x) => formatPeriod(x)).join(", ")}` : "Loan repayment"}</Td>
                    <Td right>{money(p.amountMinor, currency)}</Td>
                    <Td>
                      <StatusBadge status={p.status} />
                      {p.failureReason && <p className="mt-1 max-w-xs text-xs whitespace-normal text-rose-600">{p.failureReason}</p>}
                    </Td>
                    <Td>{formatDate(p.createdAt, true)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
