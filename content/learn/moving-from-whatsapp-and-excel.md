---
title: "Moving your group from WhatsApp and Excel to proper software"
description: A step-by-step migration plan for savings groups — cleaning member lists, importing contribution history, reconciling opening balances, and bringing members along.
category: payments-and-records
tags: [migration, excel, whatsapp, import, onboarding]
published: 2026-07-13
updated: 2026-09-22
faqs:
  - q: Will we lose our history if we switch?
    a: No — import members and past contributions from your spreadsheet. Good software validates every row first and imports everything at once or nothing, so you never end up half-migrated.
  - q: Do members need smartphones?
    a: It helps, but it isn't required. Members without smartphones can still pay by mobile money and receive updates, while officials manage records.
---

Most groups run on a WhatsApp chat and a spreadsheet for years — until it becomes clear that one person's laptop holds the whole fund's history. Moving to proper software is less work than it looks if you do it in the right order.

## Step 1: Pick your "go-live" month

Choose the first month the new system will be the **official record** — ideally the start of a month or financial year. Everything before it is history to import; everything after is recorded directly.

## Step 2: Clean the member list

One row per member, with:

| Column | Example | Notes |
|---|---|---|
| name | Ama Mensah | As members know themselves |
| email | ama@example.com | Needed to invite them to the portal |
| phone | +233 24 000 0000 | For mobile money |
| joined_on | 2019-01-15 | YYYY-MM-DD |
| member_no | DZ09-001 | Keep your existing numbers if you have them |

Watch for duplicates ("Kofi T." and "Kofi Tsikata"), missing joining dates and typos in emails.

## Step 3: Prepare contribution history

One row per member per month:

| member_no | period | amount | paid_on |
|---|---|---|---|
| DZ09-001 | 2026-01 | 120 | 2026-01-05 |
| DZ09-001 | 2026-02 | 120 | 2026-02-04 |
| DZ09-004 | 2026-03 | 0 | |

A zero or blank amount records a **missed** month, which matters for [member standing](/learn/when-a-member-doesnt-pay).

If your spreadsheet has months as columns (Jan, Feb, Mar…), you'll need to "unpivot" it into rows first — a pivot table or a few formulas will do it.

## Step 4: Import and validate

Import members first, then contributions. Good software will:

- check every row **before** saving anything;
- tell you exactly which rows have problems and why;
- import the whole file at once, or nothing.

Fix the problems in the spreadsheet and re-run until it's clean.

## Step 5: Reconcile opening balances

Compare the imported totals with reality:

- total savings vs what members believe they have;
- cash in the system vs the bank and mobile money statements;
- open loans and their balances.

Record any adjustments with a clear note. This is where [double-entry books](/learn/double-entry-bookkeeping-for-savings-groups) earn their keep.

## Step 6: Run in parallel for one month

Keep the spreadsheet going for the go-live month and compare at month end. When they match, retire the spreadsheet (keep a read-only copy).

## Step 7: Bring members along

- Announce the change in the group chat, explaining **what's in it for members**: see your own balance, pay from your phone, apply for loans without waiting for a meeting.
- Send personal **invite links**.
- Keep the WhatsApp group for conversation — just not for record-keeping.

Use the "welcome a new member" message in our [WhatsApp templates](/learn/whatsapp-reminder-templates-for-dues).

## Common pitfalls

- Importing contributions **before** members exist.
- Mixed date formats (03/04/2026 — March or April?). Use YYYY-MM-DD.
- Forgetting historical **welfare payouts** and **loans**, so opening cash doesn't match.
- Switching mid-month.

## A four-week migration plan

| Week | Tasks |
|---|---|
| 1 | Choose go-live month; clean member list; agree member numbers |
| 2 | Prepare contribution history; do a test import; fix errors |
| 3 | Final import; reconcile opening balances; invite officials |
| 4 | Invite all members; run parallel with the spreadsheet; review at month end |

[Fundly](/signup) has a guided CSV import for members and contribution history with a validation dry run, and posts imported history into the books so your opening position is right from day one. See also [spreadsheet vs software](/learn/spreadsheet-vs-software-group-records).
