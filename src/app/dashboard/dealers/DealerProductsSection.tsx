import {
  getDealerProductPurchaseSummary,
  listDealerProductPurchases,
  listDealers,
  listDealerSales,
  getDealerUdhaarTotals,
} from "@/modules/dealers/actions";
import { listProducts } from "@/modules/products/actions";
import { listBankAccounts } from "@/modules/settings/bankAccounts.actions";
import { DealerSummaryCards } from "./DealerSummaryCards";
import { DealerRecordsTabs } from "@/modules/dealers/components/DealerRecordsTabs";
import { RecordDealerProductPurchaseModal } from "@/modules/dealers/components/RecordDealerProductPurchaseModal";

// Dealer → Products tab — bulk Simple-stock bought from PRODUCTS
// dealers. Overview stats and the full purchase history (each row
// links to that dealer's own detail page, where their running
// balance and "Pay dealer" action live). Not cached — a shopkeeper
// recording a purchase right here expects this page to reflect it on
// the very next load, same reasoning as every other "nothing cached"
// financial overview in the app.
export async function DealerProductsSection() {
  const [
    summary,
    purchasesResult,
    dealers,
    products,
    bankAccounts,
    sales,
    udhaar,
  ] = await Promise.all([
    getDealerProductPurchaseSummary(),
    listDealerProductPurchases(),
    listDealers({ type: "PRODUCTS" }),
    listProducts({ stockKind: "SIMPLE", pageSize: 500 }),
    listBankAccounts(),
    listDealerSales("SIMPLE"),
    getDealerUdhaarTotals("PRODUCTS"),
  ]);

  return (
    <>
      <DealerSummaryCards udhaar={udhaar} totalSpent={summary.totalSpent} />

      <DealerRecordsTabs
        action={
          <RecordDealerProductPurchaseModal
            dealers={dealers}
            products={products.products}
            bankAccounts={bankAccounts}
          />
        }
        credit={sales}
        debit={purchasesResult.purchases.map((p) => ({
          id: p.id,
          date: p.purchaseDate,
          dealerId: p.dealerId,
          dealerName: p.dealerName,
          productName: p.productName,
          quantity: p.quantity,
          unitName: p.unitName,
          rate: p.costPrice,
          amount: p.amount,
          payment:
            p.paymentMethod === "CREDIT"
              ? "Udhaar"
              : p.paymentMethod === "ACCOUNT"
                ? "Bank"
                : "Cash",
          paymentTone:
            p.paymentMethod === "CREDIT"
              ? "credit"
              : p.paymentMethod === "ACCOUNT"
                ? "account"
                : "cash",
        }))}
      />
    </>
  );
}
