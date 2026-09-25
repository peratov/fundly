import { Download, Printer } from "lucide-react";
import { useState } from "react";
import { Button, Card, Field, Input, Loading, PageHeader, Select, Stat } from "../../components/ui";
import { formatDate, money } from "../../lib/format";
import { useFundQuery } from "../../lib/hooks";
import { useFund } from "../../lib/session";

interface Summary {
  inflows: Record<string, number>;
  outflows: Record<string, number>;
  opening: Record<string, number>;
  closing: Record<string, number>;
  loanBook: { count: number; outstandingMinor: number; arrearsMinor: number; atRisk: number };
  contributions: { paid: number; late: number; missed: number };
  claims: { approved: number; rejected: number };
}

function range(preset: string): { from: string; to: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const end = (yy: number, mm: number) => iso(new Date(Date.UTC(yy, mm + 1, 0)));
  switch (preset) {
    case "month":
      return { from: iso(new Date(Date.UTC(y, m, 1))), to: end(y, m) };
    case "last_month":
      return { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: end(y, m - 1) };
    case "quarter": {
      const q = Math.floor(m / 3) * 3;
      return { from: iso(new Date(Date.UTC(y, q, 1))), to: end(y, q + 2) };
    }
    case "last_year":
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    default:
      return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
}

const ACCOUNT_LABELS: Record<string, string> = {
  cash: "Cash",
  loans_receivable: "Loans receivable",
  member_savings: "Member savings",
  welfare_reserve: "Welfare reserve",
  interest_income: "Interest income",
  penalty_income: "Penalty income",
  write_off_expense: "Loan write-offs",
};

export default function Reports() {
  const { currency, base } = useFund();
  const [preset, setPreset] = useState("year");
  const [custom, setCustom] = useState(range("year"));
  const r = preset === "custom" ? custom : range(preset);
  const { data, isLoading } = useFundQuery<Summary>(["report", r.from, r.to], `/reports/summary?from=${r.from}&to=${r.to}`);
  const m = (v: number | undefined) => money(v ?? 0, currency);

  return (
    <>
      <PageHeader
        title="Financial report"
        subtitle={`${formatDate(r.from)} – ${formatDate(r.to)} · all figures come straight from the double-entry journal`}
        actions={
          <>
            <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.print()}>
              Print
            </Button>
            <a href={`/api${base}/export/journal.csv`}>
              <Button variant="secondary" icon={<Download className="size-4" />}>
                Journal CSV
              </Button>
            </a>
          </>
        }
      />
      <div className="mb-6 flex flex-wrap items-end gap-3 print:hidden">
        <Field label="Period">
          {(id) => (
            <Select id={id} value={preset} onChange={(e) => setPreset(e.target.value)} className="w-48">
              <option value="month">This month</option>
              <option value="last_month">Last month</option>
              <option value="quarter">This quarter</option>
              <option value="year">This year</option>
              <option value="last_year">Last year</option>
              <option value="custom">Custom…</option>
            </Select>
          )}
        </Field>
        {preset === "custom" && (
          <>
            <Field label="From">{(id) => <Input id={id} type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />}</Field>
            <Field label="To">{(id) => <Input id={id} type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />}</Field>
          </>
        )}
      </div>

      {isLoading || !data ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Contributions received" value={m(data.inflows.contributionsMinor)} hint={`${data.contributions.paid} payments · ${data.contributions.late} late · ${data.contributions.missed} missed`} />
            <Stat label="Loans disbursed" value={m(data.outflows.loansDisbursedMinor)} />
            <Stat label="Loan repayments" value={m(data.inflows.loanRepaymentsMinor)} hint={`Interest ${m(data.inflows.interestIncomeMinor)} · penalties ${m(data.inflows.penaltyIncomeMinor)}`} />
            <Stat label="Welfare paid out" value={m(data.outflows.welfarePaidMinor)} hint={`${data.claims.approved} approved · ${data.claims.rejected} rejected`} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card title="Cash movement">
              <dl className="space-y-2 text-sm">
                <Line k="Opening cash" v={m(data.opening.cash)} bold />
                <Line k="+ Member contributions" v={m(data.inflows.contributionsMinor)} />
                <Line k="+ Loan repayments" v={m(data.inflows.loanRepaymentsMinor)} />
                <Line k="− Loans disbursed" v={m(data.outflows.loansDisbursedMinor)} />
                <Line k="− Welfare payouts" v={m(data.outflows.welfarePaidMinor)} />
                <Line k="Closing cash" v={m(data.closing.cash)} bold />
              </dl>
            </Card>
            <Card title="Balances">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500">
                    <th className="pb-2 text-left font-medium">Account</th>
                    <th className="pb-2 text-right font-medium">Opening</th>
                    <th className="pb-2 text-right font-medium">Closing</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(ACCOUNT_LABELS).map((a) => (
                    <tr key={a} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="py-2">{ACCOUNT_LABELS[a]}</td>
                      <td className="num py-2 text-right text-slate-500">{m(data.opening[a])}</td>
                      <td className="num py-2 text-right font-medium">{m(data.closing[a])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card title="Loan book (today)">
              <dl className="space-y-2 text-sm">
                <Line k="Open loans" v={String(data.loanBook.count)} />
                <Line k="Outstanding (incl. interest & penalties)" v={m(data.loanBook.outstandingMinor)} />
                <Line k="Behind schedule" v={m(data.loanBook.arrearsMinor)} />
                <Line k="Loans overdue or defaulted" v={String(data.loanBook.atRisk)} />
              </dl>
            </Card>
            <Card title="Exports">
              <p className="mb-3 text-sm text-slate-500">Full data as CSV, for your auditors or spreadsheet.</p>
              <div className="flex flex-wrap gap-2">
                {["members", "contributions", "loans", "claims", "payments", "journal", "audit"].map((e) => (
                  <a key={e} href={`/api${base}/export/${e}.csv`}>
                    <Button size="sm" variant="secondary" icon={<Download className="size-3.5" />}>
                      {e}
                    </Button>
                  </a>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function Line({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "border-t border-slate-100 pt-2 font-semibold dark:border-slate-800" : ""}`}>
      <dt className={bold ? "" : "text-slate-600 dark:text-slate-400"}>{k}</dt>
      <dd className="num">{v}</dd>
    </div>
  );
}
