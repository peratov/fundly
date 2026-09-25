/**
 * Seeds a demo fund (Dzolali'09, from the original prototype) through the real
 * service layer, so every contribution, loan and claim is fully booked with
 * shares, journals and audit events — exactly as if it had been entered in the app.
 *
 *   npm run db:seed            # into the dev database (.data/pglite or DATABASE_URL)
 */
import { eq } from "drizzle-orm";
import { existsSync } from "node:fs";
import { MICRO } from "../../shared/domain/shares";
import { addMonths, periodOf, periodRange } from "../../shared/period";
import { defaultSettings } from "../../shared/settings";
import type { Role } from "../../shared/enums";
import { loadConfig } from "../config";
import { openDb } from "../db/client";
import { memberships, shareEntries, sharePrices, tenants, users } from "../db/schema";
import type { Actor } from "../lib/context";
import { hashPassword } from "../lib/crypto";
import { audit, nextRef } from "../lib/records";
import { fileClaim, decideClaim } from "../services/claims";
import { applyForLoan, applyPenalty, decideLoan, recordRepayment, reviewLoan } from "../services/loans";
import { closePeriod, recordContribution } from "../services/savings";

if (existsSync(".env")) process.loadEnvFile(".env");
const config = loadConfig();
const { db, close } = await openDb({ url: config.databaseUrl, dataDir: config.dataDir });

const PASSWORD = "fundly-demo";
const now = new Date();
const today = now.toISOString().slice(0, 10);
const current = periodOf(now);

const [already] = await db.select().from(tenants).where(eq(tenants.slug, "dzolali-09"));
if (already) {
  console.log("Demo fund already exists — nothing to do. Delete .data/ to start fresh.");
  await close();
  process.exit(0);
}

type Seed = { name: string; email: string; phone: string; occupation: string; joined: string; roles: Role[]; pkg: string; attendance: number; amount: number; pattern?: "late5" | "behind" | "voided" };
const people: Seed[] = [
  { name: "Mawuli Awuku", email: "mawuli@dzolali.test", phone: "+233 20 778 8990", occupation: "Business Analyst", joined: "2019-01-15", roles: ["owner", "manager"], pkg: "gold", attendance: 99, amount: 15000 },
  { name: "Emmanuel Mensah", email: "emmanuel@dzolali.test", phone: "+233 24 112 2334", occupation: "Software Engineer", joined: "2019-01-15", roles: ["manager"], pkg: "gold", attendance: 95, amount: 12000 },
  { name: "Abigail Dogbey", email: "abigail@dzolali.test", phone: "+233 20 223 3445", occupation: "Clinical Nurse", joined: "2019-03-10", roles: ["credit_committee"], pkg: "silver", attendance: 98, amount: 8000 },
  { name: "Elorm Kpodo", email: "elorm@dzolali.test", phone: "+233 24 667 7889", occupation: "Commercial Farmer", joined: "2025-11-01", roles: ["credit_committee"], pkg: "silver", attendance: 92, amount: 6000 },
  { name: "Senyo Kwaku", email: "senyo@dzolali.test", phone: "+233 55 334 4556", occupation: "Project Architect", joined: "2019-06-20", roles: ["audit_committee"], pkg: "bronze", attendance: 88, amount: 4000, pattern: "late5" },
  { name: "Edem Alornyo", email: "edem@dzolali.test", phone: "+233 54 889 9001", occupation: "Structural Engineer", joined: "2021-02-15", roles: ["member"], pkg: "silver", attendance: 90, amount: 10000 },
  { name: "Peace Gbagbo", email: "peace@dzolali.test", phone: "+233 24 445 5667", occupation: "Fashion Designer", joined: "2020-01-12", roles: ["member"], pkg: "bronze", attendance: 75, amount: 5000, pattern: "behind" },
  { name: "Kofi Tsikata", email: "kofi@dzolali.test", phone: "+233 27 556 6778", occupation: "High School Teacher", joined: "2020-04-18", roles: ["member"], pkg: "bronze", attendance: 60, amount: 3000, pattern: "voided" },
];

const extraNames = ["Akosua Boateng", "Yaw Darko", "Esi Quaye", "Kwame Asante", "Adjoa Owusu", "Selasi Agbeko", "Dela Fiagbe", "Mawunyo Adzraku", "Kafui Dzikunu", "Enyonam Ahiabor", "Sena Tamakloe", "Delali Amenyo"];
extraNames.forEach((name, i) =>
  people.push({
    name,
    email: `${name.split(" ")[0].toLowerCase()}@dzolali.test`,
    phone: `+233 24 ${String(300 + i).padStart(3, "0")} ${String(1000 + i * 37).slice(0, 4)}`,
    occupation: ["Accountant", "Pharmacist", "Civil Servant", "Trader", "Banker", "Lecturer"][i % 6],
    joined: `${2019 + (i % 6)}-${String((i % 12) + 1).padStart(2, "0")}-01`,
    roles: ["member"],
    pkg: ["bronze", "silver", "bronze", "gold"][i % 4],
    attendance: 70 + ((i * 7) % 30),
    amount: [3000, 4000, 5000, 6000, 10000][i % 5],
  }),
);

console.log(`Seeding demo fund with ${people.length} members… (this books ~2,000 contributions through the ledger, give it a minute)`);

const settings = defaultSettings(3000);
const [tenant] = await db
  .insert(tenants)
  .values({ slug: "dzolali-09", name: "Dzolali'09 Savings Fund", shortName: "Dzolali'09", currency: "GHS", status: "active", plan: "standard", settings })
  .returning();
await db.insert(sharePrices).values([
  { tenantId: tenant.id, effectivePeriod: "2019-01", priceMinor: 2000 },
  { tenantId: tenant.id, effectivePeriod: "2022-01", priceMinor: 2400 },
]);

const hash = await hashPassword(PASSWORD);
const ids = new Map<string, string>();
const userIds = new Map<string, string>();
for (const p of people) {
  const [u] = await db.insert(users).values({ email: p.email, name: p.name, passwordHash: hash, isPlatformAdmin: p.email === "mawuli@dzolali.test" }).returning();
  const [m] = await db
    .insert(memberships)
    .values({
      tenantId: tenant.id,
      userId: u.id,
      memberNo: await nextRef(db, tenant.id, "member", "DZ09"),
      name: p.name,
      email: p.email,
      phone: p.phone,
      occupation: p.occupation,
      joinedOn: p.joined,
      roles: [...new Set<Role>(["member", ...p.roles])],
      welfarePackageId: p.pkg,
      attendancePct: p.attendance,
      nextOfKin: { name: `${p.name.split(" ")[1]} family`, phone: p.phone, relationship: "Sibling" },
    })
    .returning();
  ids.set(p.email, m.id);
  userIds.set(p.email, u.id);
}
const [fresh] = await db.select().from(tenants).where(eq(tenants.id, tenant.id));
const actorFor = (email: string): Actor => ({ userId: userIds.get(email)!, name: people.find((p) => p.email === email)!.name, membershipId: ids.get(email) });
const manager = actorFor("mawuli@dzolali.test");
await audit(db, tenant.id, manager, { action: "fund.created", entityType: "fund", entityId: tenant.id, summary: "Fund registry launched for KETASCO Class of 2009" });

// ---------------------------------------------------------------- contributions
const lastClosed = addMonths(current, -1);
for (const p of people) {
  const id = ids.get(p.email)!;
  const periods = periodRange(periodOf(p.joined), current);
  await db.transaction(async (tx) => {
    for (const [i, period] of periods.entries()) {
      const tail = periods.length - 1 - i; // 0 = current month
      if (p.pattern === "behind" && (tail === 1 || tail === 2)) continue;
      if (p.pattern === "voided" && tail >= 1 && tail <= 3) continue;
      if (tail === 0 && (p.pattern || i % 3 === 0)) continue; // some haven't paid this month yet
      const late = p.pattern === "late5" && Number(period.slice(5)) % 5 === 0;
      await recordContribution(tx, fresh, manager, { membershipId: id, period, amountMinor: p.amount, paidOn: `${period}-${late ? "22" : "05"}`, method: i % 4 === 0 ? "momo" : "cash", today });
    }
  });
}
// Close last month so unpaid members are marked missed and standings update.
for (const period of [addMonths(current, -3), addMonths(current, -2), lastClosed]) {
  await db.transaction((tx) => closePeriod(tx, fresh, manager, period));
}

// Manager bonus shares (15 per year served), now an explicit audited grant rather than a hidden formula.
await db.insert(shareEntries).values([
  { tenantId: tenant.id, membershipId: ids.get("mawuli@dzolali.test")!, microShares: 60 * MICRO, source: "grant", reason: "Manager service bonus (4 years)", createdBy: manager.userId },
  { tenantId: tenant.id, membershipId: ids.get("emmanuel@dzolali.test")!, microShares: 30 * MICRO, source: "grant", reason: "Manager service bonus (2 years)", createdBy: manager.userId },
]);

// ---------------------------------------------------------------- loans
const committee = actorFor("abigail@dzolali.test");
const asOf = now;
async function fullLoan(email: string, productCode: string, principalMinor: number, termMonths: number, purpose: string, disbursedOn: string, repayMonths: number, penaltyMinor = 0) {
  return db.transaction(async (tx) => {
    const loan = await applyForLoan(tx, fresh, actorFor(email), { membershipId: ids.get(email)!, productCode, principalMinor, termMonths, purpose, requestSpecialReview: true, asOf });
    await reviewLoan(tx, fresh, committee, loan.id, { decision: "approve", notes: "Consistent contributor; shares cover the principal." });
    await decideLoan(tx, fresh, manager, loan.id, { decision: "approve", notes: "Approved per committee recommendation.", disbursedOn });
    const inst = Math.ceil((loan.principalMinor + loan.interestMinor) / termMonths);
    for (let i = 1; i <= repayMonths; i++) {
      const d = new Date(`${disbursedOn}T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + i);
      const due = loan.principalMinor + loan.interestMinor;
      await recordRepayment(tx, fresh, manager, loan.id, { amountMinor: Math.min(inst, due - (i - 1) * inst), paidOn: d.toISOString().slice(0, 10), method: "momo" });
    }
    if (penaltyMinor) await applyPenalty(tx, fresh, manager, loan.id, { amountMinor: penaltyMinor, reason: "Missed instalment" });
    return loan;
  });
}
const back = (months: number) => {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
};
await fullLoan("emmanuel@dzolali.test", "business", 500_000, 12, "Business expansion", back(34), 12);
await fullLoan("senyo@dzolali.test", "education", 300_000, 10, "Postgraduate tuition fees", back(4), 3);
await fullLoan("peace@dzolali.test", "business", 400_000, 12, "Boutique inventory purchase", back(6), 1, 5000);

// A fresh application waiting on the committee
await db.transaction((tx) =>
  applyForLoan(tx, fresh, actorFor("edem@dzolali.test"), { membershipId: ids.get("edem@dzolali.test")!, productCode: "personal", principalMinor: 500_000, termMonths: 6, purpose: "Land purchase down-payment", requestSpecialReview: true, asOf }),
);

// ---------------------------------------------------------------- welfare
await db.transaction(async (tx) => {
  const c1 = await fileClaim(tx, fresh, actorFor("abigail@dzolali.test"), { membershipId: ids.get("abigail@dzolali.test")!, type: "medical", amountRequestedMinor: 100_000, description: "Hospitalised with malaria; bills attached.", asOf });
  await decideClaim(tx, fresh, manager, c1.id, { decision: "approve", amountApprovedMinor: 80_000, notes: "Receipts audited.", today, asOf });
  await fileClaim(tx, fresh, actorFor("edem@dzolali.test"), { membershipId: ids.get("edem@dzolali.test")!, type: "emergency", amountRequestedMinor: 50_000, description: "Flooding damaged the family shop.", asOf });
});

console.log(`
Demo fund ready. Sign in at ${config.appUrl}/login with password "${PASSWORD}":
  mawuli@dzolali.test    Owner + Fund Manager (also platform admin)
  abigail@dzolali.test   Credit Committee
  senyo@dzolali.test     Audit Committee
  edem@dzolali.test      Member (loan pending review)
  peace@dzolali.test     Member (behind, overdue loan)
`);
await close();
