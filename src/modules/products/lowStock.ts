// Low stock: shop products (not grain) that track stock, are active and
// have this many or fewer left in their main unit — 0 or below is out
// of stock. Shared by the Dashboard's Needs attention list and the Low
// stock page so both always count the same products.
// Plain module (no server / client marker) — used by both sides.
export const LOW_STOCK_LIMIT = 10;

export function lowStockWhere(shopId: string) {
  return {
    shopId,
    stockKind: "SIMPLE" as const,
    isActive: true,
    isDeleted: false,
    tracksStock: true,
    quantity: { lte: LOW_STOCK_LIMIT },
  };
}
