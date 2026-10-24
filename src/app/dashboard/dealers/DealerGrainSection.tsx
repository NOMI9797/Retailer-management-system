import {
  getDealerGrainPurchaseSummary,
  listDealerGrainBatches,
  listDealers,
  listDealerSales,
  getDealerUdhaarTotals,
} from "@/modules/dealers/actions";
import { listProducts } from "@/modules/products/actions";
import { listBankAccounts } from "@/modules/settings/bankAccounts.actions";
import { DealerSummaryCards } from "./DealerSummaryCards";
import { DealerRecordsTabs } from "@/modules/dealers/components/DealerRecordsTabs";
import { RecordDealerGrainPurchaseModal } from "@/modules/dealers/components/RecordDealerGrainPurchaseModal";

// Dealer → Grain tab — bulk grain bought from GRAIN dealers. Overview
// stats and the full purchase history (each row links to that
// dealer's own detail page, where their running balance and "Pay
// dealer" action live). Every batch recorded here already flows into
// the Grain page's normal Own-stock figures (see
// createDealerGrainPurchase — a dealer batch is always shop-owned),
// so this tab is purely the dealer-Udhaar/purchase-history view, not
// a second stock ledger.
export async function DealerGrainSection() {
  const [summary, batches, dealers, products, bankAccounts, sales, udhaar] =
    await Promise.all([
      getDealerGrainPurchaseSummary(),
      listDealerGrainBatches(),
      listDealers({ type: "GRAIN" }),
      listProducts({ stockKind: "GRAIN", pageSize: 500 }),
      listBankAccounts(),
      listDealerSales("GRAIN"),
      getDealerUdhaarTotals("GRAIN"),
    ]);

  return (
    <>
      <DealerSummaryCards udhaar={udhaar} totalSpent={summary.totalSpent} />

      <DealerRecordsTabs
        action={
          <RecordDealerGrainPurchaseModal
            dealers={dealers}
            products={products.products}
            bankAccounts={bankAccounts}
          />
        }
        credit={sales}
        debit={batches.map((b) => ({
          id: b.id,
          date: b.receivedAt,
          dealerId: b.dealerId,
          dealerName: b.dealerName,
          productName: b.productName,
          quantity: b.quantity,
          unitName: b.unitName,
          rate: b.rate,
          amount: b.amount,
          payment:
            b.paymentMethod === "CREDIT"
              ? "Udhaar"
              : b.paymentMethod === "ACCOUNT"
                ? "Bank"
                : b.paymentMethod
                  ? "Cash"
                  : "—",
          paymentTone:
            b.paymentMethod === "CREDIT"
              ? "credit"
              : b.paymentMethod === "ACCOUNT"
                ? "account"
                : b.paymentMethod
                  ? "cash"
                  : "mixed",
        }))}
      />
    </>
  );
}
