import { formatMoney } from "@/lib/utils";
import {
  CustomerUdhaarPaymentModal,
  ShopUdhaarPaymentModal,
} from "@/modules/customers/components/CustomerUdhaarPayment";
import type { getCustomerRelationshipSummary } from "@/modules/customers/actions";
import { AdvanceStockCard, type AdvanceStockByGrain } from "./AdvanceStockCard";

type Summary = Awaited<ReturnType<typeof getCustomerRelationshipSummary>>;

// The customer's overall standing, shown above the detail page's tabs
// (see CustomerDetailPage) so it covers all of them at once: Purchase
// history Udhaar (incl. grain bought on Udhaar), Long-term loans,
// Udhaar to Shop, and grain the shop still owes for. Deliberately
// just the three headline figures (net, customer-owes, shop-owes) —
// the per-bucket breakdown (Regular/Long-term Udhaar, Shop Borrowed,
// Grain) is NOT shown here, since each of those already has its own
// dedicated, more detailed view elsewhere (the Debts page, the Udhaar
// to Shop tab, the Grain tab's own per-product cards) and repeating
// them here as flat cards read as confusing duplicates.
// Each total carries the button that settles it (Receive payment / Pay
// now), same as the New entry screen's person card.
export function CustomerRelationshipStats({
  summary,
  customerId,
  customerName,
  bankAccounts,
  advanceStock = [],
  selectedGrain,
}: {
  summary: Summary;
  customerId: string;
  customerName: string;
  bankAccounts: { id: string; name: string }[];
  // The shop's grain at this customer's home, per grain — a fourth card
  // when there is any.
  advanceStock?: AdvanceStockByGrain[];
  // The grain picked in the filter beside the tabs — the card shows it.
  selectedGrain?: string;
}) {
  const { customerOwesShop, shopOwesCustomer, netAmount, netOwedBy } = summary;

  const netLabel =
    netOwedBy === "CUSTOMER" ? "Net — customer owes shop" : netOwedBy === "SHOP" ? "Net — shop owes customer" : "Net balance";
  const netTone = netOwedBy === "SHOP" ? "tone-consigned" : netOwedBy === "CUSTOMER" ? "tone-primary" : "tone-grain";

  return (
    <div className="stat-grid" style={{ marginBottom: 16 }}>
      <div className="stat-card">
        <p className="stat-label">{netLabel}</p>
        <p className={`stat-value ${netTone}`}>{formatMoney(netAmount)}</p>
      </div>
      <div className="stat-card">
        <p className="stat-label">Customer owes shop (total)</p>
        <p className="stat-value tone-primary">{formatMoney(customerOwesShop)}</p>
        {customerOwesShop > 0.01 && (
          <CustomerUdhaarPaymentModal
            customerId={customerId}
            customerName={customerName}
            bankAccounts={bankAccounts}
            triggerLabel="Receive payment"
            triggerClassName="btn btn-primary stat-card-action"
          />
        )}
      </div>
      <div className="stat-card">
        <p className="stat-label">Shop owes customer (total)</p>
        <p className="stat-value tone-consigned">{formatMoney(shopOwesCustomer)}</p>
        {shopOwesCustomer > 0.01 && (
          <ShopUdhaarPaymentModal
            customerId={customerId}
            customerName={customerName}
            bankAccounts={bankAccounts}
            triggerLabel="Pay now"
            triggerClassName="btn btn-primary stat-card-action"
          />
        )}
      </div>
      {advanceStock.length > 0 && (
        <AdvanceStockCard key={selectedGrain ?? ""} grains={advanceStock} selectedGrain={selectedGrain} />
      )}
    </div>
  );
}
