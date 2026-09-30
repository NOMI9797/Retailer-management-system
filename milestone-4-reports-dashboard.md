# Milestone 4 — Reports & P&L, Shop Dashboard

**Modules:** `src/modules/reports/`, updates to the existing Dashboard
page
**Depends on:** Milestones 1–3, all complete and their numbers
hand-verified
**Precedes:** Roles & Permissions (per the original product document's
build order)

---

## Goal

Turn everything built so far into the picture the shopkeeper actually
wants to see: how much did the shop make, over any period, and what's
the current state of cash and who-owes-who at a glance on the
Dashboard. Nothing in this milestone writes new data — it's the first
module that's pure aggregation across Daily Sales, Products, Expenses,
Cash Flow, and Customer Accounts.

---

## Scope decision, stated up front

**Seasonal P&L groups by the existing `DailySale.season` field as-is —
no season management UI this milestone.** Defining, editing, or setting
date ranges for seasons is a separate, larger feature; this milestone
just aggregates by whatever string already sits on each sale. Full
season management is a reasonable future milestone if it turns out to
be needed, not something to build speculatively now.

---

## Required schema consideration — flag before Claude Code hits it

`DailySaleItem` currently stores `actualPrice` (sell price) but not the
product's cost price *at the time of the sale*. If a product's
`costPrice` ever changes later, every historical report recalculates
past profit using today's cost — not the cost that was actually true
when that sale happened. This silently misstates historical P&L.

**Fix**: add a `costPriceAtSale` field to `DailySaleItem`, captured at
the moment `createDailySale` runs (Milestone 2's transaction), snapshot
from the product's current cost price at that instant.

**Open decision on existing data**: sales recorded before this field
existed have no historical cost snapshot. Two options — backfill them
using each product's *current* cost price as an approximation (simple,
slightly inaccurate for any product whose cost has since changed), or
leave pre-milestone sales with a null/unknown COGS and have reports
clearly show "cost data unavailable" for that period rather than a
number that looks precise but isn't. The second option is more honest
and is the recommended default unless you have a reason to prefer the
approximation.

---

## Scope

### A. Reports & P&L

For any selected period (day / month / year / season):
- **Revenue** — sum of `DailySaleItem.actualPrice × quantity` for sales
  in that period.
- **Cost of goods sold** — sum of `costPriceAtSale × quantity` (see
  schema note above).
- **Gross profit** — revenue minus COGS.
- **Expenses** — sum of `Expense.amount` in that period.
- **Net profit** — gross profit minus expenses.

Views:
- **Daily** — single day, or a date range shown day by day.
- **Monthly** — aggregated per month, with a simple month picker.
- **Yearly** — aggregated per year.
- **Seasonal** — grouped by `DailySale.season`, per the scope decision
  above.

Each view should show the same shape of numbers (revenue, COGS, gross
profit, expenses, net profit) so switching between daily/monthly/
yearly/seasonal feels like the same report at a different zoom level,
not four different screens.

### B. Shop Dashboard — replace the placeholders

The scaffold's `StatCard`s (`src/app/(dashboard)/page.tsx`) are
currently hardcoded to Rs 0. Wire them to real data:

- **Today's sales** — from Daily Sales, today's date.
- **Cash in hand** — from today's Cash Flow register (expected closing,
  or actual closing if the day is already closed).
- **Customers owe** — sum of positive balances across all
  `CustomerAccount`s where the account type is not Consignment (i.e.
  Regular, Udhar-style accounts where the customer owes the shop).
- **Shop owes farmers** — sum of negative balances specifically on
  Consignment-type accounts.

The last two are **new aggregation queries**, not just reading an
existing single value — this is real logic to get right, not a simple
lookup. Reuse the `describeBalance()` sign convention already
established rather than inventing new balance-direction logic here.

**Caching reminder, since this connects to the earlier caching
milestone**: none of this Dashboard data should be cached with
`unstable_cache` — Daily Sales, Cash Flow, and Customer Accounts all
change constantly, and a shopkeeper glancing at the Dashboard needs the
current number, not a stale one from a few minutes ago. This was
already the rule established when caching was set up; this milestone
doesn't change it, just worth restating since the Dashboard is exactly
the kind of visible, glanceable page where staleness would be most
noticed.

---

## Out of scope for this milestone

- Season management UI (defining/editing seasons) — see scope decision
  above.
- Exporting reports (PDF/Excel) — not requested yet, don't build ahead
  of an actual need.
- Roles & Permissions — next after this, per the original build order.

---

## Build order

1. Add `costPriceAtSale` to `DailySaleItem`; update `createDailySale`
   to snapshot it. Decide and implement the backfill approach for
   existing sales per the open decision above.
2. **Verify P&L math by hand before building any UI** — pick one day
   with a few known sales and expenses, hand-calculate revenue, COGS,
   gross profit, and net profit, then confirm the aggregation query
   matches exactly. This is the step most worth being strict about —
   same reasoning as Cash Flow's aggregation in Milestone 3.
3. Build daily → monthly → yearly → seasonal views, in that order,
   reusing the same underlying aggregation with a different date-range
   grouping each time rather than four separate implementations.
4. Wire the Dashboard's four `StatCard`s to real queries, confirming
   the two new balance-aggregation queries (customers owe / shop owes
   farmers) against hand-checked totals from the Customers module.

---

## Definition of done

- [ ] `costPriceAtSale` is captured on every new sale going forward.
- [ ] Daily P&L for a hand-picked test day matches a manual calculation
      exactly.
- [ ] Monthly, yearly, and seasonal views show correctly aggregated
      totals, confirmed against the daily numbers they're built from.
- [ ] Dashboard shows real, current numbers — not placeholders — for
      all four stat cards.
- [ ] "Customers owe" and "shop owes farmers" totals match a manual
      sum across the Customers module's account balances.
- [ ] None of this data is cached — confirmed by checking the actual
      code, not just assuming the earlier caching rule was followed.
- [ ] Everything remains scoped by `shop_id`.

---

## Next milestone

Roles & Permissions — fixed Owner/Admin/Staff roles via Clerk, per the
original product document's build order, now that every module a role
might need to restrict access to actually exists.
