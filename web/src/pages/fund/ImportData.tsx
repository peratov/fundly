import { FileUp } from "lucide-react";
import { useState } from "react";
import { Button, Card, ErrorText, PageHeader, Tabs, Textarea } from "../../components/ui";
import { api } from "../../lib/api";
import { useAction } from "../../lib/hooks";
import { useFund } from "../../lib/session";

type Kind = "members" | "contributions";
interface Result {
  dryRun: boolean;
  total: number;
  valid?: number;
  imported?: number;
  errors: { row: number; message: string }[];
}

const TEMPLATES: Record<Kind, { columns: string; sample: string; notes: string }> = {
  members: {
    columns: "name, email, phone, occupation, joined_on, member_no, welfare_package, attendance_pct",
    sample: "name,email,phone,joined_on,member_no,welfare_package\nAma Mensah,ama@example.com,+233241112233,2019-01-15,DZ09-021,bronze\n",
    notes: "Only name and joined_on (YYYY-MM-DD) are required. Leave member_no blank to auto-number.",
  },
  contributions: {
    columns: "member_no or email, period (YYYY-MM) or year + month, amount, paid_on, status",
    sample: "member_no,period,amount,paid_on\nDZ09-021,2026-01,50,2026-01-05\nDZ09-021,2026-02,50,2026-02-22\n",
    notes: "Leave amount blank or 0 to record a missed month. Status (on_time / late / advance / missed) is worked out from paid_on if omitted. The whole file posts or none of it does.",
  },
};

export default function ImportData() {
  const { base } = useFund();
  const [kind, setKind] = useState<Kind>("members");
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const run = useAction((dryRun: boolean) => api.post<Result>(`${base}/import/${kind}`, { csv, dryRun }), {
    success: (r) => (r.dryRun ? `Checked ${r.total} rows` : `Imported ${r.imported} rows`),
    onSuccess: setResult,
  });
  const t = TEMPLATES[kind];

  return (
    <>
      <PageHeader title="Import from a spreadsheet" subtitle="Bring your existing records in. Every file is validated first — nothing is saved until you confirm." />
      <div className="mb-4">
        <Tabs value={kind} onChange={(k) => (setKind(k), setResult(null))} tabs={[{ value: "members", label: "Members" }, { value: "contributions", label: "Contribution history" }]} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="1. Paste or upload CSV" className="lg:col-span-2">
          <label className="mb-3 flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-slate-200 px-4 py-3 text-sm text-slate-600 hover:border-brand-500 dark:border-slate-700">
            <FileUp className="size-4" /> Choose a .csv file
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setCsv(await f.text());
                  setResult(null);
                }
              }}
            />
          </label>
          <Textarea rows={12} className="font-mono sm:text-xs" value={csv} onChange={(e) => (setCsv(e.target.value), setResult(null))} placeholder={t.sample} />
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" disabled={!csv.trim()} loading={run.isPending && run.variables === true} onClick={() => run.mutate(true)}>
              2. Check file
            </Button>
            <Button disabled={!result || !result.dryRun || result.errors.length > 0 || !result.valid} loading={run.isPending && run.variables === false} onClick={() => run.mutate(false)}>
              3. Import {result?.valid ? `${result.valid} rows` : ""}
            </Button>
          </div>
          <div className="mt-3">
            <ErrorText error={run.error} />
          </div>
          {result && (
            <div className="mt-4 text-sm">
              {result.errors.length ? (
                <div className="rounded-lg bg-rose-50 p-3 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:ring-rose-900">
                  <p className="font-medium text-rose-800 dark:text-rose-300">{result.errors.length} problem(s) to fix before importing:</p>
                  <ul className="mt-2 max-h-60 list-disc overflow-y-auto pl-5 text-rose-700 dark:text-rose-300">
                    {result.errors.map((e, i) => (
                      <li key={i}>{e.row ? `Row ${e.row}: ` : ""}{e.message}</li>
                    ))}
                  </ul>
                </div>
              ) : result.dryRun ? (
                <p className="rounded-lg bg-emerald-50 p-3 text-emerald-800 ring-1 ring-emerald-200">All {result.valid} rows look good. Click Import to save them.</p>
              ) : (
                <p className="rounded-lg bg-emerald-50 p-3 text-emerald-800 ring-1 ring-emerald-200">Imported {result.imported} rows.</p>
              )}
            </div>
          )}
        </Card>
        <Card title="Format">
          <p className="text-sm font-medium">Columns</p>
          <p className="mt-1 font-mono text-xs text-slate-600 dark:text-slate-400">{t.columns}</p>
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">{t.notes}</p>
          <p className="mt-4 text-sm font-medium">Example</p>
          <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800">{t.sample}</pre>
          <p className="mt-4 text-xs text-slate-500">Tip: import members first, then their contribution history. Up to 5,000 rows per file.</p>
        </Card>
      </div>
    </>
  );
}
