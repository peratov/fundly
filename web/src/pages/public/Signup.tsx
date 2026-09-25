import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { SUPPORTED_CURRENCIES } from "../../../../shared/enums";
import { Button, ErrorText, Field, fieldError, Input, MoneyInput, Select } from "../../components/ui";
import { api } from "../../lib/api";
import { toMinor } from "../../lib/format";
import { useMe, useSetMe, type Me } from "../../lib/session";
import { AuthLayout } from "./AuthLayout";

export default function Signup() {
  const { data: me } = useMe();
  const loggedIn = !!me;
  const navigate = useNavigate();
  const setMe = useSetMe();
  // Values can arrive from the landing-page simulator and final call to action.
  const [params] = useSearchParams();
  const qCurrency = params.get("currency");
  const [f, setF] = useState({
    name: "",
    email: params.get("email") ?? "",
    password: "",
    fundName: params.get("fund") ?? "",
    shortName: "",
    currency: qCurrency && (SUPPORTED_CURRENCIES as readonly string[]).includes(qCurrency) ? qCurrency : "GHS",
    minContribution: params.get("dues") ?? "30",
    sharePrice: "24",
  });
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = useMutation({
    mutationFn: () => {
      const fund = { name: f.fundName, shortName: f.shortName || undefined, currency: f.currency, minContributionMinor: toMinor(f.minContribution || "0"), sharePriceMinor: toMinor(f.sharePrice || "0") };
      return loggedIn
        ? api.post<Me & { createdTenantId: string }>("/auth/funds", fund)
        : api.post<Me & { createdTenantId: string }>("/auth/signup", { name: f.name, email: f.email, password: f.password, fund });
    },
    onSuccess: (res) => {
      setMe(res);
      navigate(`/f/${res.createdTenantId}/overview`, { replace: true });
    },
  });
  const err = submit.error;

  return (
    <AuthLayout
      title={loggedIn ? "Start another fund" : "Create your fund"}
      subtitle="14-day free trial. You'll be the owner and can invite your executives and members next."
      footer={
        !loggedIn && (
          <>
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-brand-700">
              Sign in
            </Link>
          </>
        )
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        {!loggedIn && (
          <>
            <Field label="Your name" error={fieldError(err, "name")}>{(id) => <Input id={id} required autoComplete="name" value={f.name} onChange={(e) => set("name")(e.target.value)} />}</Field>
            <Field label="Email" error={fieldError(err, "email")}>{(id) => <Input id={id} type="email" required autoComplete="email" value={f.email} onChange={(e) => set("email")(e.target.value)} />}</Field>
            <Field label="Password" hint="At least 8 characters" error={fieldError(err, "password")}>
              {(id) => <Input id={id} type="password" required minLength={8} autoComplete="new-password" value={f.password} onChange={(e) => set("password")(e.target.value)} />}
            </Field>
            <hr className="border-slate-100 dark:border-slate-800" />
          </>
        )}
        <Field label="Fund name" hint="e.g. KETASCO Class of 2009 Welfare Fund" error={fieldError(err, "fund.name") ?? fieldError(err, "name")}>
          {(id) => <Input id={id} required value={f.fundName} onChange={(e) => set("fundName")(e.target.value)} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Short name" hint="Optional">{(id) => <Input id={id} value={f.shortName} maxLength={40} onChange={(e) => set("shortName")(e.target.value)} />}</Field>
          <Field label="Currency">
            {(id) => (
              <Select id={id} value={f.currency} onChange={(e) => set("currency")(e.target.value)}>
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Monthly minimum dues">{(id) => <MoneyInput id={id} currency={f.currency} required value={f.minContribution} onChange={set("minContribution")} />}</Field>
          <Field label="Share price">{(id) => <MoneyInput id={id} currency={f.currency} required value={f.sharePrice} onChange={set("sharePrice")} />}</Field>
        </div>
        <ErrorText error={err} />
        <Button type="submit" loading={submit.isPending} className="w-full">
          {loggedIn ? "Create fund" : "Create fund & account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
