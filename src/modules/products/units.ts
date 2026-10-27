// Products sold in two units (e.g. 1 Bag = 50 Kgs). Stock and prices
// are kept in the main unit; a sale or purchase line can be entered in
// either, and these turn what was entered into main-unit figures.
// Plain module (no server / client marker) — used by both sides.

export type EntryUnit = "MAIN" | "SUB";

type TwoUnitProduct = {
  unit: { name: string };
  subUnit?: { name: string } | null;
  subUnitsPerUnit?: number | string | { toString(): string } | null;
};

// How many sub units make one main unit (50), or null when the product
// is sold in one unit only.
export function subUnitsPerUnit(product: TwoUnitProduct): number | null {
  const n = product.subUnit && product.subUnitsPerUnit != null ? Number(product.subUnitsPerUnit) : 0;
  return n > 0 ? n : null;
}

// Main units in one of what was entered: 1 for the main unit, 1/50 for
// a Kg out of a 50 Kg bag.
export function mainUnitsPer(product: TwoUnitProduct, unit: EntryUnit | undefined | null): number {
  const n = subUnitsPerUnit(product);
  return unit === "SUB" && n ? 1 / n : 1;
}

export function entryUnitName(product: TwoUnitProduct, unit: EntryUnit | undefined | null): string {
  return unit === "SUB" && subUnitsPerUnit(product) ? product.subUnit!.name : product.unit.name;
}

// "12 Bag 30 Kgs" — stock in the main unit, broken into whole main
// units and the remaining sub units. One-unit products: "12.5 Bag".
export function formatStock(quantity: number, product: TwoUnitProduct): string {
  const n = subUnitsPerUnit(product);
  const round = (x: number, places: number) => Number(x.toFixed(places));
  if (!n) return `${round(quantity, 3)} ${product.unit.name}`;
  const sign = quantity < 0 ? "−" : "";
  const abs = Math.abs(quantity);
  let whole = Math.floor(abs + 1e-9);
  let rest = round((abs - whole) * n, 3);
  if (rest >= n - 1e-6) {
    whole += 1;
    rest = 0;
  }
  if (whole === 0 && rest === 0) return `0 ${product.unit.name}`;
  const parts = [];
  if (whole > 0) parts.push(`${whole} ${product.unit.name}`);
  if (rest > 0) parts.push(`${rest} ${product.subUnit!.name}`);
  return sign + parts.join(" ");
}
