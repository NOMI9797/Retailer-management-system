import { formatMoney } from "@/lib/utils";
import type { getCustomerRelationshipSummary } from "@/modules/customers/actions";

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
export function CustomerRelationshipStats({ summary }: { summary: Summary }) {
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
      </div>
      <div className="stat-card">
        <p className="stat-label">Shop owes customer (total)</p>
        <p className="stat-value tone-consigned">{formatMoney(shopOwesCustomer)}</p>
      </div>
    </div>
  );
}
