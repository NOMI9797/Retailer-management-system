import { formatDate, formatTime } from "@/lib/utils";
import type { ReceiptHeader } from "./receiptHeader";

// 58 mm paper at the printer's standard font fits 32 characters a line;
// double-width text halves that.
const LINE_WIDTH = 32;
const DOUBLE_WIDTH = LINE_WIDTH / 2;

const ESC = "\x1B";
const GS = "\x1D";
const INIT = `${ESC}@`;
const ALIGN_LEFT = `${ESC}a\x00`;
const ALIGN_CENTER = `${ESC}a\x01`;
const BOLD_ON = `${ESC}E\x01`;
const BOLD_OFF = `${ESC}E\x00`;
const SIZE_DOUBLE = `${GS}!\x11`;
const SIZE_NORMAL = `${GS}!\x00`;
const feed = (lines: number) => `${ESC}d${String.fromCharCode(lines)}`;

const PAYMENT_LABEL = { CASH: "Cash", ACCOUNT: "Account", CREDIT: "Udhaar" } as const;

export type PrintableReceipt = {
  receiptNumber: number;
  visitAt: Date | string;
  buyerName: string;
  buyerKind: "CUSTOMER" | "DEALER";
  items: { productName: string; quantity: number; actualPrice: number }[];
  payments: { paymentMethod: "CASH" | "ACCOUNT" | "CREDIT"; amount: number; bankAccountName: string | null }[];
  total: number;
};

// Thermal printers in their default code page only render plain ASCII
// reliably — anything else (Urdu, curly quotes, the non-breaking space
// Intl inserts) prints as garbage, so it's replaced before printing.
function ascii(text: string) {
  return text.replace(/[   ]/g, " ").replace(/[^\x20-\x7E]/g, "?");
}

function money(amount: number) {
  return `Rs ${Math.round(amount).toLocaleString("en-US")}`;
}

function quantity(value: number) {
  return String(Number(value.toFixed(3)));
}

function wrap(text: string, width: number): string[] {
  const words = ascii(text).trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (word.length > width) {
      if (current) lines.push(current);
      for (let i = 0; i < word.length; i += width) lines.push(word.slice(i, i + width));
      current = "";
      continue;
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length > width) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

// Left text and right text on one line, the left side truncated if the
// two can't both fit with at least one space between them.
function twoColumns(left: string, right: string) {
  const r = ascii(right);
  const room = LINE_WIDTH - r.length - 1;
  const l = ascii(left).slice(0, Math.max(room, 0));
  return `${l}${" ".repeat(LINE_WIDTH - l.length - r.length)}${r}`;
}

const divider = "-".repeat(LINE_WIDTH);

export function buildReceiptEscPos(receipt: PrintableReceipt, header: ReceiptHeader): string {
  const out: string[] = [INIT, ALIGN_CENTER];

  out.push(BOLD_ON, SIZE_DOUBLE);
  for (const line of wrap(header.shopName.toUpperCase(), DOUBLE_WIDTH)) out.push(`${line}\n`);
  out.push(SIZE_NORMAL, BOLD_OFF);
  for (const line of header.addressLines.flatMap((l) => (l.trim() ? wrap(l, LINE_WIDTH) : []))) out.push(`${line}\n`);
  if (header.phone.trim()) out.push(`${ascii(header.phone.trim())}\n`);

  out.push(ALIGN_LEFT, `${divider}\n`);
  out.push(BOLD_ON, `Receipt #${receipt.receiptNumber}\n`, BOLD_OFF);
  out.push(`${formatDate(receipt.visitAt)}  ${ascii(formatTime(receipt.visitAt))}\n`);
  const buyerLabel = receipt.buyerKind === "DEALER" ? "Dealer" : "Customer";
  for (const line of wrap(`${buyerLabel}: ${receipt.buyerName}`, LINE_WIDTH)) out.push(`${line}\n`);
  out.push(`${divider}\n`);

  for (const item of receipt.items) {
    for (const line of wrap(item.productName, LINE_WIDTH)) out.push(`${line}\n`);
    out.push(
      `${twoColumns(`  ${quantity(item.quantity)} x ${money(item.actualPrice)}`, money(item.quantity * item.actualPrice))}\n`
    );
  }

  out.push(`${divider}\n`);
  out.push(BOLD_ON, `${twoColumns("TOTAL", money(receipt.total))}\n`, BOLD_OFF);
  for (const payment of receipt.payments) {
    out.push(`${twoColumns(PAYMENT_LABEL[payment.paymentMethod], money(payment.amount))}\n`);
    if (payment.paymentMethod === "ACCOUNT" && payment.bankAccountName) {
      for (const line of wrap(payment.bankAccountName, LINE_WIDTH - 2)) out.push(`  ${line}\n`);
    }
  }
  out.push(`${divider}\n`);

  if (header.footer.trim()) out.push(ALIGN_CENTER, `${ascii(header.footer.trim())}\n`, ALIGN_LEFT);
  out.push(feed(4));

  return out.join("");
}
