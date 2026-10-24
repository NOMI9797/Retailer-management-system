import { listReceiptsForDate } from "@/modules/daily-sales/actions";
import { listProducts } from "@/modules/products/actions";
import { listBankAccounts } from "@/modules/settings/bankAccounts.actions";
import { ReceiptsList } from "./ReceiptsList";

// Server Component: does the date-scoped fetch (today's or a picked
// day's receipts, plus the product/bank-account lists EditReceiptModal
// needs on open) and hands everything to ReceiptsList, the client leaf
// that owns Edit/Delete's local state — same split DailyLedgerSection/
// DailyLedgerColumns follow.
export async function ReceiptsListSection({ date }: { date: string }) {
  const [receipts, simpleProducts, grainProducts, bankAccounts] = await Promise.all([
    listReceiptsForDate(date),
    // includeInactive — EditReceiptModal must still resolve a
    // deactivated product an old receipt already used, same reasoning
    // as DailyLedgerSection's identical fetch.
    listProducts({ stockKind: "SIMPLE", pageSize: 500, includeInactive: true }),
    listProducts({ stockKind: "GRAIN", pageSize: 500, includeInactive: true }),
    listBankAccounts(),
  ]);

  return (
    <ReceiptsList
      receipts={receipts}
      products={[...simpleProducts.products, ...grainProducts.products]}
      bankAccounts={bankAccounts}
    />
  );
}
