import type { Context } from "hono";
import type { Role } from "../../shared/enums";
import type { Permission } from "../../shared/permissions";
import type { Config } from "../config";
import type { Db } from "../db/client";
import type * as s from "../db/schema";
import type { PaymentProvider } from "../payments/provider";
import type { Mailer } from "../email/mailer";
import type { Assistant } from "./assistant";

export interface Clock {
  now(): Date;
}
export const systemClock: Clock = { now: () => new Date() };

export interface Deps {
  db: Db;
  config: Config;
  clock: Clock;
  payments: PaymentProvider;
  assistant: Assistant;
  mailer: Mailer;
}

export type User = typeof s.users.$inferSelect;
export type Tenant = typeof s.tenants.$inferSelect;
export type Membership = typeof s.memberships.$inferSelect;

export interface AppEnv {
  Variables: {
    deps: Deps;
    user: User;
    tenant: Tenant;
    membership: Membership;
    roles: Role[];
    perms: Set<Permission>;
  };
}

export type Ctx = Context<AppEnv>;

/** Who did something — carried into audit events, journal entries and notifications. */
export interface Actor {
  userId: string | null;
  name: string;
  membershipId?: string;
}

export function actorOf(c: Ctx): Actor {
  const user = c.get("user");
  const m = c.get("membership");
  return { userId: user.id, name: m?.name ?? user.name, membershipId: m?.id };
}

export function today(c: Ctx): string {
  return c.get("deps").clock.now().toISOString().slice(0, 10);
}
