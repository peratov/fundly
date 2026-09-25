import type { Role } from "./enums";

export const PERMISSIONS = [
  "members:read",
  "members:write",
  "roles:write",
  "contributions:read",
  "contributions:write",
  "loans:read",
  "loans:review",
  "loans:decide",
  "loans:service",
  "claims:read",
  "claims:decide",
  "shares:write",
  "payments:read",
  "reports:read",
  "audit:read",
  "settings:write",
  "import:write",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MANAGER: Permission[] = PERMISSIONS.filter((p) => p !== "roles:write" && p !== "loans:review");

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [...PERMISSIONS],
  manager: MANAGER,
  credit_committee: ["members:read", "contributions:read", "loans:read", "loans:review"],
  audit_committee: [
    "members:read",
    "contributions:read",
    "loans:read",
    "claims:read",
    "payments:read",
    "reports:read",
    "audit:read",
  ],
  // Members act on their own records through the /me endpoints; no tenant-wide permissions.
  member: [],
};

export function permissionsFor(roles: readonly Role[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r] ?? []) out.add(p);
  return out;
}

export function can(roles: readonly Role[], perm: Permission): boolean {
  return permissionsFor(roles).has(perm);
}
