# Milestone 2 — Daily Sales & Customer Accounts

**Modules:** `src/modules/customers/`, `src/modules/daily-sales/`, plus
Account Type management under Settings
**Depends on:** Milestone 1 (Products & Stock) — complete
**Precedes:** Milestone 3 — Cash Flow, Expenses, Reports & Dashboard

---

## Goal

A sale can happen, start to finish, exactly as designed: a customer is
found or created, a product is sold (simple stock or grain, including
consigned stock), stock and batches update, and the right ledger entries
land on the right customer accounts automatically. This is the module
that makes the whole "no duplication, one write updates everything"
principle from the product document real for the first time.

---

## Scope

### A. Settings — Account Types (new, required before Customers)

Customers can't be meaningfully assigned an account type until this
exists — it's the shopkeeper-managed list the Customer form's dropdown
pulls from (same pattern as Categories).

- Create/edit/deactivate an account type: name, code, whether it tracks
  quantity (grain) or just money (loan).
- Manage custom fields per account type: field name, label, type
  (text/number/date/dropdown), required or optional — the
  `AccountTypeField` table already in the schema.
- Seed one default account type ("Regular") on shop creation, so Daily
  Sales always has something to fall back to for a walk-in customer who
  isn't a borrower or consignor.

### B. Settings — Categories & Units (confirm complete)

Carried over from Milestone 1's schema-fix decision (`Unit` model,
`Category.isActive`). Confirm the full CRUD UI exists for both —
add, rename, deactivate — before moving on. If any part was deferred
during Milestone 1, finish it here; Daily Sales' product picker depends
on this being solid.

### C. Customers module

Fields (already in schema): name, phone, area (optional), notes, one or
more account types assigned at creation.

- Customer create/edit form, with account-type multi-select pulling
  from Settings.
- Customer list — filterable by area, searchable by name/phone.
- **Customer detail page** — the lifetime view described in the product
  document, made up of two distinct panels that must not be collapsed
  into one:
  - **Purchase history** — every item bought, at what price, on what
    date, pulled directly from that customer's `DailySale` +
    `DailySaleItem` records (not a copy — the same rows Daily Sales
    wrote, just queried and displayed here). Exists for every sale,
    cash or on-account.
  - **Account ledger** — running balance and transaction history per
    account (via the `describeBalance()` convention already in
    `lib/utils.ts`), from `AccountTransaction`. Only populated where
    money is actually outstanding — a fully-paid cash sale has
    purchase history but no ledger entry.
- **Full edit/delete privilege on a customer's past purchases lives
  here, not in Daily Sales.** Since an edit can touch stock, a grain
  batch, and a ledger balance all at once, this must correctly reverse
  and reapply those effects, not just overwrite the row — flag as
  connected to the audit-trail open decision already noted in the
  product document, and treat "silently wrong" as worse than
  "temporarily unbuilt."
- `findOrCreateCustomerByName` (already scaffolded in the reference
  module) — this is what Daily Sales calls when a new customer is
  typed in rather than picked from the list.

### D. Daily Sales module

The single screen described throughout the product document.

- **Sale entry**: one screen, one submit — but the customer field must
  use progressive disclosure, not one static form with everything
  visible at once:
  1. Shopkeeper starts typing the customer's name.
  2. If an existing customer matches, they're selected from the list —
     nothing else shown, straight to line items. This is the common
     case and must stay fast.
  3. Only if no match exists does the form expand to collect the rest
     (phone, area, account type) — and even then, only name is
     required; the other fields stay optional at the point of sale.
  Then: add one or more line items (product from simple or grain stock,
  quantity, actual price — may differ from catalog default), mark each
  line cash or on-account.
- **On submit, in one database transaction** (this must not partially
  apply):
  1. Create the `DailySale` + `DailySaleItem` rows.
  2. Simple stock → decrement `Product.quantity`.
  3. Grain stock → deplete from batches oldest-first by default (manual
     batch override is a nice-to-have, not required this milestone);
     update `GrainBatch.quantitySold`.
  4. If the depleted batch is consigned (`ownerCustomerId` is set) →
     create an `AccountTransaction` on that customer's Consignment
     account for their share of the sale (commission math — see open
     decision below).
  5. If the sale itself is on-account (not cash) → create an
     `AccountTransaction` on the buying customer's account for the
     amount owed.
- **Sales history** — a **summary-only** list of past `DailySale`
  records: customer name, date, item count, total bill. Filterable by
  date range and customer. This list is deliberately not where line-item
  detail lives — clicking a row can link through to that customer's
  detail page for the full purchase, rather than expanding inline here.
  Daily Sales stays a fast, scannable log; the Customer detail page
  (Section C) is where the full record lives.

### What's captured but not surfaced yet

Every sale item already stores `cashOrAccount` per the schema — that
data is correct and complete after this milestone, but the **Cash Flow
register screen** that reads and reconciles it is Milestone 3. Don't
build that UI now; just make sure the flag is being set correctly on
every write; posting into a real cash-flow ledger view comes next.

---

## Out of scope for this milestone

- Cash Flow / Daily Register screen (reconciliation, day close) —
  Milestone 3.
- Expenses, Reports & P&L, Shop Dashboard — Milestone 3.
- Manual batch selection at point of sale (oldest-first only, for now).
- Roles & Permissions enforcement.

---

## Open decision — needed before step D.4 specifically

**Commission calculation method.** This blocks the exact math for
"customer's share of the sale" when consigned stock sells. Recommended
default, unless you have a specific shop convention already: a
shop-wide default commission percentage, set in Settings, with an
optional override per grain batch (so a better-negotiated rate for one
farmer's batch isn't forced to match everyone else's). If you'd rather
Claude ask you when it hits this step instead of assuming, say so
explicitly in the prompt — otherwise it's reasonable to have it build
against this default and flag it clearly in the PR/summary.

---

## Build order within this milestone

1. Account Types + Account Type Fields (Settings) — schema→actions→
   Server Components→the one client leaf (the form modal). Seed the
   default "Regular" type.
2. Confirm Categories/Units are fully done; close any gaps from
   Milestone 1.
3. Customers module — create/edit, list with filters, `findOrCreate`,
   then the customer detail/ledger page.
4. **Verify the data layer before building Daily Sales UI** — manually
   create a customer, an account, and a transaction; confirm the
   balance math reads correctly on the detail page.
5. Daily Sales — schema, then the transactional `createDailySale`
   action (this is the one to test hardest — partial failure here
   means incorrect stock or money, worse than the feature not existing
   yet), then the entry screen and sales history list.
6. End-to-end test: one cash sale from simple stock, one on-account sale
   from simple stock, one sale from a shop-owned grain batch, one sale
   from a consigned grain batch — confirm stock, batch quantities, and
   the consignor's account balance are all correct after each.

---

## Definition of done

- [ ] Account types and their custom fields are fully shopkeeper-
      manageable from Settings; no hardcoded types remain anywhere.
- [ ] A customer can be created directly, or auto-created from Daily
      Sales when typed fresh — both paths produce the same kind of
      record, no duplication.
- [ ] Customer detail page shows purchase history (every item bought,
      every price) and the account ledger (running balance per account)
      as two distinct panels, both correct.
- [ ] Daily Sales history shows summary rows only (customer, date,
      items, total) — full line-item detail lives on the customer's
      page, not duplicated in the Daily Sales list.
- [ ] A sale against simple stock decrements quantity correctly.
- [ ] A sale against a shop-owned grain batch decrements that batch and
      books full profit to the shop.
- [ ] A sale against a consigned grain batch decrements that batch
      *and* posts a transaction to the correct customer's account for
      their share.
- [ ] An on-account sale posts a transaction to the buying customer's
      account; a cash sale does not.
- [ ] All of the above happens inside one database transaction per
      sale — confirm by testing a failure mid-way (e.g. invalid
      product) and checking nothing partially saved.
- [ ] Every table involved remains correctly scoped by `shop_id`.

---

## Next milestone

Milestone 3 — Cash Flow / Daily Register, Expenses, Reports & P&L, and
the Shop Dashboard: the modules that read everything built here and in
Milestone 1, and turn it into the day-close reconciliation and
profit/loss picture from the product document.
