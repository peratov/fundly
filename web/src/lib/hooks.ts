import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useToast } from "../components/ui";
import { api } from "./api";
import { useFund } from "./session";
import type { FundInfo } from "./types";

export function useFundInfo() {
  const { base, tenantId } = useFund();
  return useQuery({ queryKey: ["fund", tenantId], queryFn: () => api.get<FundInfo>(`${base}/settings`), staleTime: 60_000 });
}

/**
 * Standard mutation for tenant-scoped writes: toast on success, invalidate
 * affected queries (everything under this fund by default).
 */
export function useAction<TIn, TOut = unknown>(fn: (input: TIn) => Promise<TOut>, opts: { success?: string | ((out: TOut) => string); invalidate?: QueryKey[]; onSuccess?: (out: TOut) => void } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { tenantId } = useFund();
  return useMutation({
    mutationFn: fn,
    onSuccess: (out) => {
      for (const key of opts.invalidate ?? [[tenantId]]) qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["notifications", tenantId] });
      if (opts.success) toast(typeof opts.success === "function" ? opts.success(out) : opts.success);
      opts.onSuccess?.(out);
    },
  });
}

/** Query scoped under the tenant id so a single invalidate refreshes the whole fund. */
export function useFundQuery<T>(key: unknown[], path: string | null, enabled = true) {
  const { base, tenantId } = useFund();
  return useQuery({
    queryKey: [tenantId, ...key],
    queryFn: () => api.get<T>(`${base}${path}`),
    enabled: enabled && path !== null,
    placeholderData: (prev) => prev,
  });
}

export { api };
