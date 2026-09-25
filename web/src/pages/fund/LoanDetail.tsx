import { ArrowLeft, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { formatBps } from "../../../../shared/money";
import { EligibilityList, LoanSummary, ScheduleTable, ScoreCard } from "../../components/finance";
import { Badge, Button, Card, ErrorText, Field, Input, Loading, MoneyInput, PageHeader, Select, Stat, StatusBadge, Table, Td, Textarea, Th, Tr } from "../../components/ui";
import { api } from "../../lib/api";
import { formatDate, formatPeriod, money, todayIso, toMinor } from "../../lib/format";
import { useAction, useFundQuery } from "../../lib/hooks";
import { useFund } from "../../lib/session";
import type { Contribution, Loan } from "../../lib/types";
import type { CreditScore, Eligibility } from "../../../../shared/domain/members";

interface LoanDetailData extends Loan {
  reviews: { id: string; reviewerName: string; decision: "approve" | "decline"; notes: string; createdAt: string }[];
  repayments: { id: string; amountMinor: number; principalMinor: number; interestMinor: number; penaltyMinor: number; paidOn: string; method: string }[];
  penalties: { id: string; amountMinor: number; reason: string; createdAt: string }[];
  applicant: null | { score: CreditScore; eligibility: Eligibility; totals: { savingsMinor: number; shareValueMinor: number }; standing: string; joinedOn: string; recentContributions: Contribution[] };
  canReview: boolean;
  canDecide: boolean;
  canDecline: boolean;
}

export default function LoanDetail() {
  const { loanId } = useParams();
  const { currency, can } = useFund();
  const { data: l, isLoading } = useFundQuery<LoanDetailData>(["loan", loanId], `/loans/${loanId}`);
  if (isLoading || !l) return <Loading />;
  const m = (v: number) => money(v, currency);
  const outstanding = ["active", "overdue", "defaulted"].includes(l.status);

  return (
    <>
      <Link to=".." relative="path" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> Loans
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {l.ref} · {l.memberName} <StatusBadge status={l.status} /> {l.specialReview && <Badge tone="violet">Special review</Badge>}
          </span>
        }
        subtitle={`${l.productName} · ${m(l.principalMinor)} at ${formatBps(l.rateBps)} p.a. flat over ${l.termMonths} months · applied ${formatDate(l.createdAt)}`}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Principal" value={m(l.principalMinor)} />
        <Stat label="Interest (fixed)" value={m(l.interestMinor)} hint={`Total repayable ${m(l.principalMinor + l.interestMinor)}`} />
        <Stat label="Outstanding" value={l.disbursedOn ? m(l.balance.totalMinor) : "—"} hint={l.balance.penaltyMinor ? `incl. ${m(l.balance.penaltyMinor)} penalties` : undefined} />
        <Stat label="Arrears" value={l.arrearsMinor ? m(l.arrearsMinor) : "None"} tone={l.arrearsMinor ? "bad" : "good"} hint={l.maturesOn ? `Matures ${formatDate(l.maturesOn)}` : undefined} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Purpose">
            <p className="text-sm">{l.purpose}</p>
            {l.decisionNotes && <p className="mt-3 text-sm text-slate-500">Decision note: {l.decisionNotes}</p>}
          </Card>
          {l.canReview && <ReviewForm loanId={l.id} />}
          {l.canDecide && <DecisionForm loan={l} />}
          {!l.canDecide && l.canDecline && <EarlyDecline loan={l} />}
          {outstanding && can("loans:service") && <ServicingPanel loan={l} />}
          {l.reviews.length > 0 && (
            <Card title="Committee recommendations">
              <ul className="space-y-3">
                {l.reviews.map((r) => (
                  <li key={r.id} className="flex gap-3 text-sm">
                    {r.decision === "approve" ? <ThumbsUp className="mt-0.5 size-4 text-emerald-600" /> : <ThumbsDown className="mt-0.5 size-4 text-rose-500" />}
                    <div>
                      <p>
                        <span className="font-medium">{r.reviewerName}</span> recommended <b>{r.decision}</b> <span className="text-slate-400">· {formatDate(r.createdAt)}</span>
                      </p>
                      <p className="text-slate-600 dark:text-slate-400">{r.notes}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card title="Repayment schedule" padded={false}>
            <div className="p-5 pb-0">
              <LoanSummary loan={l} currency={currency} />
            </div>
            <div className="mt-4">
              <ScheduleTable loan={l} currency={currency} />
            </div>
          </Card>
          {(l.repayments.length > 0 || l.penalties.length > 0) && (
            <Card title="Payments & penalties" padded={false}>
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Type</Th>
                    <Th right>Amount</Th>
                    <Th right>Principal</Th>
                    <Th right>Interest</Th>
                    <Th right>Penalty</Th>
                  </tr>
                </thead>
                <tbody>
                  {[...l.repayments.map((r) => ({ ...r, kind: "repayment" as const, date: r.paidOn })), ...l.penalties.map((p) => ({ ...p, kind: "penalty" as const, date: p.createdAt.slice(0, 10) }))]
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map((r) =>
                      r.kind === "repayment" ? (
                        <Tr key={r.id}>
                          <Td>{formatDate(r.date)}</Td>
                          <Td className="capitalize">Repayment ({r.method})</Td>
                          <Td right className="font-medium">{m(r.amountMinor)}</Td>
                          <Td right>{m(r.principalMinor)}</Td>
                          <Td right>{m(r.interestMinor)}</Td>
                          <Td right>{m(r.penaltyMinor)}</Td>
                        </Tr>
                      ) : (
                        <Tr key={r.id}>
                          <Td>{formatDate(r.date)}</Td>
                          <Td className="text-rose-600">Penalty: {r.reason}</Td>
                          <Td right className="font-medium text-rose-600">+{m(r.amountMinor)}</Td>
                          <Td />
                          <Td />
                          <Td />
                        </Tr>
                      ),
                    )}
                </tbody>
              </Table>
            </Card>
          )}
        </div>

        {l.applicant && (
          <div className="space-y-6">
            <ScoreCard score={l.applicant.score} title="Applicant credit score" />
            <Card title="Applicant eligibility">
              <EligibilityList eligibility={l.applicant.eligibility} currency={currency} />
              <p className="mt-3 text-sm text-slate-500">
                Savings {m(l.applicant.totals.savingsMinor)} · shares worth {m(l.applicant.totals.shareValueMinor)}
              </p>
              <Link to={`../../members/${l.membershipId}`} relative="path" className="mt-3 inline-block text-sm font-medium text-brand-700">
                Full member profile →
              </Link>
            </Card>
            <Card title="Last 12 months">
              <div className="grid grid-cols-4 gap-1.5">
                {l.applicant.recentContributions.map((c) => (
                  <div key={c.id} title={`${formatPeriod(c.period)}: ${c.status}`} className={`rounded-md px-1 py-1.5 text-center text-[11px] font-medium ${c.status === "missed" ? "bg-rose-50 text-rose-700" : c.status === "late" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>
                    {formatPeriod(c.period).slice(0, 3)}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}

function ReviewForm({ loanId }: { loanId: string }) {
  const { base } = useFund();
  const [notes, setNotes] = useState("");
  const review = useAction((decision: "approve" | "decline") => api.post(`${base}/loans/${loanId}/reviews`, { decision, notes }), { success: "Recommendation recorded" });
  return (
    <Card title="Your committee recommendation" className="ring-2 ring-violet-200">
      <Field label="Notes for the manager" hint="Required — explain the reasoning so the decision is auditable">
        {(id) => <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} />}
      </Field>
      <div className="mt-3 flex gap-2">
        <Button variant="success" icon={<ThumbsUp className="size-4" />} disabled={notes.trim().length < 3} loading={review.isPending && review.variables === "approve"} onClick={() => review.mutate("approve")}>
          Recommend approval
        </Button>
        <Button variant="secondary" icon={<ThumbsDown className="size-4" />} disabled={notes.trim().length < 3} loading={review.isPending && review.variables === "decline"} onClick={() => review.mutate("decline")}>
          Recommend decline
        </Button>
      </div>
      <div className="mt-3">
        <ErrorText error={review.error} />
      </div>
    </Card>
  );
}

function DecisionForm({ loan }: { loan: LoanDetailData }) {
  const { base, currency } = useFund();
  const [notes, setNotes] = useState("");
  const [disbursedOn, setDisbursedOn] = useState(todayIso());
  const decide = useAction((decision: "approve" | "decline") => api.post(`${base}/loans/${loan.id}/decision`, { decision, notes, disbursedOn }), {
    success: (_) => "Decision recorded",
  });
  return (
    <Card title="Manager decision" className="ring-2 ring-amber-200">
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">Approving disburses {money(loan.principalMinor, currency)} from fund cash and starts the repayment schedule.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Disbursement date">{(id) => <Input id={id} type="date" value={disbursedOn} onChange={(e) => setDisbursedOn(e.target.value)} />}</Field>
        <Field label="Note to member" className="sm:col-span-2">
          {(id) => <Input id={id} value={notes} onChange={(e) => setNotes(e.target.value)} />}
        </Field>
      </div>
      <div className="mt-3 flex gap-2">
        <Button variant="success" loading={decide.isPending && decide.variables === "approve"} onClick={() => decide.mutate("approve")}>
          Approve & disburse
        </Button>
        <Button variant="danger" loading={decide.isPending && decide.variables === "decline"} onClick={() => decide.mutate("decline")}>
          Decline
        </Button>
      </div>
      <div className="mt-3">
        <ErrorText error={decide.error} />
      </div>
    </Card>
  );
}

/** While the committee is still reviewing, a manager can close an application early (e.g. the member is leaving). */
function EarlyDecline({ loan }: { loan: LoanDetailData }) {
  const { base } = useFund();
  const [notes, setNotes] = useState("");
  const decline = useAction(() => api.post(`${base}/loans/${loan.id}/decision`, { decision: "decline", notes }), { success: "Application declined" });
  return (
    <Card title="Awaiting committee review">
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">Approval waits for the credit committee. If this application shouldn't go ahead, for example because the member is leaving, you can decline it now.</p>
      <Field label="Reason (shown to the member)">{(id) => <Input id={id} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
      <div className="mt-3">
        <Button variant="danger" disabled={notes.trim().length < 3} loading={decline.isPending} onClick={() => window.confirm(`Decline ${loan.ref}?`) && decline.mutate()}>
          Decline application
        </Button>
      </div>
      <div className="mt-3">
        <ErrorText error={decline.error} />
      </div>
    </Card>
  );
}

function ServicingPanel({ loan }: { loan: LoanDetailData }) {
  const { base, currency, can } = useFund();
  const [mode, setMode] = useState<"repay" | "penalty" | "status">("repay");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(todayIso());
  const [method, setMethod] = useState("cash");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<"defaulted" | "written_off" | "active">("defaulted");
  const act = useAction(
    () =>
      mode === "repay"
        ? api.post(`${base}/loans/${loan.id}/repayments`, { amountMinor: toMinor(amount || "0"), paidOn, method })
        : mode === "penalty"
          ? api.post(`${base}/loans/${loan.id}/penalties`, { amountMinor: toMinor(amount || "0"), reason })
          : api.post(`${base}/loans/${loan.id}/status`, { status, reason }),
    { success: mode === "repay" ? "Repayment recorded" : mode === "penalty" ? "Penalty applied" : "Status updated", onSuccess: () => (setAmount(""), setReason("")) },
  );
  return (
    <Card
      title="Servicing"
      actions={
        <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="h-8 w-44 text-xs" aria-label="Action">
          <option value="repay">Record repayment</option>
          <option value="penalty">Apply penalty</option>
          {can("loans:decide") && <option value="status">Change status</option>}
        </Select>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {mode !== "status" && (
          <Field label="Amount" hint={mode === "repay" ? `Balance ${money(loan.balance.totalMinor, currency)}` : undefined}>
            {(id) => <MoneyInput id={id} currency={currency} value={amount} onChange={setAmount} />}
          </Field>
        )}
        {mode === "repay" && (
          <>
            <Field label="Paid on">{(id) => <Input id={id} type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />}</Field>
            <Field label="Method">
              {(id) => (
                <Select id={id} value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="cash">Cash</option>
                  <option value="momo">Mobile money</option>
                  <option value="bank">Bank transfer</option>
                </Select>
              )}
            </Field>
          </>
        )}
        {mode === "status" && (
          <Field label="New status">
            {(id) => (
              <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                <option value="defaulted">Defaulted</option>
                <option value="written_off">Written off</option>
                <option value="active">Back to active</option>
              </Select>
            )}
          </Field>
        )}
        {mode !== "repay" && (
          <Field label="Reason" className="sm:col-span-2">
            {(id) => <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
        )}
      </div>
      {mode === "repay" && (
        <button className="mt-2 text-xs font-medium text-brand-700" onClick={() => setAmount(String(loan.balance.totalMinor / 100))}>
          Pay off in full ({money(loan.balance.totalMinor, currency)})
        </button>
      )}
      <div className="mt-3 flex items-center gap-3">
        <Button loading={act.isPending} variant={mode === "status" && status === "written_off" ? "danger" : "primary"} onClick={() => act.mutate(undefined)}>
          {mode === "repay" ? "Record repayment" : mode === "penalty" ? "Apply penalty" : "Update status"}
        </Button>
      </div>
      <div className="mt-3">
        <ErrorText error={act.error} />
      </div>
    </Card>
  );
}
