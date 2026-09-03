import { z } from "zod";

// Every module keeps its validation schema next to its actions, and
// derives form types from it — one source of truth for "what does a
// valid customer look like", shared by the form, the action, and the
// TypeScript types around both.
export const customerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().optional(),
  areaId: z.string().uuid().optional(),
  notes: z.string().optional(),
  accountTypeIds: z.array(z.string().uuid()).default([]),
});

export type CustomerInput = z.infer<typeof customerSchema>;
