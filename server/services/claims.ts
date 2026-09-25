import { and, eq } from "drizzle-orm";
import type { ClaimType } from "../../shared/enums";
import { formatMoney } from "../../shared/money";
import type { Db } from "../db/client";
import { claims, memberships } from "../db/schema";
import type { Actor, Tenant } from "../lib/context";
import { conflict, forbidden, notFound, unprocessable } from "../lib/http";
import { accountBalances, postJournal } from "../lib/ledger";
import { audit, nextRef, notifyMember, notifyRoles } from "../lib/records";
import { memberSnapshot } from "./members";

export async function fileClaim(
  tx: Db,
  tenant: Tenant,
  actor: Actor,
  input: { membershipId: string; type: ClaimType; amountRequestedMinor: number; description: string; asOf: Date },
) {
  const snap = await memberSnapshot(tx, tenant, input.membershipId, input.asOf);
  if (snap.member.status !== "active") throw unprocessable("Member has exited the fund");
  if (snap.member.standing === "voided") throw unprocessable("Welfare cover is suspended while membership is voided");
  const remaining = snap.welfare.remaining[input.type];
  if (input.amountRequestedMinor > remaining) {
    throw unprocessable(`Exceeds the remaining ${input.type} cover of ${formatMoney(remaining, tenant.currency)} this year`);
  }
  const ref = await nextRef(tx, tenant.id, "claim", "C");
  const [claim] = await tx
    .insert(claims)
    .values({ tenantId: tenant.id, ref, membershipId: input.membershipId, type: input.type, amountRequestedMinor: input.amountRequestedMinor, description: input.description })
    .returning();
  const amount = formatMoney(input.amountRequestedMinor, tenant.currency);
  await audit(tx, tenant.id, actor, { action: "claim.filed", entityType: "claim", entityId: claim.id, summary: `${snap.member.name} filed ${input.type} claim ${ref} for ${amount}` });
  await notifyRoles(tx, tenant.id, ["manager", "owner"], {
    kind: "claim",
    title: `Welfare claim ${ref}`,
    body: `${snap.member.name} requested ${amount} (${input.type}).`,
    link: `/claims`,
  });
  return claim;
}

export async function decideClaim(
  tx: Db,
  tenant: Tenant,
  actor: Actor,
  claimId: string,
  input: { decision: "approve" | "reject"; amountApprovedMinor?: number; notes: string; today: string; asOf: Date },
) {
  const [claim] = await tx.select().from(claims).where(and(eq(claims.tenantId, tenant.id), eq(claims.id, claimId))).for("update");
  if (!claim) throw notFound("Claim");
  if (claim.status !== "pending") throw conflict("This claim has already been decided");
  if (claim.membershipId === actor.membershipId) throw forbidden("You can't decide on your own claim");

  const approve = input.decision === "approve";
  const amount = approve ? (input.amountApprovedMinor ?? claim.amountRequestedMinor) : 0;
  if (approve) {
    if (amount <= 0) throw unprocessable("Approved amount must be positive");
    const snap = await memberSnapshot(tx, tenant, claim.membershipId, input.asOf);
    if (amount > snap.welfare.remaining[claim.type]) {
      throw unprocessable(`Exceeds remaining ${claim.type} cover of ${formatMoney(snap.welfare.remaining[claim.type], tenant.currency)}`);
    }
    const balances = await accountBalances(tx, tenant.id);
    if ((balances.cash ?? 0) < amount) throw unprocessable("Not enough cash in the fund to pay this claim");
  }

  const [updated] = await tx
    .update(claims)
    .set({ status: approve ? "approved" : "rejected", amountApprovedMinor: amount, decisionNotes: input.notes || null, decidedBy: actor.userId, decidedAt: new Date() })
    .where(eq(claims.id, claimId))
    .returning();

  const [m] = await tx.select({ name: memberships.name }).from(memberships).where(eq(memberships.id, claim.membershipId));
  if (approve) {
    await postJournal(tx, {
      tenantId: tenant.id,
      occurredOn: input.today,
      memo: `Welfare payout ${claim.ref} — ${m.name}`,
      sourceType: "claim_payout",
      sourceId: claim.id,
      createdBy: actor.userId,
      lines: [
        { account: "welfare_reserve", debit: amount, membershipId: claim.membershipId },
        { account: "cash", credit: amount },
      ],
    });
  }
  const amt = formatMoney(amount, tenant.currency);
  await audit(tx, tenant.id, actor, {
    action: approve ? "claim.approved" : "claim.rejected",
    entityType: "claim",
    entityId: claimId,
    summary: approve ? `Approved ${claim.ref} for ${m.name}: paid ${amt}` : `Rejected ${claim.ref} for ${m.name}${input.notes ? `: ${input.notes}` : ""}`,
  });
  await notifyMember(tx, tenant.id, claim.membershipId, {
    kind: "claim",
    title: approve ? `Claim ${claim.ref} approved` : `Claim ${claim.ref} not approved`,
    body: approve ? `${amt} has been approved for payout.` : input.notes || "Please contact the fund manager for details.",
    link: "/portal/welfare",
  });
  return updated;
}
