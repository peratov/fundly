import { HeartPulse } from "lucide-react";
import { PortalHeader } from "../../components/portal";
import { useState } from "react";
import { CLAIM_TYPES, type ClaimType } from "../../../../shared/enums";
import { Button, Card, ErrorText, Field, Loading, MoneyInput, PageHeader, ProgressBar, Select, StatusBadge, Textarea } from "../../components/ui";
import { api } from "../../lib/api";
import { formatDate, money, toMinor } from "../../lib/format";
import { useAction } from "../../lib/hooks";
import { useFund } from "../../lib/session";
import { usePortal } from "./Portal";

const LABELS: Record<ClaimType, string> = { medical: "Medical", funeral: "Funeral / bereavement", welfare: "Welfare support", emergency: "Emergency relief" };

export default function PortalWelfare() {
  const { base, currency } = useFund();
  const { data, isLoading } = usePortal();
  const [type, setType] = useState<ClaimType>("medical");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const file = useAction(() => api.post(`${base}/claims`, { type, amountRequestedMinor: toMinor(amount || "0"), description }), {
    success: "Claim submitted — the fund manager has been notified",
    onSuccess: () => (setAmount(""), setDescription("")),
  });
  const changePkg = useAction((welfarePackageId: string) => api.patch(`${base}/me`, { welfarePackageId }), { success: "Welfare package updated" });
  if (isLoading || !data) return <Loading />;
  const pkg = data.welfare.package;
  const m = (v: number) => money(v, currency);

  return (
    <>
      <PortalHeader tone="rose" icon={<HeartPulse />} title="Welfare cover" subtitle="Part of every contribution funds the reserve that looks after members when life happens." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={`${pkg.name} package — cover left this year`}>
            <ul className="space-y-4">
              {CLAIM_TYPES.map((t) => (
                <li key={t}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{LABELS[t]}</span>
                    <span className="num">
                      {m(data.welfare.remaining[t])} <span className="text-slate-400">of {m(pkg.limits[t])}</span>
                    </span>
                  </div>
                  <ProgressBar value={data.welfare.remaining[t]} max={pkg.limits[t]} />
                </li>
              ))}
            </ul>
          </Card>
          <Card title="File a claim">
            {data.member.standing === "voided" ? (
              <p className="text-sm text-rose-600">Welfare cover is suspended while your membership is voided. Please clear missed dues first.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Type">
                    {(id) => (
                      <Select id={id} value={type} onChange={(e) => setType(e.target.value as ClaimType)}>
                        {CLAIM_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {LABELS[t]}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label="Amount needed" hint={`Up to ${m(data.welfare.remaining[type])}`}>
                    {(id) => <MoneyInput id={id} currency={currency} value={amount} onChange={setAmount} />}
                  </Field>
                </div>
                <Field label="What happened?" hint="Include details the manager needs to verify (hospital, dates, receipts).">
                  {(id) => <Textarea id={id} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />}
                </Field>
                <ErrorText error={file.error} />
                <Button loading={file.isPending} disabled={!amount || description.trim().length < 5} onClick={() => file.mutate(undefined)}>
                  Submit claim
                </Button>
              </div>
            )}
          </Card>
          {data.claims.length > 0 && (
            <Card title="My claims">
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.claims.map((c) => (
                  <li key={c.id} className="py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">
                        {LABELS[c.type]} <span className="font-normal text-slate-500">· {c.ref} · {formatDate(c.createdAt)}</span>
                      </span>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="mt-1 text-slate-500">
                      Requested {m(c.amountRequestedMinor)}
                      {c.status === "approved" && ` · approved ${m(c.amountApprovedMinor)}`}
                      {c.decisionNotes && ` · ${c.decisionNotes}`}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <Card title="Change package">
          <p className="mb-3 text-sm text-slate-500">The premium comes out of each monthly contribution before the rest is saved as shares.</p>
          <ul className="space-y-2">
            {data.welfarePackages.map((p) => (
              <li key={p.id} className={`rounded-xl p-3 ring-1 ${p.id === pkg.id ? "bg-brand-50 ring-brand-600 dark:bg-brand-900/30" : "ring-slate-200 dark:ring-slate-700"}`}>
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{p.name}</p>
                  <p className="num text-sm">{m(p.monthlyPremiumMinor)}/mo</p>
                </div>
                <p className="text-xs text-slate-500">{p.description}</p>
                {p.id !== pkg.id && (
                  <Button size="sm" variant="secondary" className="mt-2" loading={changePkg.isPending && changePkg.variables === p.id} onClick={() => changePkg.mutate(p.id)}>
                    Switch to {p.name}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
