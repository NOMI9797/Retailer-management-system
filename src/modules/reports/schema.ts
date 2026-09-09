import { z } from "zod";

// Reports are pure aggregation — nothing here writes data, so there's
// no create/update schema, just a validated shape for "which period is
// the shopkeeper looking at." Daily/Monthly/Yearly all resolve to a
// concrete date range; Seasonal groups by DailySale.season as-is (no
// season management UI this milestone, per the milestone doc's scope
// decision).
export const reportPeriodSchema = z.discriminatedUnion("view", [
  z.object({ view: z.literal("daily"), date: z.string().min(1) }),
  z.object({ view: z.literal("monthly"), year: z.number().int(), month: z.number().int().min(1).max(12) }),
  z.object({ view: z.literal("yearly"), year: z.number().int() }),
  z.object({ view: z.literal("seasonal"), season: z.string().min(1) }),
]);
export type ReportPeriodInput = z.infer<typeof reportPeriodSchema>;
