// Printed at the top of every receipt. Blank lines are skipped, so an
// empty address/phone simply doesn't print.
export const RECEIPT_HEADER = {
  shopName: "Shoaib Traders",
  addressLines: [] as string[],
  phone: "",
  footer: "Thank you!",
};

export type ReceiptHeader = typeof RECEIPT_HEADER;
