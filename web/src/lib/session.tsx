import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router";
import type { Role } from "../../../shared/enums";
import { permissionsFor, type Permission } from "../../../shared/permissions";
import { planInfo } from "../../../shared/plans";
import { api, ApiError } from "./api";

export interface FundSummary {
  tenantId: string;
  name: string;
  shortName: string | null;
  currency: string;
  status: string;
  plan: string;
  planExpiresAt: string | null;
  membershipId: string;
  memberName: string;
  roles: Role[];
}

export interface Me {
  user: { id: string; email: string; name: string; isPlatformAdmin: boolean };
  funds: FundSummary[];
}

/*
 * The session cookie is httpOnly (scripts can't read it), so we also keep a harmless
 * "probably signed in" flag. Visitors without it see public pages instantly instead of
 * waiting for /api/auth/me; the real check still runs and always wins.
 */
const HINT = "awafund-signed-in";
export function hasSessionHint() {
  try {
    return localStorage.getItem(HINT) === "1";
  } catch {
    return false;
  }
}
function setSessionHint(on: boolean) {
  try {
    if (on) localStorage.setItem(HINT, "1");
    else localStorage.removeItem(HINT);
  } catch {
    /* private mode */
  }
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        const me = await api.get<Me>("/auth/me");
        setSessionHint(true);
        return me;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          setSessionHint(false);
          return null;
        }
        throw e;
      }
    },
    staleTime: 60_000,
  });
}

export function useSetMe() {
  const qc = useQueryClient();
  return (me: Me | null) => {
    setSessionHint(!!me);
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
    /** What the fund's plan includes (member limit, online collection, AI). */
    plan: planInfo(fund?.plan ?? "free"),
  };
}
