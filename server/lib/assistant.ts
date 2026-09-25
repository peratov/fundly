import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { CreditScore, Eligibility } from "../../shared/domain/members";
import { scoreBand } from "../../shared/domain/members";
import { formatMoney } from "../../shared/money";
import type { OutreachInput } from "../../shared/schemas";

export interface AssessmentInput {
  memberName: string;
  fundName: string;
  currency: string;
  standing: string;
  score: CreditScore;
  eligibility: Eligibility;
  totalSavingsMinor: number;
  openLoanBalanceMinor: number;
}

export interface Assessment {
  summary: string;
  recommendations: string[];
  source: "ai" | "template";
}

export interface OutreachDraftInput extends OutreachInput {
  memberName: string;
  fundName: string;
  currency: string;
  facts: string[];
}

export interface OutreachDraft {
  subject: string;
  body: string;
  source: "ai" | "template";
}

/**
 * The assistant only *explains* numbers the domain layer already computed.
 * The credit score and loan limit are deterministic and auditable; the model
 * never produces its own score, so there is one number committees can trust.
 */
export interface Assistant {
  assess(input: AssessmentInput): Promise<Assessment>;
  draftOutreach(input: OutreachDraftInput): Promise<OutreachDraft>;
}

// ---------------------------------------------------------------- deterministic templates

export const templateAssistant: Assistant = {
  async assess(i) {
    const band = scoreBand(i.score.total);
    const weakest = [...i.score.pillars].sort((a, b) => a.points / a.max - b.points / b.max)[0];
    const strongest = [...i.score.pillars].sort((a, b) => b.points / b.max - a.points / a.max)[0];
    const failed = i.eligibility.checks.filter((c) => !c.ok);
    const money = (m: number) => formatMoney(m, i.currency);

    const summary =
      `${i.memberName} has a credit score of ${i.score.total}/1000 (${band.label}) and is currently ${i.standing}. ` +
      `Their strongest area is ${strongest.label.toLowerCase()} (${strongest.note.toLowerCase()}); the weakest is ${weakest.label.toLowerCase()} (${weakest.note.toLowerCase()}). ` +
      `Total savings stand at ${money(i.totalSavingsMinor)}` +
      (i.openLoanBalanceMinor ? ` with ${money(i.openLoanBalanceMinor)} outstanding on loans. ` : " with no outstanding loans. ") +
      (i.eligibility.eligible
        ? `They meet all lending rules, with a borrowing limit of ${money(i.eligibility.limitMinor)}.`
        : `They are not currently eligible to borrow: ${failed.map((f) => f.label.toLowerCase()).join("; ")}.`);

    const recommendations: string[] = [];
    if (i.standing !== "active") recommendations.push("Reach out personally to agree a plan for clearing missed dues before any new lending.");
    if (weakest.key === "regularity") recommendations.push("Suggest setting up a MoMo payment each month to avoid late or missed contributions.");
    if (weakest.key === "participation") recommendations.push("Encourage attendance at the next general meeting to lift the participation score.");
    if (weakest.key === "amount") recommendations.push("Contributing above the minimum each month would strengthen both savings and score.");
    if (i.openLoanBalanceMinor) recommendations.push("Keep the current loan on schedule; clearing it restores full borrowing capacity.");
    if (i.eligibility.eligible && band.tone === "good") recommendations.push(`Eligible for standard loan processing up to ${money(i.eligibility.limitMinor)}.`);
    if (!recommendations.length) recommendations.push("No action needed. Keep up the consistent record.");
    return { summary, recommendations: recommendations.slice(0, 3), source: "template" };
  },

  async draftOutreach(i) {
    const greet = i.tone === "friendly" ? `Hi ${i.memberName}!` : `Dear ${i.memberName},`;
    const sign = i.tone === "friendly" ? `Warm regards,\n${i.fundName}` : `Sincerely,\nFund Management, ${i.fundName}`;
    const facts = i.facts.length ? `\n\n${i.facts.map((f) => `• ${f}`).join("\n")}` : "";
    const extra = i.context ? `\n\n${i.context}` : "";
    const lines: Record<OutreachInput["purpose"], { subject: string; body: string }> = {
      contribution_reminder: {
        subject: `${i.fundName}: monthly contribution reminder`,
        body:
          i.tone === "urgent"
            ? "Our records show contributions outstanding on your account. Please settle them as soon as possible to keep your membership in good standing and protect your borrowing access."
            : "A quick reminder that this month's contribution is now due. Your steady support keeps the fund strong for everyone.",
      },
      loan_reminder: {
        subject: `${i.fundName}: loan repayment reminder`,
        body:
          i.tone === "urgent"
            ? "Your loan repayment is overdue. Please make a payment or contact the fund manager today to agree a plan, so penalties don't continue to build."
            : "This is a reminder about your upcoming loan instalment. You can pay by MoMo from your member portal.",
      },
      attendance: {
        subject: `We missed you at the last meeting`,
        body: "We missed you at our last meeting. Attendance helps the group make good decisions together and also counts toward your credit score. We hope to see you at the next one.",
      },
      welfare_benefits: {
        subject: `${i.fundName}: your welfare cover`,
        body: "Here's a reminder of the welfare cover available to you through the fund. If you need to make a claim, you can file it from the Welfare tab in your member portal.",
      },
      greeting: {
        subject: `Greetings from ${i.fundName}`,
        body: "Warm greetings from the fund team. Thank you for being part of our community. Your portal is always available to check savings, loans and welfare cover.",
      },
    };
    const t = lines[i.purpose];
    const body = `${greet}\n\n${t.body}${facts}${extra}\n\n${sign}`;
    return { subject: i.channel === "email" ? t.subject : "", body: i.channel === "whatsapp" ? `*${i.fundName}*\n\n${body}` : body, source: "template" };
  },
};

// ---------------------------------------------------------------- Claude-backed assistant

const MODEL = "claude-opus-5";

const AssessmentSchema = z.object({
  summary: z.string(),
  recommendations: z.array(z.string()),
});

const OutreachSchema = z.object({
  subject: z.string(),
  body: z.string(),
});

const SYSTEM = `You write for the managers of a community mutual savings and loan fund (for example a school alumni association in Ghana).
You are given figures that the fund's rules engine has already calculated. Treat them as final: never invent, recompute or contradict a number, score or eligibility result.
Write plain, warm, respectful English suitable for members who are classmates and friends. Keep it concise.`;

export function claudeAssistant(apiKey: string, fallback: Assistant = templateAssistant): Assistant {
  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 });

  async function run<T>(prompt: string, schema: z.ZodType<T>): Promise<T | null> {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(schema) },
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "refusal") return null;
    return (response.parsed_output as T | null) ?? null;
  }

  async function guarded<T>(label: string, fn: () => Promise<T | null>, fallbackFn: () => Promise<T>): Promise<T> {
    try {
      const out = await fn();
      if (out) return out;
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) console.warn(`[assistant] ${label}: rate limited, using template`);
      else if (err instanceof Anthropic.APIError) console.warn(`[assistant] ${label}: API error ${err.status}, using template`);
      else console.warn(`[assistant] ${label}: ${(err as Error).message}, using template`);
    }
    return fallbackFn();
  }

  return {
    assess: (i) =>
      guarded(
        "assess",
        async () => {
          const money = (m: number) => formatMoney(m, i.currency);
          const prompt = [
            `Write a short credit assessment (3-5 sentences) of ${i.memberName}, a member of ${i.fundName}, for the credit committee, followed by up to 3 practical recommendations.`,
            ``,
            `Standing: ${i.standing}`,
            `Credit score: ${i.score.total}/1000 (${scoreBand(i.score.total).label})`,
            ...i.score.pillars.map((p) => `- ${p.label}: ${p.points}/${p.max} (${p.note})`),
            `Total savings: ${money(i.totalSavingsMinor)}`,
            `Outstanding loan balance: ${money(i.openLoanBalanceMinor)}`,
            `Eligible to borrow: ${i.eligibility.eligible ? "yes" : "no"}; limit ${money(i.eligibility.limitMinor)}`,
            ...i.eligibility.checks.map((c) => `- ${c.ok ? "PASS" : "FAIL"} ${c.label} (${c.detail})`),
          ].join("\n");
          const out = await run(prompt, AssessmentSchema);
          return out ? { summary: out.summary, recommendations: out.recommendations.slice(0, 3), source: "ai" as const } : null;
        },
        () => fallback.assess(i),
      ),

    draftOutreach: (i) =>
      guarded(
        "outreach",
        async () => {
          const prompt = [
            `Draft a ${i.tone} ${i.channel} message from ${i.fundName} to member ${i.memberName}.`,
            `Purpose: ${i.purpose.replace(/_/g, " ")}.`,
            i.facts.length ? `Relevant facts (use exactly as given):\n${i.facts.map((f) => `- ${f}`).join("\n")}` : "",
            i.context ? `Extra context from the manager: ${i.context}` : "",
            i.channel === "email"
              ? "Include a clear subject line and a short letter with greeting and sign-off."
              : "Leave subject empty. Keep it short and easy to read on a phone" + (i.channel === "sms" ? " (under 320 characters)." : "; light WhatsApp formatting is fine."),
          ]
            .filter(Boolean)
            .join("\n");
          const out = await run(prompt, OutreachSchema);
          return out ? { subject: i.channel === "email" ? out.subject : "", body: out.body, source: "ai" as const } : null;
        },
        () => fallback.draftOutreach(i),
      ),
  };
}
