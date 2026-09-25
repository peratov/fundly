import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, qs, type Paged } from "../lib/api";
import { useFund } from "../lib/session";
import type { MemberRow } from "../lib/types";
import { clsx, Input, useDebounced } from "./ui";

/** Server-side searching member combobox — works the same with 20 or 20,000 members. */
export function MemberPicker({ id, value, onChange }: { id?: string; value: { id: string; name: string } | null; onChange: (m: { id: string; name: string } | null) => void }) {
  const { base, tenantId } = useFund();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const dq = useDebounced(q, 200);
  const { data } = useQuery({
    queryKey: [tenantId, "member-pick", dq],
    queryFn: () => api.get<Paged<MemberRow>>(`${base}/members${qs({ q: dq, pageSize: 8 })}`),
    enabled: open,
  });

  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        placeholder="Search member…"
        value={open ? q : (value?.name ?? "")}
        onFocus={() => {
          setOpen(true);
          setQ("");
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => setQ(e.target.value)}
      />
      {open && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg bg-white py-1 shadow-lg ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700" role="listbox">
          {data?.items.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange({ id: m.id, name: m.name });
                  setOpen(false);
                }}
                className={clsx("flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800", value?.id === m.id && "font-semibold")}
              >
                <span>{m.name}</span>
                <span className="text-xs text-slate-400">{m.memberNo}</span>
              </button>
            </li>
          ))}
          {data && !data.items.length && <li className="px-3 py-2 text-sm text-slate-500">No matches</li>}
        </ul>
      )}
    </div>
  );
}
