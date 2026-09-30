# Milestone 3 — Cash Flow & Expenses

**Modules:** `src/modules/expenses/`, `src/modules/cash-flow/`
**Depends on:** Milestone 1 (Products & Stock), Milestone 2 (Daily Sales &
Customer Accounts) — both complete
**Precedes:** Milestone 4 — Reports & P&L, Shop Dashboard

---

## Goal

Turn the cash/on-account flags already being captured on every sale,
expense, and account transaction into an actual daily cash register —
what should be in the till, what's actually there, and where the
difference is. This is the "how much real physical money came in, how
much went out" tracking from the original product requirements.

---

## Scope

### A. Expenses (build first)

- Create/edit/delete an expense: description, amount, date, cash or
  on-account.
- List view, filterable by date range.
- Every expense must carry the cash/on-account flag correctly — Cash
  Flow depends on it being set right from day one.

### B. Cash Flow / Daily Register

**Aggregation, not new data entry.** Nearly everything this reads
already exists from Milestones 1–2 — `DailySaleItem.cashOrAccount`,
`Expense.cashOrAccount`, `AccountTransaction.cashOrAccount`. This
module's job is pulling those together correctly for a given day, not
creating new write paths.

For a given date:
1. Sum cash-tagged `DailySaleItem` amounts → cash in.
2. Subtract cash-tagged `Expense` amounts → cash out.
3. Subtract cash-tagged `AccountTransaction` rows where direction is
   OUT (a loan given, a consignment payout) → cash out.
4. Add cash-tagged `AccountTransaction` rows where direction is IN (a
   loan repayment) → cash in.
5. Expected cash in hand = opening balance + cash in − cash out.

**Day close**: shopkeeper enters the actual counted cash for the day.
System shows the variance (actual − expected). Saving day close records
the actual closing balance, which becomes the next day's opening
balance.

**Historical register** — past days' closes, filterable by date, each
showing opening balance, expected vs. actual closing, and variance.

---

## Required schema addition — flag before Claude Code hits it

There is currently **no table tracking daily opening/closing cash
balances** — this doesn't exist yet in `schema.prisma`. Day close
can't work without somewhere to store "what did we actually count" and
carry it forward as tomorrow's opening balance.

Add a `DailyCashRegister` model, shop-scoped, roughly:

```prisma
model DailyCashRegister {
  id               String   @id @default(uuid())
  shopId           String
  shop             Shop     @relation(fields: [shopId], references: [id])
  date             DateTime
  openingBalance   Decimal  @db.Decimal(14, 2)
  expectedClosing  Decimal  @db.Decimal(14, 2)
  actualClosing    Decimal? @db.Decimal(14, 2)
  variance         Decimal? @db.Decimal(14, 2)
  closedAt         DateTime?

  @@unique([shopId, date])
}
```

This is presented as a starting point, not a final answer — if Claude
Code proposes a different shape (e.g. storing variance as computed
rather than persisted), that's a reasonable alternative worth
considering rather than reflexively matching the draft above. The
`@@unique([shopId, date])` matters regardless of shape: one register
entry per shop per day, no duplicates.

---

## Out of scope for this milestone

- Reports & P&L (daily/monthly/seasonal/yearly profit-loss views) —
  Milestone 4.
- Wiring real numbers into the Shop Dashboard placeholder — Milestone 4.
  The Dashboard's `StatCard`s can stay at their current placeholder
  values until Cash Flow's numbers are proven correct here first.
- Editing past sales/expenses to correct historical cash flow — that's
  the same edit/reversal complexity flagged back in Milestone 2's
  open decision, still unresolved, not this milestone's problem to
  solve.

---

## Open decision — opening balance for day one

The very first day this feature runs, there's no prior day's closing
balance to carry forward. Recommended: let the shopkeeper manually set
an opening balance the first time Cash Flow is used (a one-time setup
step), after which every subsequent day's opening comes automatically
from the previous day's actual closing. If a day is skipped entirely
(shop closed, no entries), decide whether the next day's opening simply
carries forward from the last recorded closing — this is the reasonable
default unless you tell Claude Code otherwise.

---

## Build order within this milestone

1. Expenses — schema→actions→Server Components→the add/edit form
   (the one client leaf).
2. **Verify the Cash Flow aggregation logic before building its UI** —
   manually create a few cash and on-account sales, expenses, and
   account transactions for one date, then confirm the computed
   "expected cash in hand" is correct by hand-checking the math. This
   is the step most worth being strict about — an aggregation bug here
   produces a wrong number that looks plausible, which is worse than
   an obviously broken feature.
3. Add the `DailyCashRegister` model + migration.
4. Day close screen — enter actual count, show variance, save.
5. Historical register list.

---

## Definition of done

- [ ] Every expense correctly carries cash/on-account.
- [ ] Expected cash in hand for a given day matches a manual
      hand-calculation from the same day's sales, expenses, and account
      transactions.
- [ ] Day close correctly saves actual closing balance and variance.
- [ ] The next day's opening balance automatically equals the prior
      day's actual closing.
- [ ] Historical register is viewable and filterable by date.
- [ ] Everything remains scoped by `shop_id`, including the new
      `DailyCashRegister` table.

---

## Next milestone

Milestone 4 — Reports & P&L (daily, monthly, seasonal, yearly) and
wiring the Shop Dashboard's placeholder stat cards to real data — both
now safe to build on top of a Cash Flow module whose numbers have
already been verified correct.
