import { useState } from "react";
import { ROLE_LABELS, ROLES, type Role } from "../../../../shared/enums";
import { Button, ErrorText, Field, fieldError, Input, Modal, Select } from "../../components/ui";
import { api } from "../../lib/api";
import { useAction, useFundInfo } from "../../lib/hooks";
import { todayIso } from "../../lib/format";
import { useFund } from "../../lib/session";
import type { Member } from "../../lib/types";

/** Create or edit a member. Role assignment is only shown to people allowed to change roles. */
export function MemberFormModal({ open, onClose, member, onCreated }: { open: boolean; onClose: () => void; member?: Member; onCreated?: (r: { member: Member; invite: { url: string } | null }) => void }) {
  const { base, can } = useFund();
  const { data: info } = useFundInfo();
  const [f, setF] = useState(() => ({
    name: member?.name ?? "",
    email: member?.email ?? "",
    phone: member?.phone ?? "",
    occupation: member?.occupation ?? "",
    memberNo: "",
    joinedOn: member?.joinedOn ?? todayIso(),
    welfarePackageId: member?.welfarePackageId ?? info?.settings.defaultWelfarePackageId ?? "",
    attendancePct: String(member?.attendancePct ?? 100),
    roles: (member?.roles ?? ["member"]) as Role[],
    kinName: member?.nextOfKin?.name ?? "",
    kinPhone: member?.nextOfKin?.phone ?? "",
    kinRel: member?.nextOfKin?.relationship ?? "",
    sendInvite: true,
  }));
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const save = useAction<void, unknown>(
    () => {
      const body = {
        name: f.name,
        email: f.email || undefined,
        phone: f.phone || undefined,
        occupation: f.occupation || undefined,
        joinedOn: f.joinedOn,
        welfarePackageId: f.welfarePackageId || undefined,
        attendancePct: Number(f.attendancePct),
        nextOfKin: { name: f.kinName, phone: f.kinPhone, relationship: f.kinRel },
        ...(can("roles:write") ? { roles: f.roles } : {}),
      };
      return member
        ? api.patch<unknown>(`${base}/members/${member.id}`, body)
        : api.post<unknown>(`${base}/members`, { ...body, memberNo: f.memberNo || undefined, sendInvite: f.sendInvite && !!f.email });
    },
    {
      success: member ? "Member updated" : "Member registered",
      onSuccess: (out) => {
        if (!member) onCreated?.(out as { member: Member; invite: { url: string } | null });
        onClose();
      },
    },
  );
  const err = save.error;

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={member ? `Edit ${member.name}` : "Register a member"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate(undefined)} disabled={!f.name || !f.joinedOn}>
            {member ? "Save changes" : "Register member"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" error={fieldError(err, "name")}>{(id) => <Input id={id} value={f.name} onChange={(e) => set("name", e.target.value)} />}</Field>
        <Field label="Email" hint="Needed to invite them to the member portal" error={fieldError(err, "email")}>{(id) => <Input id={id} type="email" value={f.email} onChange={(e) => set("email", e.target.value)} />}</Field>
        <Field label="Phone (MoMo)" error={fieldError(err, "phone")}>{(id) => <Input id={id} value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+233 24 000 0000" />}</Field>
        <Field label="Occupation">{(id) => <Input id={id} value={f.occupation} onChange={(e) => set("occupation", e.target.value)} />}</Field>
        <Field label="Joined on">{(id) => <Input id={id} type="date" value={f.joinedOn} onChange={(e) => set("joinedOn", e.target.value)} />}</Field>
        {!member && <Field label="Member number" hint="Leave blank to auto-number">{(id) => <Input id={id} value={f.memberNo} onChange={(e) => set("memberNo", e.target.value)} />}</Field>}
        <Field label="Welfare package">
          {(id) => (
            <Select id={id} value={f.welfarePackageId} onChange={(e) => set("welfarePackageId", e.target.value)}>
              {info?.settings.welfarePackages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Meeting attendance %" hint="Counts toward the credit score">{(id) => <Input id={id} type="number" min={0} max={100} value={f.attendancePct} onChange={(e) => set("attendancePct", e.target.value)} />}</Field>
      </div>

      <p className="mt-6 mb-3 text-sm font-semibold">Next of kin</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name">{(id) => <Input id={id} value={f.kinName} onChange={(e) => set("kinName", e.target.value)} />}</Field>
        <Field label="Phone">{(id) => <Input id={id} value={f.kinPhone} onChange={(e) => set("kinPhone", e.target.value)} />}</Field>
        <Field label="Relationship">{(id) => <Input id={id} value={f.kinRel} onChange={(e) => set("kinRel", e.target.value)} />}</Field>
      </div>

      {can("roles:write") && (
        <>
          <p className="mt-6 mb-2 text-sm font-semibold">Roles</p>
          <div className="flex flex-wrap gap-3">
            {ROLES.filter((r) => r !== "member").map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 rounded accent-brand-700" checked={f.roles.includes(r)} onChange={(e) => set("roles", e.target.checked ? [...f.roles, r] : f.roles.filter((x) => x !== r))} />
                {ROLE_LABELS[r]}
              </label>
            ))}
          </div>
        </>
      )}

      {!member && f.email && (
        <label className="mt-6 flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 rounded accent-brand-700" checked={f.sendInvite} onChange={(e) => set("sendInvite", e.target.checked)} />
          Create a portal invitation link for this member
        </label>
      )}
      <div className="mt-4">
        <ErrorText error={err} />
      </div>
    </Modal>
  );
}

export function InviteLinkModal({ url, name, onClose }: { url: string | null; name?: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal open={!!url} onClose={onClose} title="Invitation link" footer={<Button onClick={onClose}>Done</Button>}>
      <p className="text-sm text-slate-600 dark:text-slate-400">Send this link to {name ?? "the member"} by WhatsApp, SMS or email. It works once and expires in 14 days.</p>
      <div className="mt-4 flex gap-2">
        <Input readOnly value={url ?? ""} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
        <Button
          variant="secondary"
          onClick={() => {
            navigator.clipboard?.writeText(url ?? "");
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      {url && (
        <a className="mt-3 inline-block text-sm font-medium text-emerald-700" href={`https://wa.me/?text=${encodeURIComponent(`You're invited to join our fund on Fundly: ${url}`)}`} target="_blank" rel="noreferrer">
          Share on WhatsApp →
        </a>
      )}
    </Modal>
  );
}
