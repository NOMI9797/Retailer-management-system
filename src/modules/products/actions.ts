// Barrel re-export (no "use server" here — each split file below
// already declares it, and Next.js requires every export in a
// "use server" file to itself be an async function, which a
// re-export can't satisfy). The module's Server Actions are split by entity
// (categories.actions.ts / units.actions.ts / products.actions.ts /
// batches.actions.ts) to keep each file focused as the module grows.
// This file exists so callers can keep importing from
// "@/modules/products/actions" without knowing about the split.
export {
  createCategory,
  listCategories,
  updateCategory,
} from "./categories.actions";

export { createUnit, listUnits, updateUnit } from "./units.actions";

export {
  createProduct,
  updateProduct,
  listProducts,
  createGrainProduct,
  getProductStats,
} from "./products.actions";

export {
  createGrainBatch,
  listGrainBatches,
  getGrainStockSummary,
  getGrainProductDetail,
  listGrainProductDetails,
  listGrainProductDetailsForShop,
} from "./batches.actions";
