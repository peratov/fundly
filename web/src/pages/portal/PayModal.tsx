import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Smartphone, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { MOMO_NETWORKS } from "../../../../shared/enums";
import { Button, clsx, ErrorText, Field, Input, Modal, MoneyInput, Select, Spinner } from "../../components/ui";
import { api } from "../../lib/api";
import { formatPeriod, money, toMinor } from "../../lib/format";
import { Confetti } from "../../lib/motion";
import { useAction, useFundQuery } from "../../lib/hooks";
import { useFund } from "../../lib/session";
import type { Payment } from "../../lib/types";

const NETWORK_LABELS: Record<string, string> = { mtn: "MTN MoMo", telecel: "Telecel Cash", at: "AirtelTigo Money" };

type Target = { kind: "dues"; periods: string[]; minMinor: number } | { kind: "loan"; loanId: string; ref: string; balanceMinor: number; suggestedMinor: number };

/**
 * Mobile-money checkout. The server asks the gateway to push a prompt to the
 * member's phone; we then poll the payment until the webhook settles it.
 */
export function PayModal({ target, phone: defaultPhone, simulated, onClose }: { target: Target; phone: string | null; simulated: boolean; onClose: () => void }) {
  const { base, currency, tenantId } = useFund();
  const qc = useQueryClient();
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [network, setNetwork] = useState<string>("mtn");
  const [selected, setSelected] = useState<string[]>(target.kind === "dues" ? target.periods.slice(0, 1) : []);
  const [amount, setAmount] = useState(target.kind === "dues" ? String(target.minMinor / 100) : String(target.suggestedMinor / 100));
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [display, setDisplay] = useState<string | undefined>();

  const start = useAction(
    () =>
      api.post<{ payment: Payment; displayText?: string }>(
        `${base}/payments`,
        target.kind === "dues"
          ? { purpose: "contribution", periods: selected, amountPerPeriodMinor: toMinor(amount || "0"), phone, network }
          : { purpose: "loan_repayment", loanId: target.loanId, amountMinor: toMinor(amount || "0"), phone, network },
      ),
    { invalidate: [], onSuccess: (r) => (setPaymentId(r.payment.id), setDisplay(r.displayText)) },
  );
  const { data: payment } = useFundQuery<Payment>(["payment", paymentId], paymentId ? `/payments/${paymentId}` : null);
  const status = payment?.status ?? (paymentId ? "pending" : null);

  // Poll the gateway while the member approves the prompt.
  const refresh = useAction(() => api.post(`${base}/payments/${paymentId}/refresh`), { invalidate: [[tenantId, "payment", paymentId]] });
  useEffect(() => {
    if (status === "succeeded" || status === "failed") qc.invalidateQueries({ queryKey: [tenantId] });
  }, [status, qc, tenantId]);
  useEffect(() => {
    if (status !== "pending" || simulated || !paymentId) return;
    const t = setInterval(() => refresh.mutate(undefined), 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, paymentId, simulated]);
  const simulate = useAction((outcome: "succeeded" | "failed") => api.post(`${base}/payments/${paymentId}/simulate`, { outcome }), { invalidate: [[tenantId, "payment", paymentId]] });

  const perPeriod = toMinorOr0(amount);
  const total = target.kind === "dues" ? perPeriod * selected.length : perPeriod;

  return (
    <Modal open onClose={onClose} title={target.kind === "dues" ? "Pay monthly dues" : `Repay loan ${target.ref}`}>
      {!paymentId ? (
        <div className="space-y-4">
          {target.kind === "dues" && (
            <div>
              <p className="mb-2 text-sm font-medium">Months to pay</p>
              <div className="flex flex-wrap gap-2">
                {target.periods.map((p) => (
                  <button
                    key={p}
                    onClick={() => setSelected((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p].sort()))}
                    className={clsx("rounded-lg px-3 py-1.5 text-sm font-medium ring-1", selected.includes(p) ? "bg-brand-700 text-white ring-brand-700" : "ring-slate-300 hover:bg-slate-50 dark:ring-slate-700 dark:hover:bg-slate-800")}
                  >
                    {formatPeriod(p)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label={target.kind === "dues" ? "Amount per month" : "Amount"} hint={target.kind === "dues" ? `Minimum ${money(target.minMinor, currency)}` : `Balance ${money(target.balanceMinor, currency)}`}>
              {(id) => <MoneyInput id={id} currency={currency} value={amount} onChange={setAmount} />}
            </Field>
            <Field label="Network">
              {(id) => (
                <Select id={id} value={network} onChange={(e) => setNetwork(e.target.value)}>
                  {MOMO_NETWORKS.map((n) => (
                    <option key={n} value={n}>
                      {NETWORK_LABELS[n]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <Field label="Mobile money number">{(id) => <Input id={id} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="024 000 0000" />}</Field>
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 dark:bg-slate-800">
            <span className="text-sm text-slate-600 dark:text-slate-400">Total</span>
            <span className="num text-lg font-semibold">{money(total, currency)}</span>
          </div>
          <ErrorText error={start.error} />
          <Button className="w-full" icon={<Smartphone className="size-4" />} loading={start.isPending} disabled={!phone || total <= 0 || (target.kind === "dues" && !selected.length)} onClick={() => start.mutate(undefined)}>
            Send payment prompt to my phone
          </Button>
        </div>
      ) : status === "pending" ? (
        <div className="flex flex-col items-center py-6 text-center">
          <Spinner className="size-8 text-brand-600" />
          <p className="mt-4 font-medium">Check your phone</p>
          <p className="mt-1 max-w-xs text-sm text-slate-500">{display ?? "Approve the prompt with your MoMo PIN."} We'll update this screen automatically.</p>
          {simulated && (
            <div className="mt-6 w-full rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200 dark:bg-amber-950/30">
              <p className="mb-2 text-xs font-medium text-amber-800">Payment simulator (dev mode)</p>
              <div className="flex justify-center gap-2">
                <Button size="sm" variant="success" loading={simulate.isPending && simulate.variables === "succeeded"} onClick={() => simulate.mutate("succeeded")}>
                  Approve
                </Button>
                <Button size="sm" variant="danger" loading={simulate.isPending && simulate.variables === "failed"} onClick={() => simulate.mutate("failed")}>
                  Decline
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="relative flex flex-col items-center py-6 text-center">
          {status === "succeeded" && <Confetti />}
          {status === "succeeded" ? (
            <span className="flex size-16 animate-pop items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/30">
              <CheckCircle2 className="size-9" />
            </span>
          ) : (
            <XCircle className="size-12 text-rose-500" />
          )}
          <p className="mt-3 text-lg font-semibold">{status === "succeeded" ? "Payment received" : "Payment failed"}</p>
          <p className="mt-1 text-sm text-slate-500">{status === "succeeded" ? `${money(payment!.amountMinor, currency)} · ref ${payment!.providerRef}` : payment?.failureReason}</p>
          <Button className="mt-6" onClick={onClose}>
            Done
          </Button>
        </div>
      )}
    </Modal>
  );
}

function toMinorOr0(v: string) {
  try {
    return v ? toMinor(v) : 0;
  } catch {
    return 0;
  }
}
