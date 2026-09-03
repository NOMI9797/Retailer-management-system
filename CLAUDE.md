We're now moving into implementation. Before writing any code, read through:
1. docs/product-document.md — the full module list, dependencies, and flows.
2. CLAUDE.md — the codebase conventions and current state.
3. The milestone document I'll provide separately — this tells you exactly which
   module we're building right now, its specific requirements, and what "done"
   looks like for this milestone. Treat it as the source of truth for scope —
   if it conflicts with something in the product document, the milestone
   document wins for this task, but flag the conflict rather than silently
   picking one.

How to implement each module:
- Follow the existing pattern from the Customers module: schema.ts (Zod
  validation) → actions.ts (Server Actions, always scoped through
  getCurrentShopId()) → components/ (UI last, after the data layer works).
- Don't build UI before the Server Actions and schema are working — verify the
  data layer first (you can test actions directly or via Prisma Studio) before
  wiring up forms and screens.
- Data loading is server-first: page components under src/app/ are async
  Server Components that call the module's actions directly during render
  and pass the results down as props. Client Components only receive data —
  they never fetch a page's display data themselves (no useEffect + action
  call on mount). After a write, call router.refresh() to re-run the
  server fetch rather than re-fetching client-side.
- Hooks (hooks/) are reserved for genuine client-side interactive state that
  a Server Component can't express — live search-as-you-type, a debounced
  filter, form-local UI state. If nothing in a module needs that, it's fine
  for hooks/ to stay empty. Server Actions still handle every write either
  way, called directly from the client form that triggers them.
- Business logic (profit calculation, balance math, cash flow posting) goes in
  lib/ or module-level functions, never inline inside a component.
- Every new table or field must respect shop_id scoping — no exceptions, even
  for fields that feel "obviously fine."
- Match the UI theme already established (teal primary, amber for grain/
  consignment states, coral for money-owed-to-farmer) rather than introducing
  new colors ad hoc — reuse StatCard and existing component patterns before
  creating new ones.
- If the milestone document underspecifies something (e.g. exact validation
  rules, edge cases), ask rather than guessing — these are financial records,
  and a wrong assumption compounds into every module downstream of it.

Once you've read all three documents, give me a short summary of your
understanding of the current state and the overall system — then stop and wait.
I'll tell you which specific module or task to start on next.