# Arhti Shop Management System — Product & Architecture Document

**Status:** Planning / pre-build
**Type:** Multi-tenant SaaS (single shop first, multi-shop from day one in the data model)

---

## 1. Overview

A management system for arhti (commission agent) retail shops — businesses that combine
normal retail sales with commission-based selling of agricultural produce on behalf of
farmers (consignment). The system tracks products and stock, customer relationships
(including loans and consignment accounts), daily sales, cash flow, expenses, and
profit/loss — all from a single daily-use screen, with a shopkeeper-configurable settings
layer so the business rules (categories, account types, custom fields) can evolve without
code changes.

**Core design principle:** one customer, one identity, many linked accounts. No data is
ever entered twice — a sale entered once in Daily Sales automatically updates the
customer's lifetime record, the relevant stock, and the cash flow register.

---

## 2. Goals

- Full day-to-day usability for a single shopkeeper with no technical background.
- Every list (categories, account types, units, custom fields) is shopkeeper-editable
  from the UI — no hardcoded business rules.
- Accurate, automatic profit/loss and cash flow — no manual reconciliation.
- Built as multi-tenant SaaS from the start (`shop_id` on every table), even though the
  first real user is a single shop.
- Filters and search on every list-heavy screen.

---

## 3. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend + Backend | Next.js (App Router) | One codebase; Server Actions remove need for a separate API layer; good for data-heavy dashboards |
| Database | PostgreSQL | Relational integrity for linked ledgers; correct decimal handling for money; transactions for atomic multi-table writes |
| ORM | Prisma | Type safety across a schema with many linked tables; clean migrations |
| Validation | Zod | Validates dynamic/custom fields defined by the shopkeeper |
| UI | Tailwind CSS + shadcn/ui | Owned component code (not a locked-in library); fast to build filterable tables and forms |
| Auth | Clerk | Built-in Organizations feature maps directly to "Shop"; handles multi-staff logins and roles per shop |
| Hosting (app) | Vercel | Native Next.js support |
| Hosting (database) | Neon or Supabase (Postgres) | Serverless Postgres, generous free tier, scales later |
| Multi-tenancy | Shared DB, `shop_id` on every table + Prisma middleware + Postgres Row-Level Security | Standard SaaS pattern at this scale; RLS is a database-level safety net against data leaking between shops |
| Billing (future) | Stripe | Not needed at launch; add when onboarding paying shops |

---

## 4. Module List (high-level)

1. Settings / Admin (configuration layer)
2. Customers
3. Products & Stock (Simple stock + Grain/Consignment stock)
4. Daily Sales
5. Customer Accounts (lifetime ledger)
6. Cash Flow / Daily Register
7. Expenses (daily + monthly)
8. Reports & P&L
9. Shop Dashboard
10. Shops / Tenancy (cross-cutting, multi-tenant SaaS layer)
11. Roles & Permissions (cross-cutting, planned addition — not in initial build)

---

## 5. Module Detail

### 5.1 Settings / Admin
Configuration layer. Nothing here is a daily-use screen — this is where the shopkeeper
defines the vocabulary the rest of the app uses.

- **Categories** — for products (e.g. Groceries, Grains, Household).
- **Account types** — the list a customer's account can be assigned from (e.g. Regular,
  Loan, Consignment — Wheat). Shopkeeper can add new types any time, no code change.
- **Units** — kg, packet, piece, liter, etc. — also extensible.
- **Custom fields** — per account type, the shopkeeper defines extra fields (e.g.
  "guarantor name" for Loan, "crop variety" for Consignment) and marks each required or
  optional.
- **Areas** — city → sub-area hierarchy, used as an optional customer attribute.

### 5.2 Customers
Core identity record. Minimal by design — everything else (accounts, history) hangs off
this via relationships, never duplicated.

Fields: name, phone, area (optional, FK to Areas), notes, created date, one or more
linked account types (selected from the Settings list, not created ad hoc).

### 5.3 Products & Stock
Two stock types under one module:

- **Simple stock** — everyday shop items. Category, name, unit, cost price, selling
  price (default — actual sale price can differ per transaction), quantity on hand.
  Profit per sale = (sale price − cost price) × quantity, calculated automatically.
- **Grain stock (consignment-aware)** — wheat, channa, etc. Tracked in batches rather
  than one number, because the same shelf can hold stock the shop owns outright and
  stock a farmer has consigned. Each batch records: source (shop-owned or a specific
  customer), quantity received, quantity sold, quantity remaining, rate (grain prices
  move during the season).

### 5.4 Daily Sales
The single screen the shopkeeper works from for every transaction, whether the customer
is new or returning.

Entry fields: date/season, customer (existing, searchable, or new — auto-creates a
Customer record), product(s) — from catalog or manually added, actual sale price (may
differ from catalog default), quantity, payment type (cash or on-account).

Behavior on submit:
- New customer → Customer Accounts record created automatically.
- Product from simple stock → stock quantity decremented, profit booked to the shop.
- Product from grain stock, shop-owned batch → same as above.
- Product from grain stock, consigned batch → quantity decremented from that customer's
  batch; the customer's share of the sale posts as a transaction to their Consignment
  account; the shop's commission books as shop profit. *(Commission calculation method —
  fixed %, fixed per-kg, or margin — still to be confirmed.)*
- Every transaction posts to Cash Flow (cash or on-account) and to Customer Accounts.

### 5.5 Customer Accounts
The lifetime view per customer — not a separate data-entry screen, a rollup of every
transaction posted from Daily Sales and other modules. Shows: all accounts held by this
customer (by type), running balance per account, full transaction history.

Balance convention: each account tracks a single running number from its ledger entries.
Positive = customer owes the shop. Negative = shop owes the customer. Same rule for every
account type — no special-casing per type in code.

### 5.6 Cash Flow / Daily Register
Reconciliation core. Every cash-affecting event across the system (a sale, a loan given
or repaid, a consignment payout, an expense) posts here tagged cash or on-account. At day
close, shows what physical cash should be in hand vs. what's on the books.

### 5.7 Expenses
Daily and monthly expense entry (labour, utilities, etc.), each tagged cash or
on-account, posting to Cash Flow the same way sales do.

### 5.8 Reports & P&L
Pure rollup — no data entered here directly. Daily, monthly, seasonal, and yearly
profit/loss, derived from Daily Sales + Expenses + Cash Flow + Customer Accounts.

### 5.9 Shop Dashboard
Day-close snapshot: cash position, account (receivables/payables) position, today's
profit/loss — computed, not stored redundantly.

### 5.10 Shops / Tenancy (cross-cutting)
Every table above carries a `shop_id`. Not a screen the shopkeeper sees directly (except
perhaps a "my shop" settings page) — this is the isolation layer that makes the system
safe to run multiple shops on one shared database.

### 5.11 Roles & Permissions (planned, not in initial build)
An independent layer added on top of Shops / Tenancy — `shop_id` answers "whose data is
this," roles answer "what can this specific user do within their shop's data." The two
don't overlap, which is why this can be added later without reworking anything already
built.

- **Built on Clerk Organizations** — an Organization maps to a Shop; Clerk supports
  custom roles and granular permissions natively, so this isn't built from scratch.
- **Start with fixed roles**, expand only if needed:
  - **Owner** — full access to every module, including Settings.
  - **Admin** — full access to daily operations (Sales, Products, Customer Accounts);
    view-only on Reports and Settings.
  - **Staff** — can create Daily Sales entries; view-only on Products and Customer
    Accounts; no access to Reports or Settings.
- **Fully configurable roles** (a "Roles" list in Settings, same pattern as Account
  Types, where the shopkeeper defines custom roles and ticks module/action permissions)
  is a possible later upgrade — only worth building if real shopkeepers ask for more
  granularity than the fixed roles above.
- **Enforcement must live server-side.** Every Server Action that writes data checks the
  acting user's role before proceeding — hiding a button in the UI is not sufficient on
  its own, since the underlying action must also refuse the write.

Example permission matrix for the fixed-role starting point:

| Role | Daily Sales | Products & Stock | Customer Accounts | Reports | Settings |
|---|---|---|---|---|---|
| Owner | Full | Full | Full | Full | Full |
| Admin | Full | Full | Full | View | View |
| Staff | Create only | View only | View only | No access | No access |

---

## 6. Module Dependencies

| Module | Depends on |
|---|---|
| Customers | Settings (account types, areas) |
| Products & Stock | Settings (categories, units) |
| Daily Sales | Customers, Products & Stock |
| Customer Accounts | Daily Sales (posts transactions here) |
| Cash Flow | Daily Sales, Customer Accounts (loan/consignment payouts), Expenses |
| Expenses | Settings (expense categories, if added later) |
| Reports & P&L | Cash Flow, Daily Sales, Expenses, Customer Accounts |
| Shop Dashboard | Cash Flow, Reports & P&L |
| All of the above | Shops / Tenancy (every table scoped by `shop_id`) |
| Roles & Permissions | Shops / Tenancy (roles are scoped per shop); enforced inside every module's Server Actions |

No module holds a duplicate copy of another module's data — everything downstream is
either a direct transaction reference or a computed rollup.

---

## 7. Core Flows

**Flow A — New customer, simple sale**
1. Shopkeeper opens Daily Sales, types customer name (not found) → new Customer record
   created, Customer Accounts entry created automatically.
2. Selects product(s) from catalog, adjusts price if needed, selects cash or on-account.
3. On submit: stock quantity drops, profit calculated, transaction posted to Customer
   Accounts and Cash Flow.

**Flow B — Consigned grain sale**
1. Farmer's wheat was previously logged as a consignment batch under Grain stock.
2. A customer buys wheat in Daily Sales; system pulls from the farmer's batch (oldest
   batch first, by default — manual override available).
3. On submit: batch quantity drops, farmer's share posts as a transaction to his
   Consignment account (shop owes him), shop's commission books as shop profit,
   sale appears in Daily Sales as normal.

**Flow C — Day close**
1. Shopkeeper opens Shop Dashboard at close of business.
2. System shows expected cash in hand (from Cash Flow's cash-tagged entries) vs. actual
   count, plus total on-account movement for the day.
3. Any expenses entered during the day are already reflected, since they posted to Cash
   Flow at entry time.

---

## 8. Non-Functional Requirements

- **Full editability**: every field, on every module, is editable by the shopkeeper —
  stock quantities, prices, customer info, past entries (with an audit trail recommended
  for corrections).
- **Optional/mandatory fields**: custom fields (Settings → account types) carry a
  required/optional flag, enforced at entry time.
- **Filters**: every list screen (customers, products, transactions) needs search and
  filter controls — by date, category, account type, area, status.
- **Multi-tenant safety**: no shop can ever see another shop's data, enforced at both the
  application layer (Prisma middleware) and the database layer (Postgres RLS).

---

## 9. Open Decisions (to confirm before building)

- **Commission calculation** for consigned sales — fixed percentage, fixed amount per
  unit, or margin-based. Affects the exact transaction math in Daily Sales.
- **Batch depletion rule** — strict oldest-first, or shopkeeper picks the batch per sale.
- **Audit trail** — whether edits to past entries are logged (recommended for a
  finance-tracking system, not yet scoped in detail).
- **Roles & Permissions rollout timing** — fixed roles (Owner/Admin/Staff) are deferred
  to step 9 of the build order; confirm before then whether any shop needs multi-user
  login at launch, which would move this earlier.

---

## 10. Suggested Build Order

1. Shops / Tenancy scaffolding + Auth (Clerk) — even if testing with one shop only.
2. Settings module (categories, account types, units, custom fields) — everything else
   depends on this existing first.
3. Customers + Products & Stock (simple stock only).
4. Daily Sales (simple stock path only, cash-only) — get the core loop working end to
   end before adding complexity.
5. Customer Accounts + Cash Flow (on-account payments, running balances).
6. Grain stock with batch tracking + consignment flow.
7. Expenses, Reports & P&L, Shop Dashboard.
8. Multi-shop enforcement testing, billing (Stripe) when ready to onboard other shops.
9. Roles & Permissions (fixed Owner/Admin/Staff roles via Clerk) — added once a shop
   needs more than one login; not required for a single-user shop.
