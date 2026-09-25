import { UserRound } from "lucide-react";
import { PortalHeader } from "../../components/portal";
import { useEffect, useState } from "react";
import { Button, Card, ErrorText, Field, Input, Loading, PageHeader } from "../../components/ui";
import { api } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { useAction } from "../../lib/hooks";
import { useFund } from "../../lib/session";
import { usePortal } from "./Portal";

export default function PortalProfile() {
  const { base, me } = useFund();
  const { data, isLoading } = usePortal();
  const [f, setF] = useState({ phone: "", occupation: "", kinName: "", kinPhone: "", kinRel: "" });
  useEffect(() => {
    if (data) {
      const m = data.member;
      setF({ phone: m.phone ?? "", occupation: m.occupation ?? "", kinName: m.nextOfKin?.name ?? "", kinPhone: m.nextOfKin?.phone ?? "", kinRel: m.nextOfKin?.relationship ?? "" });
    }
  }, [data]);
  const save = useAction(() => api.patch(`${base}/me`, { phone: f.phone, occupation: f.occupation, nextOfKin: { name: f.kinName, phone: f.kinPhone, relationship: f.kinRel } }), { success: "Profile saved" });
  if (isLoading || !data) return <Loading />;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <PortalHeader tone="teal" icon={<UserRound />} title="My profile" subtitle={`${data.member.memberNo} · member since ${formatDate(data.member.joinedOn)}`} />
      <div className="grid max-w-3xl gap-6">
        <Card title="Contact details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" hint="Ask the fund manager to change your name">{(id) => <Input id={id} value={data.member.name} disabled />}</Field>
            <Field label="Login email">{(id) => <Input id={id} value={me?.user.email ?? ""} disabled />}</Field>
            <Field label="Mobile money number">{(id) => <Input id={id} value={f.phone} onChange={set("phone")} />}</Field>
            <Field label="Occupation">{(id) => <Input id={id} value={f.occupation} onChange={set("occupation")} />}</Field>
          </div>
        </Card>
        <Card title="Next of kin">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Name">{(id) => <Input id={id} value={f.kinName} onChange={set("kinName")} />}</Field>
            <Field label="Phone">{(id) => <Input id={id} value={f.kinPhone} onChange={set("kinPhone")} />}</Field>
            <Field label="Relationship">{(id) => <Input id={id} value={f.kinRel} onChange={set("kinRel")} />}</Field>
          </div>
        </Card>
        <div className="flex items-center gap-3">
          <Button loading={save.isPending} onClick={() => save.mutate(undefined)}>
            Save profile
          </Button>
          <ErrorText error={save.error} />
        </div>
      </div>
    </>
  );
}
