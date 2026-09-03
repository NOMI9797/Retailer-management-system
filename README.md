# Arhti shop system — starter scaffold

This is structure, not features. It proves the folder layout, the
Prisma schema, and the module pattern (schema → actions → hooks →
components) work end to end, using Customers as the reference
implementation. Every other module follows the same shape.

## What's here

```
prisma/schema.prisma      Full schema — Shop, Customer, AccountType,
                           AccountTypeField, CustomerAccount,
                           AccountTransaction, Category, Product,
                           GrainBatch, DailySale, Expense. Every table
                           carries shopId for multi-tenancy.

src/lib/db.ts              Prisma client singleton
src/lib/tenant.ts          getCurrentShopId() — placeholder until
                           Clerk auth is wired in (build order step 1)
src/lib/utils.ts           cn(), formatMoney(), describeBalance()
                           — the balance sign convention lives here
                           once, not re-implemented per screen

src/modules/customers/     Reference module — fully implemented:
  schema.ts                 Zod validation
  actions.ts                Server Actions (create, find-or-create,
                             list) — all scoped by shopId
  hooks/useCustomers.ts      Client hook wrapping the read action

src/modules/{daily-sales,products,cash-flow,settings}/
                           Same folder shape, empty — build these next
                           following the customers module as the
                           pattern to copy.

src/components/shared/StatCard.tsx
                           One component powering every metric card,
                           matches the dashboard mockup theme.

src/app/(dashboard)/page.tsx
                           Placeholder dashboard proving StatCard
                           renders — replace with real Cash Flow /
                           Reports data once those modules exist.
```

## Getting started

1. `npm install`
2. Create a Postgres database (Neon or Supabase both work) and copy
   `.env.example` to `.env`, filling in `DATABASE_URL`.
3. `npm run db:migrate` — creates all tables from the schema.
4. Seed one `Shop` row manually (via `npm run db:studio` or a quick
   script) and put its id in `DEV_SHOP_ID` in `.env` — this stands in
   for real auth until Clerk is added.
5. `npm run dev` — the dashboard placeholder should render at
   `localhost:3000`.
6. Run `npx shadcn@latest init` to set up `src/components/ui` — this
   scaffold leaves that folder empty on purpose since the shadcn CLI
   generates it interactively.

## Next milestone

Following the product document's suggested build order: implement
Daily Sales (simple stock, cash-only path first) using the Customers
module as the template — schema.ts, actions.ts, a hook, then the
components. Once that loop works end to end, Customer Accounts and
Cash Flow come next.
