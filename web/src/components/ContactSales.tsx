import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Send } from "lucide-react";
import { useState } from "react";
import { PLANS, type PaidPlanId } from "../../../shared/plans";
import { api } from "../lib/api";
import { Button, ErrorText, Field, Input, Modal, Select, Textarea } from "./ui";

export interface SalesDefaults {
  plan?: PaidPlanId;
  members?: number;
  name?: string;
  email?: string;
  fundName?: string;
  fundId?: string;
  source: "pricing" | "billing" | "upgrade";
}

/**
 * "Contact sales": paid plans are priced with each fund. The enquiry is saved as a lead
 * for the operator console and emailed to the sales inbox (POST /api/public/sales).
 */
export function ContactSalesModal({ open, onClose, defaults }: { open: boolean; onClose: () => void; defaults: SalesDefaults }) {
  const [form, setForm] = useState({
    name: defaults.name ?? "",
    email: defaults.email ?? "",
    phone: "",
    fundName: defaults.fundName ?? "",
    members: defaults.members ? String(defaults.members) : "",
    plan: defaults.plan ?? ("" as PaidPlanId | ""),
    message: "",
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const send = useMutation({
    mutationFn: () =>
      api.post("/public/sales", {
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
        fundName: form.fundName || undefined,
        members: form.members ? Number(form.members) : undefined,
        plan: form.plan || undefined,
        message: form.message || undefined,
        source: defaults.source,
        fundId: defaults.fundId,
      }),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={send.isSuccess ? "Thanks, we'll be in touch" : "Talk to our team"}
      footer={
        send.isSuccess ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="contact-sales" loading={send.isPending} icon={<Send className="size-4" />}>
              Send to sales
            </Button>
          </>
        )
      }
    >
      {send.isSuccess ? (
        <div className="py-4 text-center">
          <CheckCircle2 className="mx-auto size-12 text-emerald-500" />
          <p className="mt-3 font-display text-xl font-bold">Your message is with our team</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">We'll get back to {form.email} with a plan and price that fit your fund. Meanwhile, everything on Free keeps working.</p>
        </div>
      ) : (
        <form
          id="contact-sales"
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate();
          }}
          className="grid gap-3 sm:grid-cols-2"
        >
          <p className="text-sm text-slate-600 sm:col-span-2 dark:text-slate-400">Tell us a little about your fund and we'll come back with a plan and price that fit. There's no obligation.</p>
          <Field label="Your name">{(id) => <Input id={id} required minLength={2} autoComplete="name" value={form.name} onChange={set("name")} />}</Field>
          <Field label="Email">{(id) => <Input id={id} type="email" required autoComplete="email" value={form.email} onChange={set("email")} />}</Field>
          <Field label="Phone or WhatsApp (optional)">{(id) => <Input id={id} type="tel" autoComplete="tel" placeholder="+233 24 123 4567" value={form.phone} onChange={set("phone")} />}</Field>
          <Field label="Fund or group name">{(id) => <Input id={id} value={form.fundName} onChange={set("fundName")} />}</Field>
          <Field label="How many members?">{(id) => <Input id={id} type="number" inputMode="numeric" min={1} value={form.members} onChange={set("members")} />}</Field>
          <Field label="Interested in">
            {(id) => (
              <Select id={id} value={form.plan} onChange={set("plan")}>
                <option value="">Not sure yet</option>
                <option value="growth">{PLANS.growth.name} (up to 150 members)</option>
                <option value="pro">{PLANS.pro.name} (unlimited)</option>
              </Select>
            )}
          </Field>
          <Field label="Anything we should know? (optional)" className="sm:col-span-2">
            {(id) => <Textarea id={id} rows={3} maxLength={1000} placeholder="How you collect dues today, when you'd like to start…" value={form.message} onChange={set("message")} />}
          </Field>
          <div className="sm:col-span-2">
            <ErrorText error={send.error} />
          </div>
        </form>
      )}
    </Modal>
  );
}
