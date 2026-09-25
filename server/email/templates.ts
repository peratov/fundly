import { buildSchedule, FREQUENCY_LABELS } from "../../shared/domain/rotation";
import { formatMoney } from "../../shared/money";
import type { CircleBody } from "../../shared/schemas";

/*
 * Email-safe HTML: tables, inline styles, no external CSS or images, and a
 * plain-text twin for every message. All user-provided text is escaped.
 */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const money = (m: number, cur: string) => formatMoney(m, cur).replace(/\.00$/, "");
const date = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** `title` is plain text (escaped here); `body` is trusted HTML built by this module. */
function layout(title: string, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f4f1ea;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#0b1020">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden">
<tr><td style="background:#0b1020;background-image:linear-gradient(135deg,#0f766e,#7c3aed 55%,#f04e2e);padding:28px 28px 24px;color:#ffffff">
<div style="font-size:20px;font-weight:800;letter-spacing:-0.3px">Fundly</div>
<div style="margin-top:14px;font-size:24px;line-height:1.25;font-weight:800">${esc(title)}</div>
</td></tr>
<tr><td style="padding:28px">${body}</td></tr>
<tr><td style="padding:18px 28px;background:#fbfaf7;color:#64748b;font-size:12px;line-height:1.5">
You're receiving this because this email address was used to organise a merry-go-round on Fundly. It's a one-off service email, not a newsletter.
</td></tr>
</table></td></tr></table></body></html>`;
}

function button(href: string, label: string, bg = "#0b1020") {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0"><tr><td style="border-radius:12px;background:${bg}">
<a href="${esc(href)}" style="display:inline-block;padding:14px 22px;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;border-radius:12px">${esc(label)}</a></td></tr></table>`;
}

function scheduleRows(circle: CircleBody, limit = 6) {
  const byId = new Map(circle.members.map((m) => [m.id, m.name]));
  const rounds = buildSchedule({ startDate: circle.startDate, frequency: circle.frequency, amountMinor: circle.amountMinor, order: circle.order });
  const rows = rounds
    .slice(0, limit)
    .map(
      (r) => `<tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:13px;width:36px">#${r.index + 1}</td>
<td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-weight:600;font-size:14px">${esc(byId.get(r.recipientId) ?? "")}</td>
<td style="padding:8px 0;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:13px;text-align:right">${date(r.date)}</td></tr>`,
    )
    .join("");
  const more = rounds.length > limit ? `<tr><td colspan="3" style="padding:8px 0;color:#94a3b8;font-size:12px">+ ${rounds.length - limit} more rounds</td></tr>` : "";
  return { html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}${more}</table>`, rounds, byId };
}

export function organiserLinkEmail(input: { organizerName: string; circle: CircleBody; ownerUrl: string; shareUrl: string; appUrl: string }) {
  const { circle } = input;
  const pot = circle.amountMinor * circle.members.length;
  const sched = scheduleRows(circle);
  const first = sched.rounds[0];
  const firstName = input.organizerName.split(/\s+/)[0];
  const summary = `${circle.members.length} friends · ${money(circle.amountMinor, circle.currency)} ${FREQUENCY_LABELS[circle.frequency].toLowerCase()} · pot of ${money(pot, circle.currency)}`;

  const html = layout(
    `${circle.name} is live 🎉`,
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Hi ${esc(firstName)}, here are the links for your merry-go-round. <strong>Keep this email</strong> — the organiser link is how you tick off payments from any phone.</p>
<p style="margin:0 0 20px;font-size:14px;color:#475569">${esc(summary)}</p>
<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;padding:16px 18px;margin-bottom:18px">
<div style="font-weight:800;font-size:15px">🔑 Your private organiser link</div>
<div style="font-size:13px;color:#9a3412;margin:4px 0 10px">Anyone with this link can edit the circle. Don't post it in the group chat.</div>
${button(input.ownerUrl, "Open my organiser page", "#f04e2e")}
</div>
<div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:14px;padding:16px 18px;margin-bottom:24px">
<div style="font-weight:800;font-size:15px">👥 Link for your friends</div>
<div style="font-size:13px;color:#115e59;margin:4px 0 10px">Share this one. Friends can see the order and dates, but can't change anything.</div>
${button(input.shareUrl, "View the shared page", "#0f766e")}
<div style="font-size:12px;color:#64748b;word-break:break-all;margin-top:6px">${esc(input.shareUrl)}</div>
</div>
<div style="font-weight:800;font-size:15px;margin-bottom:6px">Payout order</div>
${sched.html}
<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#475569">Outgrowing the group chat? <a href="${esc(input.appUrl)}" style="color:#7c3aed;font-weight:700">Fundly</a> runs full savings funds with loans, welfare cover and mobile money collection.</p>`,
  );

  const text = [
    `Hi ${firstName},`,
    ``,
    `${circle.name} is live. ${summary}.`,
    ``,
    `YOUR PRIVATE ORGANISER LINK (don't share it — anyone with it can edit):`,
    input.ownerUrl,
    ``,
    `LINK FOR YOUR FRIENDS (read-only, share this one):`,
    input.shareUrl,
    ``,
    `Payout order:`,
    ...sched.rounds.map((r) => `  #${r.index + 1} ${sched.byId.get(r.recipientId)} — ${date(r.date)}`),
    ``,
    `First payout: ${sched.byId.get(first.recipientId)} on ${date(first.date)}.`,
    ``,
    `— Fundly`,
  ].join("\n");

  return { subject: `Your organiser link for "${circle.name}"`, html, text };
}

export function recoveryEmail(input: { links: { name: string; ownerUrl: string; shareUrl: string }[] }) {
  const items = input.links
    .map(
      (l) => `<div style="border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px;margin-bottom:12px">
<div style="font-weight:800;font-size:15px;margin-bottom:8px">${esc(l.name)}</div>
${button(l.ownerUrl, "Open organiser page", "#f04e2e")}
<div style="font-size:12px;color:#64748b;margin-top:6px">Friends' link: <a href="${esc(l.shareUrl)}" style="color:#0f766e">${esc(l.shareUrl)}</a></div>
</div>`,
    )
    .join("");
  const html = layout(
    "Here are your organiser links",
    `<p style="margin:0 0 18px;font-size:15px;line-height:1.6">Someone (hopefully you) asked for the organiser links for the merry-go-rounds created with this email. These are new private links; any links you already have keep working.</p>
${items}
<p style="margin:18px 0 0;font-size:13px;color:#64748b">Didn't ask for this? You can ignore this email — nobody can use these links unless they have access to your inbox.</p>`,
  );
  const text = ["Here are your organiser links (new private links; old ones keep working):", "", ...input.links.flatMap((l) => [l.name, `  Organiser: ${l.ownerUrl}`, `  Friends:   ${l.shareUrl}`, ""]), "Didn't ask for this? You can ignore this email."].join("\n");
  return { subject: "Your merry-go-round organiser links", html, text };
}
