import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router";
import type { Role } from "../../../shared/enums";
import { permissionsFor, type Permission } from "../../../shared/permissions";
import { api, ApiError } from "./api";

export interface FundSummary {
  tenantId: string;
  name: string;
  shortName: string | null;
  currency: string;
  status: string;
  plan: string;
  trialEndsAt: string | null;
  membershipId: string;
  memberName: string;
  roles: Role[];
}

export interface Me {
  user: { id: string; email: string; name: string; isPlatformAdmin: boolean };
  funds: FundSummary[];
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api.get<Me>("/auth/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
  });
}

export function useSetMe() {
  const qc = useQueryClient();
  return (me: Me | null) => {
    qc.clear();
    qc.setQueryData(["me"], me);
  };
}

/** The fund in the current URL plus the caller's permissions in it. */
export function useFund() {
  const { tenantId } = useParams();
  const { data: me } = useMe();
  const fund = me?.funds.find((f) => f.tenantId === tenantId);
  const perms = permissionsFor(fund?.roles ?? []);
  return {
    tenantId: tenantId!,
    fund,
    me,
    base: `/t/${tenantId}`,
    currency: fund?.currency ?? "GHS",
    can: (p: Permission) => perms.has(p),
    isStaff: perms.size > 0,
  };
}
