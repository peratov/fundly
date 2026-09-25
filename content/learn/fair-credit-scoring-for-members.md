---
title: "Fair credit scoring for savings group members (with a simple model)"
description: How to score members' creditworthiness fairly and transparently — five habits, 1,000 points, and how the score sets borrowing limits without favouritism.
category: loans-and-credit
tags: [credit score, loans, fairness, eligibility]
published: 2026-07-07
updated: 2026-09-16
faqs:
  - q: Should we use AI to score members?
    a: Scores that decide who can borrow should be explainable, so members can see why and improve. A simple rules-based score is easier to trust. AI can help write a plain-English explanation, but it shouldn't invent the number.
  - q: Can a member improve their score?
    a: Yes — that's the point. Paying on time, contributing a bit more, repaying loans cleanly and attending meetings all move the score, and members should be able to see which part is holding them back.
---

When lending decisions depend on who knows whom, the loudest members borrow the most and quiet, reliable members wait. A transparent credit score fixes that: everyone is judged on the same habits, and everyone can see where they stand.

## What makes a score fair

- **Based on behaviour inside the group**, which the group can verify.
- **Explainable** — each point traces back to a rule.
- **Improvable** — members know what to do to raise it.
- **Applied the same way to everyone**, including officials.

## A simple 1,000-point model

Five habits, 200 points each:

| Pillar | What it measures | Points |
|---|---|---|
| **Membership length** | How long they've been a member | 0 (under 6 months) → 50 → 100 → 150 → 200 (3+ years) |
| **Contribution size** | Average contribution vs the minimum | 100 at the minimum, 150 above it, 200 at more than double |
| **Payment regularity** | Missed and late payments in the last 12 months | 200 if clean; 100 with one miss or several lates; 50 with two or more misses |
| **Loan repayment** | Record on past loans | 200 clean or no history; 100 if penalties were applied; 50 if a loan went overdue or defaulted |
| **Participation** | Meeting attendance | attendance % × 2 |

A member scoring 800+ is typically a very safe borrower; below 500, most groups would decline standard loans or require a special review.

Two design details matter:

- **Regularity looks at the last 12 months only**, so old mistakes stop counting once someone has shown a year of good behaviour.
- **Only loans that were actually paid out** count towards repayment history. A pending application shouldn't raise or lower anyone's score.

## From score to borrowing limit

A practical formula:

> limit = savings × multiplier × max(0.5, score ÷ 1000), kept between a minimum and maximum

With savings of GHS 4,000, a multiplier of 3 and a score of 800: 4,000 × 3 × 0.8 = **GHS 9,600**. A score of 400 would give 4,000 × 3 × 0.5 = GHS 6,000 — but the eligibility rules might still require a special review. See [how to run loans in a savings group](/learn/how-to-run-loans-in-a-savings-group).

## Show members their breakdown

The score only builds trust if members can see it. Show each pillar with a note like *"2 missed, 1 late in the last 12 months"* so the path to a better score is obvious.

## Using the score in committee reviews

The score doesn't replace judgement — it informs it. A credit committee should see the score, the breakdown, recent contributions and the eligibility checklist side by side, and record notes explaining its recommendation. Special cases (a strong member with a temporary dip) can go through a documented **special review**.

## Worked example: two members, same savings

Both Edem and Peace have GHS 4,000 in savings.

| Pillar | Edem | Peace |
|---|---|---|
| Membership length | 200 (5 years) | 200 (6 years) |
| Contribution size | 200 (avg well above minimum) | 150 (above minimum) |
| Regularity | 200 (clean) | 50 (two missed this year) |
| Loan repayment | 200 (clean) | 50 (loan overdue) |
| Participation | 180 (90%) | 150 (75%) |
| **Total** | **980** | **600** |

With a 3× multiplier, Edem's limit is capped at the fund's maximum; Peace's would be lower — and, more importantly, her overdue loan means she isn't eligible for a new one until it's back on track. Both can see exactly why.

[Fundly](/signup) calculates this score automatically from each member's real record, shows members their own breakdown and limit, and gives the credit committee the full profile on every application.
