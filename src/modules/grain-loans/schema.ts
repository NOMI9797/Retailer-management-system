import { z } from "zod";

// Grain lent to (SHOP_LENT) or borrowed from (SHOP_BORROWED) one
// customer or dealer — exactly one of the two. rate is the rate agreed
// at the time (the cost of grain that comes back into stock); money
// paid on a return is entered separately, at that day's rate.
const grainLoanFields = z.object({
  direction: z.enum(["SHOP_LENT", "SHOP_BORROWED"]),
  productId: z.string().uuid(),
  customerId: z.string().uuid().optional(),
  dealerId: z.string().uuid().optional(),
  quantity: z.number().positive("Quantity must be positive"),
  rate: z.number().positive("Rate must be positive"),
  // "YYYY-MM-DD" — defaults to today.
  loanDate: z.string().optional(),
  reference: z.string().trim().min(1, "Reference is required"),
  notes: z.string().optional(),
});

const onePartyMessage = {
  message: "Select either a customer or a dealer",
  path: ["customerId"],
};

export const grainLoanSchema = grainLoanFields.refine(
  (d) => !!d.customerId !== !!d.dealerId,
  onePartyMessage,
);
export type GrainLoanInput = z.infer<typeof grainLoanSchema>;

export const updateGrainLoanSchema = grainLoanFields
  .extend({ id: z.string().uuid() })
  .refine((d) => !!d.customerId !== !!d.dealerId, onePartyMessage);
export type UpdateGrainLoanInput = z.infer<typeof updateGrainLoanSchema>;

// One give-back against a loan: grain returned and/or some of it
// settled in money instead. The money (amount) is whatever was paid at
// that day's rate — entered as is, never worked out from the loan's
// rate. quantityPaid is how much of the loan that money settles. Money
// moves as Cash or Account — never Udhaar.
const grainLoanReturnFields = z.object({
  quantityReturned: z.number().nonnegative().default(0),
  quantityPaid: z.number().nonnegative().default(0),
  amount: z.number().nonnegative().default(0),
  paymentMethod: z.enum(["CASH", "ACCOUNT"]).optional(),
  bankAccountId: z.string().uuid().optional(),
  returnDate: z.string().optional(),
  reference: z.string().trim().min(1, "Reference is required"),
});

type ReturnFields = z.infer<typeof grainLoanReturnFields>;
const returnRules: [
  (d: ReturnFields) => boolean,
  { message: string; path: string[] },
][] = [
  [
    (d) => d.quantityReturned + d.quantityPaid > 0,
    {
      message: "Enter grain returned or bags paid in money",
      path: ["quantityReturned"],
    },
  ],
  [
    (d) => d.quantityPaid <= 0 || d.amount > 0,
    { message: "Enter the amount paid", path: ["amount"] },
  ],
  [
    (d) => d.amount <= 0 || d.quantityPaid > 0,
    {
      message: "Enter how much grain this money settles",
      path: ["quantityPaid"],
    },
  ],
  [
    (d) => d.quantityPaid <= 0 || !!d.paymentMethod,
    { message: "Select how the money was paid", path: ["paymentMethod"] },
  ],
  [
    (d) =>
      d.quantityPaid <= 0 || d.paymentMethod !== "ACCOUNT" || !!d.bankAccountId,
    {
      message: "Select which bank account this was paid through",
      path: ["bankAccountId"],
    },
  ],
];

export const grainLoanReturnSchema = grainLoanReturnFields
  .extend({ grainLoanId: z.string().uuid() })
  .superRefine((d, ctx) => {
    for (const [check, issue] of returnRules)
      if (!check(d)) ctx.addIssue({ code: "custom", ...issue });
  });
export type GrainLoanReturnInput = z.input<typeof grainLoanReturnSchema>;

export const updateGrainLoanReturnSchema = grainLoanReturnFields
  .extend({ id: z.string().uuid() })
  .superRefine((d, ctx) => {
    for (const [check, issue] of returnRules)
      if (!check(d)) ctx.addIssue({ code: "custom", ...issue });
  });
export type UpdateGrainLoanReturnInput = z.input<
  typeof updateGrainLoanReturnSchema
>;
