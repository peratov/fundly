import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Short label for logs, e.g. "circle-organiser-link". */
  tag: string;
}

export interface SentEmail extends EmailMessage {
  id: string;
  sentAt: string;
}

/**
 * Transactional email behind one interface, so the rest of the app never cares
 * which provider is configured. Adding Postmark/SES/Mailgun is one new function.
 */
export interface Mailer {
  readonly name: string;
  send(msg: EmailMessage): Promise<void>;
}

const TIMEOUT_MS = 10_000;

function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), TIMEOUT_MS))]);
}

/**
 * Development mailer: nothing leaves the machine. Messages are kept in memory
 * (for tests and the dev outbox page) and written to .data/outbox as HTML.
 */
export function devMailer(opts: { dir?: string; log?: boolean } = {}): Mailer & { outbox: SentEmail[] } {
  const outbox: SentEmail[] = [];
  return {
    name: "dev",
    outbox,
    async send(msg) {
      const sent: SentEmail = { ...msg, id: `${Date.now().toString(36)}-${outbox.length}`, sentAt: new Date().toISOString() };
      outbox.unshift(sent);
      if (outbox.length > 50) outbox.pop();
      if (opts.dir) {
        try {
          mkdirSync(opts.dir, { recursive: true });
          writeFileSync(path.join(opts.dir, `${sent.id}-${msg.tag}.html`), msg.html);
        } catch {
          /* best effort */
        }
      }
      if (opts.log) console.log(`[mail:dev] → ${msg.to} · ${msg.subject} (open /api/dev/outbox to read it)`);
    },
  };
}

/** https://resend.com — a single HTTPS call, no SDK needed. */
export function resendMailer(apiKey: string, from: string, fetchImpl: typeof fetch = fetch): Mailer {
  return {
    name: "resend",
    async send(msg) {
      const res = await withTimeout(
        fetchImpl("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text, tags: [{ name: "category", value: msg.tag }] }),
        }),
        "Resend",
      );
      if (!res.ok) throw new Error(`Resend rejected the email (${res.status}): ${(await res.text()).slice(0, 200)}`);
    },
  };
}

/** Any SMTP server (Gmail, Brevo, Zoho, SES, Mailgun…), e.g. smtps://user:pass@smtp.example.com:465 */
export async function smtpMailer(url: string, from: string): Promise<Mailer> {
  const { default: nodemailer } = await import("nodemailer");
  const transport = nodemailer.createTransport(url);
  return {
    name: "smtp",
    async send(msg) {
      await withTimeout(transport.sendMail({ from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text }), "SMTP");
    },
  };
}
