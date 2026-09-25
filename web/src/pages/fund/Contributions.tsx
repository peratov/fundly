import { CalendarCheck, ChevronLeft, ChevronRight, Download, Plus } from "lucide-react";
import { useState } from "react";
import { addMonths, periodOf } from "../../../../shared/period";
import { CONTRIBUTION_STATUSES } from "../../../../shared/enums";
import { MemberPicker } from "../../components/MemberPicker";
import { Button, Card, clsx, ErrorText, Field, Input, Loading, Modal, MoneyInput, PageHeader, Pagination, SearchInput, Select, StatusBadge, Table, Tabs, Td, Th, Tr, useDebounced } from "../../components/ui";
import { api, qs, type Paged } from "../../lib/api";
import { formatDate, formatPeriod, money, todayIso, toMinor } from "../../lib/format";
import { useAction, useFundInfo, useFundQuery } from "../../lib/hooks";
import { useFund } from "../../lib/session";
import type { Contribution } from "../../lib/types";

interface Grid extends Paged<{ id: string; name: string; memberNo: string; standing: string; joinedOn: string }> {
  periods: string[];
  cells: { id: string; membershipId: string; period: string; amountMinor: number; status: string }[];
}

export default function Contributions() {
  const { can, base } = useFund();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [recording, setRecording] = useState<{ member?: { id: string; name: string }; period?: string } | null>(null);
  const [closing, setClosing] = useState(false);

  return (
    <>
      <PageHeader
        title="Contributions"
        subtitle="Monthly dues by member. Each payment buys shares and funds the welfare reserve."
        actions={
          <>
            {can("reports:read") && (
              <a href={`/api${base}/export/contributions.csv`}>
                <Button variant="secondary" icon={<Download className="size-4" />}>
                  Export
                </Button>
              </a>
            )}
            {can("contributions:write") && (
              <>
                <Button variant="secondary" icon={<CalendarCheck className="size-4" />} onClick={() => setClosing(true)}>
                  Close a month
                </Button>
                <Button icon={<Plus className="size-4" />} onClick={() => setRecording({})}>
                  Record payment
                </Button>
              </>
            )}
          </>
        }
      />
      <div className="mb-4">
        <Tabs value={view} onChange={setView} tabs={[{ value: "grid", label: "Register" }, { value: "list", label: "All entries" }]} />
      </div>
      {view === "grid" ? <GridView onRecord={can("contributions:write") ? setRecording : undefined} /> : <ListView />}
      {recording && <RecordModal initial={recording} onClose={() => setRecording(null)} />}
      {closing && <ClosePeriodModal onClose={() => setClosing(false)} />}
    </>
  );
}

function GridView({ onRecord }: { onRecord?: (r: { member: { id: string; name: string }; period: string }) => void }) {
  const { currency } = useFund();
  const [to, setTo] = useState(periodOf(new Date()));
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, isLoading } = useFundQuery<Grid>(["grid", to, dq, page], `/contributions/grid${qs({ to, months: 6, q: dq, page, pageSize: 30 })}`);
  const cells = new Map(data?.cells.map((c) => [`${c.membershipId}:${c.period}`, c]));

  return (
    <Card padded={false}>
      <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
        <SearchInput value={q} onChange={(v) => (setQ(v), setPage(1))} placeholder="Filter members" />
        <div className="flex items-center gap-1">
          <Button size="sm" variant="secondary" onClick={() => setTo(addMonths(to, -6))} aria-label="Earlier" icon={<ChevronLeft className="size-4" />} />
          <span className="px-2 text-sm font-medium">
            {data ? `${formatPeriod(data.periods[0])} – ${formatPeriod(to)}` : "…"}
          </span>
          <Button size="sm" variant="secondary" onClick={() => setTo(addMonths(to, 6))} aria-label="Later" icon={<ChevronRight className="size-4" />} />
        </div>
      </div>
      {isLoading || !data ? (
        <Loading />
      ) : (
        <>
          <Table stack={false}>
            <thead>
              <tr>
                <Th className="sticky left-0 bg-white dark:bg-slate-900">Member</Th>
                {data.periods.map((p) => (
                  <Th key={p} right>
                    {formatPeriod(p)}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((m) => (
                <Tr key={m.id}>
                  <Td className="sticky left-0 bg-white dark:bg-slate-900">
                    <p className="font-medium text-slate-900 dark:text-white">{m.name}</p>
                    <p className="text-xs text-slate-500">{m.memberNo}</p>
                  </Td>
                  {data.periods.map((p) => {
                    const c = cells.get(`${m.id}:${p}`);
                    const beforeJoin = p < m.joinedOn.slice(0, 7);
                    const canPay = !beforeJoin && (!c || c.status === "missed") && onRecord;
                    return (
                      <Td key={p} right>
                        {beforeJoin ? (
                          <span className="text-slate-300">·</span>
                        ) : c && c.status !== "missed" ? (
                          <span className={clsx("num font-medium", c.status === "late" ? "text-amber-700" : "text-emerald-700 dark:text-emerald-400")} title={c.status}>
                            {money(c.amountMinor, currency).replace(`${currency} `, "")}
                          </span>
                        ) : canPay ? (
                          <button onClick={() => onRecord!({ member: { id: m.id, name: m.name }, period: p })} className={clsx("min-h-9 min-w-14 rounded-lg px-2.5 py-1.5 text-xs font-semibold", c ? "bg-rose-50 text-rose-700 hover:bg-rose-100" : "bg-slate-50 text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100 hover:text-slate-800 dark:bg-slate-800 dark:ring-slate-700")}>
                            {c ? "Missed" : "+ Pay"}
                          </button>
                        ) : c ? (
                          <StatusBadge status="missed" />
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </Td>
                    );
                  })}
                </Tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        </>
      )}
    </Card>
  );
}

function ListView() {
  const { currency, can } = useFund();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [period, setPeriod] = useState("");
  const [page, setPage] = useState(1);
  const [correcting, setCorrecting] = useState<Contribution | null>(null);
  const dq = useDebounced(q);
  const { data, isLoading } = useFundQuery<Paged<Contribution>>(["contributions", dq, status, period, page], `/contributions${qs({ q: dq, status, period, page, pageSize: 50 })}`);
  return (
    <Card padded={false}>
      <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row dark:border-slate-800">
        <SearchInput value={q} onChange={(v) => (setQ(v), setPage(1))} placeholder="Member name" />
        <Input type="month" value={period} onChange={(e) => (setPeriod(e.target.value), setPage(1))} className="sm:w-44" aria-label="Month" />
        <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} className="sm:w-40" aria-label="Status">
          <option value="">All statuses</option>
          {CONTRIBUTION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </Select>
      </div>
      {isLoading || !data ? (
        <Loading />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Member</Th>
                <Th>Month</Th>
                <Th>Status</Th>
                <Th right>Amount</Th>
                <Th right>Welfare</Th>
                <Th>Paid on</Th>
                <Th>Method</Th>
                {can("contributions:write") && <Th />}
              </tr>
            </thead>
            <tbody>
              {data.items.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <p className="font-medium">{c.memberName}</p>
                    <p className="text-xs text-slate-500">{c.memberNo}</p>
                  </Td>
                  <Td>{formatPeriod(c.period)}</Td>
                  <Td>
                    <StatusBadge status={c.status} />
                  </Td>
                  <Td right>{money(c.amountMinor, currency)}</Td>
                  <Td right>{money(c.premiumMinor, currency)}</Td>
                  <Td>{formatDate(c.paidOn)}</Td>
                  <Td className="capitalize">{c.method ?? "—"}</Td>
                  {can("contributions:write") && (
                    <Td>
                      <button type="button" className="inline-flex min-h-9 items-center rounded-md px-2 text-xs font-medium text-brand-700 hover:bg-brand-50 sm:min-h-0 sm:px-0 sm:hover:bg-transparent sm:hover:underline dark:hover:bg-white/5" onClick={() => setCorrecting(c)}>
                        Correct
                      </button>
                    </Td>
                  )}
                </Tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        </>
      )}
      {correcting && <CorrectContributionModal contribution={correcting} onClose={() => setCorrecting(null)} />}
    </Card>
  );
}

function RecordModal({ initial, onClose }: { initial: { member?: { id: string; name: string }; period?: string }; onClose: () => void }) {
  const { base, currency } = useFund();
  const { data: info } = useFundInfo();
  const [member, setMember] = useState(initial.member ?? null);
  const [period, setPeriod] = useState(initial.period ?? periodOf(new Date()));
  const [amount, setAmount] = useState(info ? String(info.settings.minContributionMinor / 100) : "");
  const [paidOn, setPaidOn] = useState(todayIso());
  const [method, setMethod] = useState("cash");
  const save = useAction(
    () => api.post(`${base}/contributions`, { membershipId: member!.id, period, amountMinor: toMinor(amount || "0"), paidOn, method }),
    { success: `Recorded ${formatPeriod(period)} for ${member?.name}`, onSuccess: onClose },
  );
  return (
    <Modal
      open
      onClose={onClose}
      title="Record a contribution"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={!member || !amount} onClick={() => save.mutate(undefined)}>
            Record
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Member">{(id) => <MemberPicker id={id} value={member} onChange={setMember} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="For month">{(id) => <Input id={id} type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />}</Field>
          <Field label="Amount" hint={info ? `Minimum ${money(info.settings.minContributionMinor, currency)}` : undefined}>
            {(id) => <MoneyInput id={id} currency={currency} value={amount} onChange={setAmount} />}
          </Field>
          <Field label="Paid on" hint="Late/on-time is worked out from the due day">{(id) => <Input id={id} type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />}</Field>
          <Field label="Method">
            {(id) => (
              <Select id={id} value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="cash">Cash</option>
                <option value="momo">Mobile money</option>
                <option value="bank">Bank transfer</option>
              </Select>
            )}
          </Field>
        </div>
        <ErrorText error={save.error} />
      </div>
    </Modal>
  );
}

export function CorrectContributionModal({ contribution, onClose }: { contribution: Contribution; onClose: () => void }) {
  const { base, currency } = useFund();
  const [amount, setAmount] = useState(String(contribution.amountMinor / 100));
  const [status, setStatus] = useState<Contribution["status"]>(contribution.status === "missed" ? "on_time" : contribution.status);
  const [reason, setReason] = useState("");
  const save = useAction(() => api.patch(`${base}/contributions/${contribution.id}`, { amountMinor: status === "missed" ? 0 : toMinor(amount || "0"), status, reason }), { success: "Contribution corrected", onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Correct ${formatPeriod(contribution.period)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={reason.length < 3} onClick={() => save.mutate(undefined)}>
            Save correction
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-slate-500">The original entry is reversed in the books and re-posted with the corrected figures. The change is recorded in the audit log.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount">{(id) => <MoneyInput id={id} currency={currency} value={amount} onChange={setAmount} disabled={status === "missed"} />}</Field>
        <Field label="Status">
          {(id) => (
            <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              {CONTRIBUTION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Reason" className="mt-3">
        {(id) => <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. receipt showed GHS 80" />}
      </Field>
      <div className="mt-3">
        <ErrorText error={save.error} />
      </div>
    </Modal>
  );
}

function ClosePeriodModal({ onClose }: { onClose: () => void }) {
  const { base } = useFund();
  const [period, setPeriod] = useState(addMonths(periodOf(new Date()), -1));
  const close = useAction((p: string) => api.post<{ markedMissed: number }>(`${base}/contributions/close-period`, { period: p }), {
    success: (r) => `${formatPeriod(period)} closed — ${r.markedMissed} member(s) marked missed`,
    onSuccess: onClose,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Close a month"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={close.isPending} onClick={() => close.mutate(period)}>
            Close month
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600 dark:text-slate-400">Everyone who hasn't paid for the month is marked <b>missed</b>, and standings are recalculated (behind after 2 missed months, voided after 3 by default). Members can still pay a missed month later. Safe to run more than once.</p>
      <Field label="Month" className="mt-4">
        {(id) => <Input id={id} type="month" value={period} max={addMonths(periodOf(new Date()), -1)} onChange={(e) => setPeriod(e.target.value)} />}
      </Field>
      <div className="mt-3">
        <ErrorText error={close.error} />
      </div>
    </Modal>
  );
}
