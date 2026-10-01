import Link from "next/link";
import { listProducts } from "@/modules/products/actions";

// A row of grain-product chips (Channa/Cotton/Wheat/... plus "All
// products") filtering whichever Grain Udhaar subtab renders below it
// — same product-chip pattern the Grain page's own product tabs use
// (see GrainStockList.tsx), reused here so both "who owes for grain"
// views (customers owing the shop, the shop owing customers) can be
// narrowed to one commodity at a time.
export async function GrainProductFilter({
  productId,
  buildHref,
}: {
  productId?: string;
  buildHref: (productId: string | undefined) => string;
}) {
  const { products } = await listProducts({ stockKind: "GRAIN", pageSize: 500 });
  if (products.length === 0) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
      <Link href={buildHref(undefined)} className={`product-chip${!productId ? " active" : ""}`}>
        All products
      </Link>
      {products.map((product) => (
        <Link
          key={product.id}
          href={buildHref(product.id)}
          className={`product-chip${productId === product.id ? " active" : ""}`}
        >
          {product.name}
        </Link>
      ))}
    </div>
  );
}
