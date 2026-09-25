import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Button, ErrorText, Field, Input } from "../../components/ui";
import { api } from "../../lib/api";
import { useSetMe, type Me } from "../../lib/session";
import { AuthLayout } from "./AuthLayout";

const DEMO = [
  { email: "mawuli@dzolali.test", label: "Owner / manager" },
  { email: "abigail@dzolali.test", label: "Credit committee" },
  { email: "senyo@dzolali.test", label: "Audit committee" },
  { email: "edem@dzolali.test", label: "Member" },
];

export default function Login() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const setMe = useSetMe();
  const login = useMutation({
    mutationFn: (body: { email: string; password: string }) => api.post<Me>("/auth/login", body),
    onSuccess: (me) => {
      setMe(me);
      const next = params.get("next");
      navigate(next && next.startsWith("/") && !next.startsWith("//") ? next : "/app", { replace: true });
    },
  });

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Welcome back to your fund."
      footer={
        <>
          New here?{" "}
          <Link to="/signup" className="font-medium text-brand-700">
            Create a fund
          </Link>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate({ email, password });
        }}
      >
        <Field label="Email">{(id) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label="Password">{(id) => <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
        <ErrorText error={login.error} />
        <Button type="submit" loading={login.isPending} className="w-full">
          Sign in
        </Button>
      </form>

      {params.has("demo") && (
        <div className="mt-6 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 dark:bg-slate-800/50 dark:ring-slate-700">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Demo accounts (password: fundly-demo)</p>
          <p className="mt-1 text-xs text-slate-500">Run <code className="font-mono">npm run db:seed</code> first if these don't work.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {DEMO.map((d) => (
              <Button key={d.email} size="sm" variant="secondary" loading={login.isPending && login.variables?.email === d.email} onClick={() => login.mutate({ email: d.email, password: "fundly-demo" })}>
                {d.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
