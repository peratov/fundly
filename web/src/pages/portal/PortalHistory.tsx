import { Flame, HeartPulse, History, PiggyBank, TrendingUp } from "lucide-react";
import { PortalHeader, PortalStat } from "../../components/portal";
import { ContributionHistory } from "../../components/finance";
import { Card, Loading, PageHeader, StatusBadge, Stat, Table, Td, Th, Tr } from "../../components/ui";
import { qs, type Paged } from "../../lib/api";
import { formatDate, money } from "../../lib/format";
import { useFundQuery } from "../../lib/hooks";
import { useFund } from "../../lib/session";
import type { Payment } from "../../lib/types";
import { usePortal } from "./Portal";

export default function PortalHistory() {
  const { currency } = useFund();
  const { data, isLoading } = usePortal();
  const { data: payments } = useFundQuery<Paged<Payment>>(["my-payments"], `/payments${qs({ mine: true, pageSize: 20 })}`);
  if (isLoading || !data) return <Loading />;
  const t = data.totals;
  return (
    <>
      <PortalHeader tone="sun" icon={<History />} title="Payment history" subtitle="Every month you've contributed, and how it was split between savings and welfare." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <PortalStat tone="teal" icon={<PiggyBank />} label="Total contributed" value={money(t.totalContributedMinor, currency)} />
        <PortalStat tone="grape" icon={<TrendingUp />} label="Saved as shares" value={money(t.savingsMinor, currency)} />
        <PortalStat tone="rose" icon={<HeartPulse />} label="Welfare premiums" value={money(t.welfarePremiumsMinor, currency)} />
        <PortalStat tone="sun" icon={<Flame />} label="Months paid" value={t.paidPeriods} hint={t.missedPeriods ? `${t.missedPeriods} missed` : "Never missed one"} />
      </div>
      {!!payments?.items.length && (
        <Card title="Mobile money payments" padded={false} className="mb-6">
          <Table>
            <thead>
              <tr>
                <Th>Reference</Th>
                <Th right>Amount</Th>
                <Th>Status</Th>
                <Th>Date</Th>
              </tr>
            </thead>
            <tbody>
              {payments.items.map((p) => (
                <Tr key={p.id}>
                  <Td className="font-mono text-xs">{p.providerRef}</Td>
                  <Td right>{money(p.amountMinor, currency)}</Td>
                  <Td>
                    <StatusBadge status={p.status} />
                  </Td>
                  <Td>{formatDate(p.createdAt, true)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      <Card title="Contributions" padded={false}>
        <ContributionHistory items={data.contributions} currency={currency} />
      </Card>
    </>
  );
}
