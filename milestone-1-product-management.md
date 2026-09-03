# Milestone 1 — Product & Stock Management

**Module:** `src/modules/products/`
**Depends on:** Prisma schema (already complete), Customers module (as reference pattern)
**Precedes:** Milestone 2 — Daily Sales

---

## Goal

Shopkeeper can fully manage what the shop sells — categories, simple stock
products, and grain stock with batch tracking — before any sale can happen
against it. This milestone is data-management only; nothing here posts to
Daily Sales, Customer Accounts, or Cash Flow yet. That connection is
Milestone 2.

---

## Scope

### 1. Categories
- Create, list, rename, deactivate a category.
- Used as the dropdown source when adding a product — shopkeeper never
  types a category freehand.

### 2. Simple stock products
Fields: category (dropdown), name, unit (dropdown, e.g. kg/packet/piece —
extensible list), cost price, sell price, quantity on hand.

- Create, edit, view. Every field editable after creation — no locked
  fields, per the system's full-access principle.
- List view with filters: by category, and a name search box.
- No stock movement logic yet — quantity is set directly by the
  shopkeeper for now (Daily Sales will decrement it automatically,
  starting Milestone 2).

### 3. Grain stock (batch-tracked)
A grain product (e.g. "Wheat") can hold multiple batches at once — some
shop-owned, some consigned by a specific customer.

- Create a grain product: category, name, unit, base rate.
- Add a batch to a grain product: quantity received, rate, owner
  (a toggle — "Shop-owned" or "Customer," with a customer picker in the
  second case).
- List batches per grain product, each showing: owner, quantity in,
  quantity sold (0 for all batches this milestone — sales aren't wired
  in yet), quantity remaining, rate, date received.
- Show an aggregate total (all batches combined) on the grain product's
  main view, so it reads like one simple stock number even though it's
  several batches underneath.

### 4. Units
- A simple shopkeeper-editable list (Settings-adjacent), reused as the
  unit dropdown on both simple and grain products.

---

## Explicitly out of scope for this milestone

- Daily Sales integration — batches don't deplete, simple stock quantity
  doesn't drop, no profit is calculated from a sale. (Milestone 2.)
- Posting to Customer Accounts (consignment payouts) — the batch just
  records who owns it; no money moves yet. (Milestone 2/3, once Daily
  Sales exists.)
- Reports, Dashboard, or Cash Flow touching stock data at all.
- Roles/permissions enforcement — build as if there's one shopkeeper
  user for now (`getCurrentShopId()` stub is enough).

Keeping this boundary tight matters: it's much easier to verify the
stock data model is correct in isolation than to debug it at the same
time as sales logic.

---

## Build order within this milestone

1. **`schema.ts`** — Zod schemas for Category, Product (simple), and
   GrainBatch. Validate: prices/rates must be positive, quantity can't
   be negative, required fields per the Prisma schema.
2. **`actions.ts`** — Server Actions, every one scoped through
   `getCurrentShopId()`:
   - `createCategory`, `listCategories`, `updateCategory`
   - `createProduct`, `updateProduct`, `listProducts` (with category
     filter + search)
   - `createGrainBatch`, `listGrainBatches(productId)`,
     `getGrainStockSummary(productId)` — returns total remaining across
     all batches
3. **Verify the data layer before touching UI** — create a category, a
   simple product, a grain product with two batches (one shop-owned, one
   owned by a test customer), confirm the numbers via Prisma Studio or
   direct action calls.
4. **`hooks/`** — `useCategories`, `useProducts` (accepting filter
   params), `useGrainBatches`.
5. **`components/`** — in this order:
   - `CategoryManager` (simple add/rename list, lives under Settings)
   - `ProductForm` (shared shape, but category-conditional: simple stock
     fields vs. grain product fields)
   - `ProductTable` — filterable list (category filter + search), used
     for simple stock
   - `GrainBatchForm` + `GrainBatchList` — add batch, show batches per
     grain product with owner/remaining columns
   - `StockSummary` — small component showing the aggregate quantity for
     a grain product (reusable later on the Dashboard)

---

## Definition of done

- [ ] Shopkeeper can add, rename, and deactivate a category.
- [ ] Shopkeeper can add a simple stock product with all fields, edit
      any field afterward, and find it via the category filter and
      search box in the list.
- [ ] Shopkeeper can add a grain product and log at least one shop-owned
      and one customer-owned batch against it.
- [ ] The grain product's summary view correctly totals quantity across
      all its batches.
- [ ] Every record created is scoped to the current shop — confirm by
      checking `shop_id` is set correctly in the database, not just that
      the UI "looks right."
- [ ] No hardcoded categories, units, or account types anywhere in the
      code — everything comes from the shopkeeper-managed lists.

---

## Next milestone

Milestone 2 — Daily Sales (simple stock, cash-only path first, per the
product document's suggested build order) — this is what actually
consumes the stock built here and starts posting to Cash Flow.
