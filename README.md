# Fundly

Savings, loans and welfare management for alumni associations, susu groups and community funds — a multi-tenant SaaS. This is a ground-up rebuild of the *Dzolali'09 Fund* prototype.

## Quick start

```bash
npm install
npm run db:seed     # optional: demo fund "Dzolali'09" with ~7 years of history
npm run dev         # API on :3000, web on http://localhost:5173
```

No database install is needed for development: Fundly uses [PGlite](https://pglite.dev) (real Postgres compiled to WASM) stored in `./.data`. Set `DATABASE_URL` to use a real Postgres instead — same schema, same migrations.

Demo logins (password `fundly-demo`): `mawuli@dzolali.test` (owner/manager), `abigail@dzolali.test` (credit committee), `senyo@dzolali.test` (audit committee), `edem@dzolali.test` / `peace@dzolali.test` (members).

| Command | |
|---|---|
| `npm test` | Domain unit tests + API integration tests (in-memory Postgres) |
| `npm run typecheck` | TypeScript across server, shared and web |
| `npm run build && npm start` | Production build; one Node process serves API + SPA |
| `npm run jobs` | Daily maintenance: flag overdue loans, close last month (run from cron) |
| `npm run db:generate` | Generate a SQL migration after editing `server/db/schema.ts` |
| `docker compose up --build` | App + Postgres 17 |

## What changed from the prototype, and why

| Prototype | Rebuild |
|---|---|
| Each fund's entire database was one JSON string in a single Firestore document, rewritten on every change (1 MB cap, last-write-wins) | Normalised Postgres tables; every write is a small transaction |
| Firestore rules `allow read, write: if true`; login scanned every tenant's data in the browser; roles were a `localStorage` flag; platform admin was a hard-coded email | Server-side sessions (httpOnly cookie, hashed tokens), scrypt passwords, invite links, per-tenant membership + role-based permissions checked on every request, platform admins via env |
| Money as floats, share price hard-coded 20/24, loan interest computed two different ways, dates hard-coded to 2026-05-26 | Integer minor units, effective-dated share prices, one flat-interest formula, injectable clock |
| Balances recomputed ad hoc in components | Double-entry journal: every cash movement posts balanced debits/credits; reports and trial balance come from the books |
| Random 3-digit IDs (collisions) | UUIDs + per-tenant sequential refs (`L-0042`) via atomic counters |
| Simulated Paystack only | Payment-provider interface: dev simulator + real Paystack Charge API with HMAC-verified, idempotent webhooks |
| Two conflicting credit scores (rules + LLM "simulated" score) | One deterministic, explainable 1,000-point score; AI (optional) only *explains* it |
| 3.7k-line component, 2.1k-line `App.tsx`, no tests | Layered code, route-level code splitting, 51 automated tests |
| Lead-capture modal blocking the demo | Plain signup with 14-day trial; subscription enforcement server-side |

## Architecture

```
shared/          Pure domain logic + zod schemas, used by server AND web
  domain/        credit score, eligibility, standing, loan maths, shares
  settings.ts    per-fund rules (validated JSON)
  permissions.ts role → permission map
server/
  db/schema.ts   Drizzle schema (19 tables) → drizzle/*.sql migrations
  lib/           auth, tenant scoping, ledger, audit, notifications, csv, AI assistant
  services/      business operations — each runs inside one DB transaction
  routes/        thin HTTP layer (Hono)
  payments/      provider interface: mock + Paystack
  scripts/       seed, scheduled jobs
web/src/         React 19 + React Router + TanStack Query + Tailwind v4
tests/           vitest: domain unit tests + HTTP integration tests
```

### Scalability decisions

- **Tenant isolation at one choke point.** Every tenant route lives under `/api/t/:tenantId` behind `requireTenant`, which resolves the caller's membership; every tenant table carries `tenant_id` and every index leads with it. That keeps queries index-bound as the platform grows and leaves the door open to Postgres row-level security, partitioning or sharding by tenant without reshaping the schema.
- **Stateless app servers.** Sessions live in the database, so any number of instances can sit behind a load balancer. (The auth rate limiter is in-process; swap its `Map` for Redis when running more than one instance.)
- **Server-side pagination and search everywhere** (members, contributions grid, loans, audit, exports). Member-list balances are aggregated only for the rows on the current page. CSV exports stream in 2,000-row pages.
- **Correct under concurrency.** Unique constraints (one contribution per member per month, one review per reviewer), row locks on loans, claims and payments, atomic counters, and idempotent payment completion, so retried webhooks never double-post.
- **Append-only financial history.** Corrections post reversing journal entries instead of editing the past; members "exit" rather than being deleted. The audit log records every change with the actor.
- **Fan-out-on-write notifications**, so reading them is a single indexed query per user.
- **Batch jobs process funds one at a time** in their own transactions (`server/scripts/jobs.ts`), so one fund's failure never blocks the rest.

### Money flow (double entry)

| Event | Debit | Credit |
|---|---|---|
| Contribution | Cash | Member savings (net) + Welfare reserve (premium) |
| Loan disbursed | Loans receivable | Cash |
| Loan repayment | Cash | Loans receivable (principal) + Interest income + Penalty income |
| Welfare payout | Welfare reserve | Cash |
| Write-off | Write-off expense | Loans receivable |

Interest and penalties are recognised when collected (cash basis). Repayments clear penalties first, then split pro rata between interest and principal.

## Free merry-go-round planner (lead generator)

`/tools/merry-go-round` is a free, no-signup tool for friends running a rotating savings circle (susu, chama, esusu). Visitors add friends, spin a wheel for the payout order and get a payout calendar. Planning happens entirely in the browser; **saving and sharing** asks for name + email (marketing opt-in is a separate, unticked checkbox) and creates:

- a public share link `/c/:slug` for the group chat (read-only, with an "upgrade to Fundly" call to action), and
- a private organiser link (`#edit=<token>` in the URL fragment, stored hashed server-side) for ticking off payments and sending WhatsApp reminders.

Saving emails the organiser both links. Only a hash of the edit token is stored, so a lost link can't be re-sent; instead **"Email me my organiser link"** (on the planner and on every circle page) issues a fresh extra token for each circle tied to that email. Old links keep working, and the response is identical for unknown emails, so it can't be used to discover who organises what. Emailed links always use `APP_URL`, never the request's Host header.

Email goes through a small `Mailer` interface (`server/email/`): `EMAIL_PROVIDER=resend` (HTTPS API), `smtp` (nodemailer, any SMTP server) or `dev` (default; nothing leaves your machine — read messages at `/api/dev/outbox/latest`, a route that only exists outside production). If sending fails the circle is still saved and the page tells the organiser to copy their link.

Leads land in the `leads` table (one row per email and source) and are listed with CSV export under **Operator console → Leads**. When a lead later signs up with the same email, it is marked as converted.

## Live product previews and the no-signup demo

The homepage shows the real app, not mock-ups. The phone in the hero and the product tour are the actual Fundly screens running in iframes. You can also open the demo directly at `/f/demo/overview` (a fund owner's view) or `/f/demo-member/portal` (a member's view). No account is needed.

- **How it works:** any page under `/f/demo` runs in demo mode (`web/src/demo/demo.ts`). API calls are answered from a snapshot, `web/public/demo/fixtures.json`, instead of the server. Nothing is sent to the server or saved, and actions that would change data show a "this is a demo" message.
- **Where the snapshot comes from:** it's captured from the real API. So when a screen or response changes, refresh it:
  ```bash
  npm run db:seed    # fresh demo fund
  npm run dev        # leave running
  npm run demo:capture
  ```
- **Visibility:** demo pages sit under `/f/`, which `robots.txt` keeps out of search engines.

## Knowledge base (`/learn`)

Guides live as Markdown in `content/learn/` and are rendered on the server as plain HTML with no client JavaScript, so they are fast on cheap phones and easy for search engines to index.

- **To publish a guide**, add `content/learn/<slug>.md` with frontmatter (`title`, `description`, `category`, `published`, `updated`, optional `tags`, `featured`, `faqs`). It appears automatically in the hub, its category page, search, `/sitemap.xml` and `/learn/rss.xml`.
- **Search-engine plumbing:** each page gets a canonical URL, Open Graph tags and JSON-LD (Article, BreadcrumbList, FAQPage). The hub also has a WebSite SearchAction. `/robots.txt` keeps app, API and private-circle URLs out of the index.
- **The quality gate is `tests/learn.test.ts`.** It fails the build on:
  - thin posts (under 500 words);
  - bad or duplicate titles or descriptions;
  - broken internal links;
  - orphan guides (nothing links to them);
  - empty sections.

  Run `npx vitest run tests/learn.test.ts` before you publish.
- Every URL is built from `APP_URL`, so set it to the real domain in production. Then submit `https://<domain>/sitemap.xml` in Google Search Console and Bing Webmaster Tools.
- `LEARN_DIR` overrides the content folder.

## Mobile & PWA

On phones, tables become stacked cards and modals open as bottom sheets. Staff and members get a bottom tab bar with a raised primary action. Inputs use 16px text so iOS doesn't zoom in. The app installs as a PWA (`web/public/manifest.webmanifest`). To regenerate the icons, run `node scripts/make-icons.mjs`.

## Configuration

See `.env.example`. Notable settings:

- `DATABASE_URL`: Postgres connection string (leave empty for embedded PGlite).
- `PAYMENT_PROVIDER=paystack` + `PAYSTACK_SECRET_KEY`: point Paystack's webhook at `POST /api/webhooks/paystack`.
- `ANTHROPIC_API_KEY`: optional. Credit-assessment narratives and outreach drafts are then written by Claude from the computed figures; without it, deterministic templates are used.
- `PLATFORM_ADMIN_EMAILS`: comma-separated list of operators who get the `/admin` console.

## Next steps worth doing

- Use the new mailer for fund invites, password reset and contribution reminders (today fund invite links are copied or shared via WhatsApp).
- Paystack subaccounts so each fund collects into its own settlement account; subscription billing.
- Postgres row-level security as a second isolation layer; a Redis-backed rate limiter for multi-instance deploys.
- Password reset, and optional Google sign-in.
