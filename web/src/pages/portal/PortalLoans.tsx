import { HandCoins } from "lucide-react";
import { PortalHeader } from "../../components/portal";
import { useState } from "react";
import { quoteLoan } from "../../../../shared/domain/loans";
import { formatBps } from "../../../../shared/money";
import { EligibilityList, LoanSummary, ScheduleTable, ScoreCard } from "../../components/finance";
import { Button, Card, clsx, ErrorText, Field, Input, Loading, MoneyInput, PageHeader, Textarea } from "../../components/ui";
import { api } from "../../lib/api";
import { money, toMinor } from "../../lib/format";
import { useAction, useFundInfo } from "../../lib/hooks";
import { useFund } from "../../lib/session";
import { usePortal } from "./Portal";

export default function PortalLoans() {
  const { currency } = useFund();
  const { data, isLoading } = usePortal();
  const [openId, setOpenId] = useState<string | null>(null);
  if (isLoading || !data) return <Loading />;
  const hasOpen = data.loans.some((l) => ["pending_committee", "pending_manager", "active", "overdue", "defaulted"].includes(l.status));

  return (
    <>
      <PortalHeader tone="grape" icon={<HandCoins />} title="My loans" subtitle="Apply, follow the committee review, and track every repayment." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {!hasOpen && (
            <Card title="Apply for a loan">
              <LoanApplicationForm eligible={data.eligibility.eligible} limitMinor={data.eligibility.limitMinor} />
            </Card>
          )}
          {data.loans.map((l) => (
            <Card key={l.id}>
              <LoanSummary loan={l} currency={currency} />
              {l.decisionNotes && <p className="mt-2 text-sm text-slate-500">Note from the fund: {l.decisionNotes}</p>}
              {l.schedule.length > 0 && (
                <>
                  <button className="mt-3 text-sm font-medium text-brand-700" onClick={() => setOpenId(openId === l.id ? null : l.id)}>
                    {openId === l.id ? "Hide schedule" : "Show repayment schedule"}
                  </button>
                  {openId === l.id && (
                    <div className="-mx-5 mt-3">
                      <ScheduleTable loan={l} currency={currency} />
                    </div>
                  )}
                </>
              )}
            </Card>
          ))}
        </div>
        <div className="space-y-6">
          <Card title="Can I borrow?">
            <EligibilityList eligibility={data.eligibility} currency={currency} />
          </Card>
          <ScoreCard score={data.score} title="My credit score" />
        </div>
      </div>
    </>
  );
}

/** Loan application with a live quote. Used by members for themselves and by managers on a member's behalf. */
export function LoanApplicationForm({ membershipId, eligible = true, limitMinor, onDone }: { membershipId?: string; eligible?: boolean; limitMinor?: number; onDone?: () => void }) {
  const { base, currency } = useFund();
  const { data: info } = useFundInfo();
  const products = info?.settings.loanProducts.filter((p) => p.active) ?? [];
  const [code, setCode] = useState<string | null>(null);
  const product = products.find((p) => p.code === code) ?? products[0];
  const [amount, setAmount] = useState("");
  const [term, setTerm] = useState(3);
  const [purpose, setPurpose] = useState("");
  const principal = safeMinor(amount);
  const termMonths = product ? Math.min(term, product.maxTermMonths) : term;
  const q = product && principal > 0 ? quoteLoan(principal, product.rateBps, termMonths) : null;
  const overLimit = limitMinor !== undefined && principal > limitMinor;
  const special = !eligible || overLimit;

  const apply = useAction(() => api.post(`${base}/loans`, { membershipId, productCode: product!.code, principalMinor: principal, termMonths, purpose, requestSpecialReview: special }), {
    success: "Application submitted to the credit committee",
    onSuccess: () => (setAmount(""), setPurpose(""), onDone?.()),
  });
  if (!info) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {products.map((p) => (
          <button
            key={p.code}
            onClick={() => setCode(p.code)}
            className={clsx("rounded-xl p-3 text-left ring-1 transition", p.code === product?.code ? "bg-brand-50 ring-2 ring-brand-600 dark:bg-brand-900/30" : "ring-slate-200 hover:bg-slate-50 dark:ring-slate-700 dark:hover:bg-slate-800")}
          >
            <p className="text-sm font-semibold">{p.name}</p>
            <p className="text-xs text-slate-500">
              {formatBps(p.rateBps)} p.a. · up to {money(p.maxAmountMinor, currency)} · {p.maxTermMonths} months max
            </p>
            {p.description && <p className="mt-1 text-xs text-slate-500">{p.description}</p>}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount" hint={limitMinor !== undefined ? `Your limit is ${money(limitMinor, currency)}` : undefined}>
          {(id) => <MoneyInput id={id} currency={currency} value={amount} onChange={setAmount} />}
        </Field>
        <Field label={`Repay over ${termMonths} month${termMonths === 1 ? "" : "s"}`}>
          {(id) => <Input id={id} type="range" min={1} max={product?.maxTermMonths ?? 12} value={termMonths} onChange={(e) => setTerm(Number(e.target.value))} className="!h-10 !ring-0 !shadow-none accent-brand-700" />}
        </Field>
      </div>
      <Field label="What is the loan for?">{(id) => <Textarea id={id} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. School fees for my daughter" />}</Field>
      {q && (
        <div className="grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-4 text-center dark:bg-slate-800">
          <div>
            <p className="text-xs text-slate-500">Monthly</p>
            <p className="num font-semibold">{money(q.installmentMinor, currency)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Interest</p>
            <p className="num font-semibold">{money(q.interestMinor, currency)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Total to repay</p>
            <p className="num font-semibold">{money(q.totalMinor, currency)}</p>
          </div>
        </div>
      )}
      {special && principal > 0 && <p className="rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-800 ring-1 ring-violet-200">This request is outside the standard rules, so it will go to the committee as a special review.</p>}
      <ErrorText error={apply.error} />
      <Button loading={apply.isPending} disabled={!q || purpose.trim().length < 5 || (product && principal > product.maxAmountMinor)} onClick={() => apply.mutate(undefined)}>
        Submit application
      </Button>
    </div>
  );
}

function safeMinor(v: string) {
  try {
    return v ? toMinor(v) : 0;
  } catch {
    return 0;
  }
}
