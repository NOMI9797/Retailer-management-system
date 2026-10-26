// How each kind of entry is named on a ledger receipt — written for
// the customer reading it, saying plainly who gave what to whom
// (Daily sales' own labels are written for the shopkeeper). Shared by
// the printed slip and the on-screen receipt; anything not listed keeps
// its Daily sales label.
const RECEIPT_LABEL: Record<string, string> = {
  Sale: "Sale",
  "Udhaar received": "Customer paid Udhaar",
  "Udhaar given": "Udhaar given to customer",
  "Udhaar imported": "Old Udhaar (from register)",
  "Long-term loan given": "Loan given to customer",
  "Borrowed from customer": "Shop borrowed from customer",
  "Repaid to customer": "Shop paid back customer",
  "Grain bought from customer": "Shop bought grain",
  "Paid customer for grain": "Shop paid for grain",
  "Grain Udhaar received": "Customer paid grain Udhaar",
  "Grain kept (drop-off)": "Grain kept at shop",
  "Grain lent": "Grain lent to customer",
  "Grain borrowed": "Shop borrowed grain",
  "Grain loan returned": "Customer returned grain",
  "Borrowed grain given back": "Shop returned grain",
  "Grain loan — paid to shop": "Customer paid for grain loan",
  "Grain loan — paid by shop": "Shop paid for grain loan",
};

export function receiptLabel(label: string) {
  return RECEIPT_LABEL[label] ?? label;
}

// The payment line, or null when there isn't one worth printing. An
// entry that is itself Udhaar (Udhaar given, shop borrowed…) is stored
// with method "Udhaar" — saying so again only confuses, so only sales
// (which can be paid any way) show "On Udhaar".
export function receiptPayment(entry: { label: string; payment: string | null }) {
  if (!entry.payment) return null;
  if (entry.payment === "Udhaar") return entry.label === "Sale" ? "On Udhaar" : null;
  return `Paid by ${entry.payment}`;
}

// Detail text split into its parts ("34 Kgs Bajra · Ref: test" → two
// lines), so each prints on its own line.
export function receiptDetailLines(detail: string | null) {
  return (detail ?? "").split(" · ").map((s) => s.trim()).filter(Boolean);
}
