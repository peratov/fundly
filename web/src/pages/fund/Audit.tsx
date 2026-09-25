import { Download } from "lucide-react";
import { useState } from "react";
import { Button, Card, Loading, PageHeader, Pagination, SearchInput, Table, Td, Th, Tr, useDebounced } from "../../components/ui";
import { qs, type Paged } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { useFundQuery } from "../../lib/hooks";
import { useFund } from "../../lib/session";
import type { AuditEvent } from "../../lib/types";

export default function Audit() {
  const { base, can } = useFund();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, isLoading } = useFundQuery<Paged<AuditEvent>>(["audit", dq, page], `/audit${qs({ q: dq, page, pageSize: 50 })}`);
  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="Every change to members, money and settings — who did it and when. Entries can't be edited or deleted."
        actions={
          can("reports:read") && (
            <a href={`/api${base}/export/audit.csv`}>
              <Button variant="secondary" icon={<Download className="size-4" />}>
                Export
              </Button>
            </a>
          )
        }
      />
      <Card padded={false}>
        <div className="border-b border-slate-100 p-4 dark:border-slate-800">
          <SearchInput value={q} onChange={(v) => (setQ(v), setPage(1))} placeholder="Search actions, people, details" />
        </div>
        {isLoading || !data ? (
          <Loading />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Who</Th>
                  <Th>Action</Th>
                  <Th>Details</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((a) => (
                  <Tr key={a.id}>
                    <Td className="text-xs">{formatDate(a.createdAt, true)}</Td>
                    <Td>{a.actorName}</Td>
                    <Td>
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">{a.action}</code>
                    </Td>
                    <Td className="whitespace-normal">{a.summary}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
