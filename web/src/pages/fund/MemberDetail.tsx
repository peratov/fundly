import { ArrowLeft, Mail, MessageSquareText, Pencil, Sparkles, UserMinus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { RoleBadges } from "../../components/AppShell";
import { ContributionHistory, EligibilityList, LoanSummary, ScoreCard } from "../../components/finance";
import { Badge, Button, Card, ErrorText, Field, Loading, Modal, PageHeader, Select, Stat, StatusBadge, Textarea } from "../../components/ui";
import { api } from "../../lib/api";
import { formatDate, formatShares, money } from "../../lib/format";
import { useAction, useFundQuery } from "../../lib/hooks";
import { useFund } from "../../lib/session";
import type { Contribution, MemberDetailData } from "../../lib/types";
import { CorrectContributionModal } from "./Contributions";
import { InviteLinkModal, MemberFormModal } from "./MemberForm";

export default function MemberDetail() {
  const { memberId } = useParams();
  const { base, currency, can } = useFund();
  const navigate = useNavigate();
  const { data, isLoading } = useFundQuery<MemberDetailData>(["member", memberId], `/members/${memberId}`);
  const [editing, setEditing] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<Contribution | null>(null);
  const [assessment, setAssessment] = useState<{ summary: string; recommendations: string[]; source: string } | null>(null);
  const [outreachOpen, setOutreachOpen] = useState(false);

  const invite = useAction(() => api.post<{ url: string }>(`${base}/members/${memberId}/invite`), { onSuccess: (r) => setInviteUrl(r.url) });
  const assess = useAction(() => api.post<{ summary: string; recommendations: string[]; source: string }>(`${base}/members/${memberId}/assessment`), { invalidate: [], onSuccess: setAssessment });
  const exit = useAction(() => api.post(`${base}/members/${memberId}/exit`), { success: "Member marked as exited", onSuccess: () => navigate("..", { relative: "path" }) });

  if (isLoading || !data) return <Loading />;
  const { member, totals } = data;
  const m = (v: number) => money(v, currency);

  return (
    <>
      <Link to=".." relative="path" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> Members
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {member.name} <StatusBadge status={member.status === "exited" ? "exited" : member.standing} /> <RoleBadges roles={member.roles} />
          </span>
        }
        subtitle={`${member.memberNo} · ${member.occupation ?? "—"} · joined ${formatDate(member.joinedOn)}`}
        actions={
          can("members:write") && member.status === "active" ? (
            <>
              <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
                Edit
              </Button>
              {!data.hasLogin && member.email && (
                <Button variant="secondary" icon={<Mail className="size-4" />} loading={invite.isPending} onClick={() => invite.mutate(undefined)}>
                  Invite to portal
                </Button>
              )}
              <Button variant="secondary" icon={<MessageSquareText className="size-4" />} onClick={() => setOutreachOpen(true)}>
                Draft message
              </Button>
            </>
          ) : undefined
        }
      />
      <ErrorText error={invite.error ?? exit.error} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Savings" value={m(totals.savingsMinor)} hint={`${totals.paidPeriods} months paid`} />
        <Stat label="Shares" value={formatShares(totals.microShares)} hint={`Worth ${m(totals.shareValueMinor)}`} />
        <Stat label="Loan balance" value={m(totals.loanBalanceMinor)} tone={totals.loanBalanceMinor ? "warn" : undefined} />
        <Stat label="Missed months" value={totals.missedPeriods} tone={totals.missedPeriods ? "bad" : "good"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <ScoreCard score={data.score} />
          <Card
            title="Loan eligibility"
            actions={
              (can("loans:read") || can("members:write")) && (
                <Button size="sm" variant="ghost" icon={<Sparkles className="size-4" />} loading={assess.isPending} onClick={() => assess.mutate(undefined)}>
                  Assess
                </Button>
              )
            }
          >
            <EligibilityList eligibility={data.eligibility} currency={currency} />
            {assessment && (
              <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
                <p className="mb-1 flex items-center gap-2 text-xs font-semibold text-slate-500">
                  Assessment <Badge tone={assessment.source === "ai" ? "violet" : "gray"}>{assessment.source === "ai" ? "AI-written" : "Template"}</Badge>
                </p>
                <p className="text-slate-700 dark:text-slate-300">{assessment.summary}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-400">
                  {assessment.recommendations.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
          <Card title="Contact">
            <dl className="space-y-2 text-sm">
              <Row k="Email" v={member.email ?? "—"} />
              <Row k="Phone" v={member.phone ?? "—"} />
              <Row k="Welfare package" v={data.welfare.package.name} />
              <Row k="Attendance" v={`${member.attendancePct}%`} />
              <Row k="Next of kin" v={member.nextOfKin?.name ? `${member.nextOfKin.name} (${member.nextOfKin.relationship}) ${member.nextOfKin.phone}` : "—"} />
              <Row k="Portal access" v={data.hasLogin ? "Active" : "Not joined"} />
            </dl>
            {can("members:write") && member.status === "active" && !member.roles.includes("owner") && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-4 text-rose-600"
                icon={<UserMinus className="size-4" />}
                loading={exit.isPending}
                onClick={() => confirm(`Mark ${member.name} as exited? Their history is kept for the books.`) && exit.mutate(undefined)}
              >
                Mark as exited
              </Button>
            )}
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card title="Loans">
            {data.loans.length ? (
              <ul className="space-y-5">
                {data.loans.map((l) => (
                  <li key={l.id}>
                    <Link to={`../../loans/${l.id}`} relative="path" className="block rounded-lg p-2 -m-2 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <LoanSummary loan={l} currency={currency} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No loans.</p>
            )}
          </Card>
          {data.claims.length > 0 && (
            <Card title="Welfare claims">
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.claims.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span>
                      <span className="font-medium capitalize">{c.type}</span> <span className="text-slate-500">· {c.ref} · {formatDate(c.createdAt)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="num">{m(c.status === "approved" ? c.amountApprovedMinor : c.amountRequestedMinor)}</span>
                      <StatusBadge status={c.status} />
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card title="Contribution history" padded={false}>
            <ContributionHistory items={data.contributions} currency={currency} onEdit={can("contributions:write") ? setCorrecting : undefined} />
          </Card>
        </div>
      </div>

      {editing && <MemberFormModal open member={member} onClose={() => setEditing(false)} />}
      <InviteLinkModal url={inviteUrl} name={member.name} onClose={() => setInviteUrl(null)} />
      {correcting && <CorrectContributionModal contribution={correcting} onClose={() => setCorrecting(null)} />}
      {outreachOpen && <OutreachModal memberId={member.id} name={member.name} phone={member.phone} email={member.email} onClose={() => setOutreachOpen(false)} />}
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  );
}

function OutreachModal({ memberId, name, phone, email, onClose }: { memberId: string; name: string; phone: string | null; email: string | null; onClose: () => void }) {
  const { base } = useFund();
  const [f, setF] = useState({ purpose: "contribution_reminder", channel: "whatsapp", tone: "friendly", context: "" });
  const [draft, setDraft] = useState<{ subject: string; body: string; source: string } | null>(null);
  const gen = useAction((b: typeof f) => api.post<{ subject: string; body: string; source: string }>(`${base}/members/${memberId}/outreach`, { ...b, context: b.context || undefined }), { invalidate: [], onSuccess: setDraft });
  const digits = phone?.replace(/\D/g, "");
  return (
    <Modal open onClose={onClose} title={`Message ${name}`} wide>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Purpose">
          {(id) => (
            <Select id={id} value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })}>
              <option value="contribution_reminder">Contribution reminder</option>
              <option value="loan_reminder">Loan repayment reminder</option>
              <option value="attendance">Missed meeting</option>
              <option value="welfare_benefits">Welfare benefits</option>
              <option value="greeting">General greeting</option>
            </Select>
          )}
        </Field>
        <Field label="Channel">
          {(id) => (
            <Select id={id} value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}>
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
            </Select>
          )}
        </Field>
        <Field label="Tone">
          {(id) => (
            <Select id={id} value={f.tone} onChange={(e) => setF({ ...f, tone: e.target.value })}>
              <option value="friendly">Friendly</option>
              <option value="professional">Professional</option>
              <option value="urgent">Urgent</option>
            </Select>
          )}
        </Field>
      </div>
      <Field label="Anything to add? (optional)" className="mt-3">
        {(id) => <Textarea id={id} value={f.context} onChange={(e) => setF({ ...f, context: e.target.value })} placeholder="e.g. AGM is on 14 June at the school canteen" />}
      </Field>
      <Button className="mt-3" icon={<Sparkles className="size-4" />} loading={gen.isPending} onClick={() => gen.mutate(f)}>
        Draft message
      </Button>
      <ErrorText error={gen.error} />
      {draft && (
        <div className="mt-4 space-y-2">
          {draft.subject && <p className="text-sm font-semibold">Subject: {draft.subject}</p>}
          <Textarea rows={10} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => navigator.clipboard?.writeText(draft.body)}>
              Copy
            </Button>
            {f.channel === "whatsapp" && digits && (
              <a href={`https://wa.me/${digits}?text=${encodeURIComponent(draft.body)}`} target="_blank" rel="noreferrer">
                <Button size="sm" variant="success">
                  Open in WhatsApp
                </Button>
              </a>
            )}
            {f.channel === "email" && email && (
              <a href={`mailto:${email}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`}>
                <Button size="sm">Open in email</Button>
              </a>
            )}
          </div>
          <p className="text-xs text-slate-500">{draft.source === "ai" ? "Written by AI from the member's actual figures — review before sending." : "Template draft — edit as needed before sending."}</p>
        </div>
      )}
    </Modal>
  );
}
