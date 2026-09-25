import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { CLAIM_TYPES } from "../../../../shared/enums";
import { periodOf } from "../../../../shared/period";
import type { FundSettings } from "../../../../shared/settings";
import { Button, Card, ErrorText, Field, Input, Loading, MoneyInput, PageHeader, Select, Table, Td, Th, Tr } from "../../components/ui";
import { api } from "../../lib/api";
import { formatPeriod, money, toMinor } from "../../lib/format";
import { useAction, useFundInfo } from "../../lib/hooks";
import { useFund } from "../../lib/session";

/** Money input bound to a minor-unit number, keeping the raw text while typing. */
function Minor({ value, onChange, currency, id }: { value: number; onChange: (v: number) => void; currency: string; id?: string }) {
  const [text, setText] = useState(String(value / 100));
  useEffect(() => {
    if (toMinorSafe(text) !== value) setText(String(value / 100));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <MoneyInput
      id={id}
      currency={currency}
      value={text}
      onChange={(t) => {
        setText(t);
        const v = toMinorSafe(t);
        if (v !== null) onChange(v);
      }}
    />
  );
}
function toMinorSafe(t: string) {
  try {
    return t === "" ? 0 : toMinor(t);
  } catch {
    return null;
  }
}

export default function Settings() {
  const { base, currency, tenantId } = useFund();
  const { data: info, isLoading } = useFundInfo();
  const [s, setS] = useState<FundSettings | null>(null);
  const [profile, setProfile] = useState({ name: "", shortName: "" });
  const [price, setPrice] = useState({ effectivePeriod: periodOf(new Date()), price: "" });

  useEffect(() => {
    if (info) {
      setS(structuredClone(info.settings));
      setProfile({ name: info.name, shortName: info.shortName ?? "" });
    }
  }, [info]);

  const invalidate = [["fund", tenantId], [tenantId]];
  const saveSettings = useAction(() => api.put(`${base}/settings`, s), { success: "Settings saved", invalidate });
  const saveProfile = useAction(() => api.put(`${base}/profile`, { name: profile.name, shortName: profile.shortName || undefined }), { success: "Fund details saved", invalidate: [...invalidate, ["me"]] });
  const addPrice = useAction(() => api.post(`${base}/share-prices`, { effectivePeriod: price.effectivePeriod, priceMinor: toMinor(price.price || "0") }), { success: "Share price saved", invalidate });

  if (isLoading || !info || !s) return <Loading />;
  const set = (fn: (d: FundSettings) => void) => setS((prev) => {
    const next = structuredClone(prev!);
    fn(next);
    return next;
  });

  return (
    <>
      <PageHeader title="Fund settings" subtitle="The rules the fund runs on. Every change is recorded in the audit log." />
      <div className="space-y-6">
        <Card title="Fund details">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Name">{(id) => <Input id={id} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />}</Field>
            <Field label="Short name">{(id) => <Input id={id} value={profile.shortName} onChange={(e) => setProfile({ ...profile, shortName: e.target.value })} />}</Field>
            <Field label="Currency" hint="Fixed once the fund has transactions">{(id) => <Input id={id} value={info.currency} disabled />}</Field>
          </div>
          <Button className="mt-4" loading={saveProfile.isPending} onClick={() => saveProfile.mutate(undefined)}>
            Save details
          </Button>
          <div className="mt-3">
            <ErrorText error={saveProfile.error} />
          </div>
        </Card>

        <Card title="Share price">
          <p className="mb-3 text-sm text-slate-500">Contributions buy shares at the price in force for their month. Adding a new price never changes shares already issued.</p>
          <ul className="mb-4 flex flex-wrap gap-2 text-sm">
            {info.sharePrices.map((p) => (
              <li key={p.effectivePeriod} className="rounded-lg bg-slate-100 px-3 py-1.5 dark:bg-slate-800">
                From {formatPeriod(p.effectivePeriod)}: <b className="num">{money(p.priceMinor, currency)}</b>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Effective from">{(id) => <Input id={id} type="month" value={price.effectivePeriod} onChange={(e) => setPrice({ ...price, effectivePeriod: e.target.value })} />}</Field>
            <Field label="Price per share">{(id) => <MoneyInput id={id} currency={currency} value={price.price} onChange={(v) => setPrice({ ...price, price: v })} />}</Field>
            <Button variant="secondary" disabled={!price.price} loading={addPrice.isPending} onClick={() => addPrice.mutate(undefined)}>
              Set price
            </Button>
          </div>
          <div className="mt-3">
            <ErrorText error={addPrice.error} />
          </div>
        </Card>

        <Card title="Contributions & standing">
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Minimum monthly dues">{(id) => <Minor id={id} currency={currency} value={s.minContributionMinor} onChange={(v) => set((d) => void (d.minContributionMinor = v))} />}</Field>
            <Field label="Due by day of month" hint="Paid after this = late">
              {(id) => <Input id={id} type="number" min={1} max={28} value={s.contributionDueDay} onChange={(e) => set((d) => void (d.contributionDueDay = Number(e.target.value)))} />}
            </Field>
            <Field label="Behind after missed months">
              {(id) => <Input id={id} type="number" min={1} value={s.standing.behindAfterMissed} onChange={(e) => set((d) => void (d.standing.behindAfterMissed = Number(e.target.value)))} />}
            </Field>
            <Field label="Voided after missed months">
              {(id) => <Input id={id} type="number" min={2} value={s.standing.voidAfterMissed} onChange={(e) => set((d) => void (d.standing.voidAfterMissed = Number(e.target.value)))} />}
            </Field>
          </div>
        </Card>

        <Card title="Lending policy">
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Minimum credit score">{(id) => <Input id={id} type="number" min={0} max={1000} value={s.loanPolicy.minCreditScore} onChange={(e) => set((d) => void (d.loanPolicy.minCreditScore = Number(e.target.value)))} />}</Field>
            <Field label="Minimum membership (months)">{(id) => <Input id={id} type="number" min={0} value={s.loanPolicy.minTenureMonths} onChange={(e) => set((d) => void (d.loanPolicy.minTenureMonths = Number(e.target.value)))} />}</Field>
            <Field label="Limit = savings ×" hint="Scaled by credit score">
              {(id) => <Input id={id} type="number" step="0.5" min={0} value={s.loanPolicy.savingsMultiplier} onChange={(e) => set((d) => void (d.loanPolicy.savingsMultiplier = Number(e.target.value)))} />}
            </Field>
            <Field label="Committee reviews needed">{(id) => <Input id={id} type="number" min={1} value={s.loanPolicy.committeeQuorum} onChange={(e) => set((d) => void (d.loanPolicy.committeeQuorum = Number(e.target.value)))} />}</Field>
            <Field label="Lowest limit">{(id) => <Minor id={id} currency={currency} value={s.loanPolicy.minLimitMinor} onChange={(v) => set((d) => void (d.loanPolicy.minLimitMinor = v))} />}</Field>
            <Field label="Highest limit">{(id) => <Minor id={id} currency={currency} value={s.loanPolicy.maxLimitMinor} onChange={(v) => set((d) => void (d.loanPolicy.maxLimitMinor = v))} />}</Field>
            <Field label="Open loans per member">{(id) => <Input id={id} type="number" min={1} max={5} value={s.loanPolicy.maxOpenLoans} onChange={(e) => set((d) => void (d.loanPolicy.maxOpenLoans = Number(e.target.value)))} />}</Field>
          </div>
        </Card>

        <Card
          title="Loan products"
          padded={false}
          actions={
            <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => set((d) => void d.loanProducts.push({ code: `product-${d.loanProducts.length + 1}`, name: "New product", rateBps: 1000, maxTermMonths: 6, maxAmountMinor: 100_000, description: "", active: true }))}>
              Add product
            </Button>
          }
        >
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Code</Th>
                <Th>Rate % p.a.</Th>
                <Th>Max months</Th>
                <Th>Max amount</Th>
                <Th>Active</Th>
              </tr>
            </thead>
            <tbody>
              {s.loanProducts.map((p, i) => (
                <Tr key={i}>
                  <Td>
                    <Input value={p.name} onChange={(e) => set((d) => void (d.loanProducts[i].name = e.target.value))} aria-label="Name" />
                  </Td>
                  <Td>
                    <Input className="w-28 font-mono" value={p.code} onChange={(e) => set((d) => void (d.loanProducts[i].code = e.target.value.toLowerCase()))} aria-label="Code" />
                  </Td>
                  <Td>
                    <Input className="w-20" type="number" step="0.5" value={p.rateBps / 100} onChange={(e) => set((d) => void (d.loanProducts[i].rateBps = Math.round(Number(e.target.value) * 100)))} aria-label="Rate" />
                  </Td>
                  <Td>
                    <Input className="w-20" type="number" value={p.maxTermMonths} onChange={(e) => set((d) => void (d.loanProducts[i].maxTermMonths = Number(e.target.value)))} aria-label="Max months" />
                  </Td>
                  <Td>
                    <div className="w-36">
                      <Minor currency={currency} value={p.maxAmountMinor} onChange={(v) => set((d) => void (d.loanProducts[i].maxAmountMinor = v))} />
                    </div>
                  </Td>
                  <Td>
                    <input type="checkbox" className="size-4 accent-brand-700" checked={p.active} onChange={(e) => set((d) => void (d.loanProducts[i].active = e.target.checked))} aria-label="Active" />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card
          title="Welfare packages"
          padded={false}
          actions={
            <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => set((d) => void d.welfarePackages.push({ id: `pkg-${d.welfarePackages.length + 1}`, name: "New package", monthlyPremiumMinor: 200, description: "", limits: { medical: 0, funeral: 0, welfare: 0, emergency: 0 } }))}>
              Add package
            </Button>
          }
        >
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Premium / month</Th>
                {CLAIM_TYPES.map((t) => (
                  <Th key={t} className="capitalize">
                    {t} limit
                  </Th>
                ))}
                <Th />
              </tr>
            </thead>
            <tbody>
              {s.welfarePackages.map((p, i) => (
                <Tr key={i}>
                  <Td>
                    <Input className="w-32" value={p.name} onChange={(e) => set((d) => void (d.welfarePackages[i].name = e.target.value))} aria-label="Package name" />
                  </Td>
                  <Td>
                    <div className="w-32">
                      <Minor currency={currency} value={p.monthlyPremiumMinor} onChange={(v) => set((d) => void (d.welfarePackages[i].monthlyPremiumMinor = v))} />
                    </div>
                  </Td>
                  {CLAIM_TYPES.map((t) => (
                    <Td key={t}>
                      <div className="w-36">
                        <Minor currency={currency} value={p.limits[t]} onChange={(v) => set((d) => void (d.welfarePackages[i].limits[t] = v))} />
                      </div>
                    </Td>
                  ))}
                  <Td>
                    {s.welfarePackages.length > 1 && (
                      <button className="text-slate-400 hover:text-rose-600" aria-label="Remove package" onClick={() => set((d) => void d.welfarePackages.splice(i, 1))}>
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <div className="border-t border-slate-100 p-4 dark:border-slate-800">
            <Field label="Default package for new members" className="max-w-xs">
              {(id) => (
                <Select id={id} value={s.defaultWelfarePackageId} onChange={(e) => set((d) => void (d.defaultWelfarePackageId = e.target.value))}>
                  {s.welfarePackages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </Card>

        <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] flex flex-wrap items-center justify-end gap-3 rounded-xl lg:bottom-4 bg-white/90 p-3 shadow-lg ring-1 ring-slate-200 backdrop-blur dark:bg-slate-900/90 dark:ring-slate-700">
          <div className="flex-1">
            <ErrorText error={saveSettings.error} />
          </div>
          <Button variant="secondary" onClick={() => setS(structuredClone(info.settings))}>
            Discard changes
          </Button>
          <Button loading={saveSettings.isPending} onClick={() => saveSettings.mutate(undefined)}>
            Save rules
          </Button>
        </div>
      </div>
    </>
  );
}
