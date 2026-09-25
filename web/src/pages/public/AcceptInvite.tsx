import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Button, ErrorText, Field, Input, Loading } from "../../components/ui";
import { api } from "../../lib/api";
import { useSetMe, type Me } from "../../lib/session";
import { AuthLayout } from "./AuthLayout";

export default function AcceptInvite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const setMe = useSetMe();
  const [password, setPassword] = useState("");
  const invite = useQuery({
    queryKey: ["invite", token],
    queryFn: () => api.get<{ fundName: string; memberName: string; email: string; existingAccount: boolean }>(`/auth/invites/${token}`),
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () => api.post<Me & { joinedTenantId: string }>("/auth/invites/accept", { token, password }),
    onSuccess: (res) => {
      setMe(res);
      navigate(`/f/${res.joinedTenantId}`, { replace: true });
    },
  });

  if (invite.isLoading) return <Loading />;
  if (invite.error || !invite.data)
    return (
      <AuthLayout title="Invitation not found">
        <ErrorText error={invite.error} />
      </AuthLayout>
    );

  const d = invite.data;
  return (
    <AuthLayout title={`Join ${d.fundName}`} subtitle={`Hi ${d.memberName.split(" ")[0]} — ${d.existingAccount ? "sign in with your existing Fundly password to link this fund." : "choose a password to activate your member account."}`}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          accept.mutate();
        }}
      >
        <Field label="Email">{(id) => <Input id={id} value={d.email} disabled />}</Field>
        <Field label={d.existingAccount ? "Your password" : "Choose a password"} hint={d.existingAccount ? undefined : "At least 8 characters"}>
          {(id) => <Input id={id} type="password" required minLength={8} autoComplete={d.existingAccount ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <ErrorText error={accept.error} />
        <Button type="submit" loading={accept.isPending} className="w-full">
          Join fund
        </Button>
      </form>
    </AuthLayout>
  );
}
