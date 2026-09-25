import { and, eq, sql } from "drizzle-orm";
import type { Role } from "../../shared/enums";
import type { Db } from "../db/client";
import { auditEvents, counters, memberships, notifications } from "../db/schema";
import type { Actor } from "./context";

// ---------------------------------------------------------------- audit trail

export async function audit(
  tx: Db,
  tenantId: string,
  actor: Actor,
  e: { action: string; entityType: string; entityId?: string | null; summary: string; data?: unknown },
) {
  await tx.insert(auditEvents).values({
    tenantId,
    actorUserId: actor.userId,
    actorName: actor.name,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId ?? null,
    summary: e.summary,
    data: e.data ?? null,
  });
}

// ---------------------------------------------------------------- notifications

interface Message {
  kind: string;
  title: string;
  body: string;
  link?: string;
}

/** Notify every active member holding any of `roles` (fan-out on write keeps reads a single indexed query). */
export async function notifyRoles(tx: Db, tenantId: string, roles: Role[], msg: Message, opts: { exceptUserId?: string | null } = {}) {
  const rows = await tx
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.tenantId, tenantId),
        eq(memberships.status, "active"),
        sql`${memberships.userId} is not null`,
        sql`${memberships.roles} && ARRAY[${sql.join(roles.map((r) => sql`${r}`), sql`, `)}]::text[]`,
      ),
    );
  const userIds = [...new Set(rows.map((r) => r.userId!).filter((u) => u !== opts.exceptUserId))];
  if (!userIds.length) return;
  await tx.insert(notifications).values(userIds.map((userId) => ({ tenantId, userId, ...msg })));
}

export async function notifyMember(tx: Db, tenantId: string, membershipId: string, msg: Message) {
  const [m] = await tx.select({ userId: memberships.userId }).from(memberships).where(and(eq(memberships.tenantId, tenantId), eq(memberships.id, membershipId)));
  if (!m?.userId) return;
  await tx.insert(notifications).values({ tenantId, userId: m.userId, ...msg });
}

// ---------------------------------------------------------------- human-readable references

/** Atomic per-tenant counter: safe under concurrency because the upsert takes a row lock. */
export async function nextRef(tx: Db, tenantId: string, key: string, prefix: string, width = 4): Promise<string> {
  const [row] = await tx
    .insert(counters)
    .values({ tenantId, key, value: 1 })
    .onConflictDoUpdate({ target: [counters.tenantId, counters.key], set: { value: sql`${counters.value} + 1` } })
    .returning({ value: counters.value });
  return `${prefix}-${String(row.value).padStart(width, "0")}`;
}
