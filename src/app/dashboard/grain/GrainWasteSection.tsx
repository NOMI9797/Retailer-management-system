import { getShelfStock, listGrainWaste } from "@/modules/grain-waste/actions";
import { WasteGrainPanel } from "@/modules/grain-waste/components/WasteGrainPanel";

// Waste grain: the shop's own grain on the shelf right now (kg, what it
// cost, cost per kg), a form to mark some of it as waste — showing what
// the stock and cost per kg become — and every waste recorded.
export async function GrainWasteSection({ productId }: { productId: string }) {
  const [shelf, rows] = await Promise.all([getShelfStock(productId), listGrainWaste(productId)]);
  return <WasteGrainPanel productId={productId} shelf={shelf} rows={rows} />;
}
