import { formatDate, formatTime } from "@/lib/utils";
import type { ReceiptHeader } from "./receiptHeader";
import type { LedgerReceipt, LedgerReceiptBalance } from "@/modules/ledger-receipt/actions";
import { receiptDetailLines, receiptLabel, receiptPayment } from "@/modules/ledger-receipt/labels";

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
  // Before the discount, and the discount off the bill (total is after it).
  subtotal?: number;
  discount?: number;
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

// Shop name, address and phone, centred — the top of every slip.
function shopHeader(header: ReceiptHeader): string[] {
  const out: string[] = [INIT, ALIGN_CENTER];
  out.push(BOLD_ON, SIZE_DOUBLE);
  for (const line of wrap(header.shopName.toUpperCase(), DOUBLE_WIDTH)) out.push(`${line}\n`);
  out.push(SIZE_NORMAL, BOLD_OFF);
  for (const line of header.addressLines.flatMap((l) => (l.trim() ? wrap(l, LINE_WIDTH) : []))) out.push(`${line}\n`);
  if (header.phone.trim()) out.push(`${ascii(header.phone.trim())}\n`);
  return out;
}

export function buildReceiptEscPos(receipt: PrintableReceipt, header: ReceiptHeader): string {
  const out = shopHeader(header);

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
  if (receipt.discount && receipt.discount > 0.005) {
    out.push(`${twoColumns("Subtotal", money(receipt.subtotal ?? receipt.total + receipt.discount))}\n`);
    out.push(`${twoColumns("Discount", `- ${money(receipt.discount)}`)}\n`);
  }
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

// A customer's ledger receipt, laid out to read top to bottom without
// help: who and which dates; the balance on the first day; every entry
// numbered, under its day, each with a plain heading ("Shop paid back
// customer"), its details one per line and its amount on a line of its
// own; the balance on the last day; and the net — who owes whom — in
// large print.
export function buildLedgerReceiptEscPos(receipt: LedgerReceipt, header: ReceiptHeader): string {
  const out = shopHeader(header);
  const line = (text: string) => out.push(`${ascii(text)}\n`);
  const wrapped = (text: string, indent = "") => {
    for (const l of wrap(text, LINE_WIDTH - indent.length)) line(`${indent}${l}`);
  };
  const bold = (fn: () => void) => {
    out.push(BOLD_ON);
    fn();
    out.push(BOLD_OFF);
  };
  const heavy = "=".repeat(LINE_WIDTH);
  const amountLine = (amount: string) => line(" ".repeat(Math.max(LINE_WIDTH - amount.length, 0)) + amount);

  out.push(ALIGN_LEFT);
  line(heavy);
  out.push(ALIGN_CENTER);
  bold(() => line("LEDGER RECEIPT"));
  out.push(ALIGN_LEFT);
  line(heavy);
  wrapped(`Customer: ${receipt.customer.name}`);
  line(`From:     ${formatDate(receipt.fromDate)}`);
  line(`To:       ${formatDate(receipt.toDate)}`);
  line(heavy);

  const balance = (title: string, b: LedgerReceiptBalance) => {
    bold(() => line(title));
    line(twoColumns(" Customer owes shop", money(b.customerOwes)));
    line(twoColumns(" Shop owes customer", money(b.shopOwes)));
    for (const g of b.grainLoans) {
      if (g.lent > 0) {
        line(" Grain customer owes shop:");
        line(`   ${quantity(g.lent)} ${g.unitName} ${g.productName}`);
      }
      if (g.borrowed > 0) {
        line(" Grain shop owes customer:");
        line(`   ${quantity(g.borrowed)} ${g.unitName} ${g.productName}`);
      }
    }
  };

  balance(`BALANCE ON ${formatDate(receipt.fromDate)}`, receipt.opening);
  line("(before these entries)");
  line(heavy);

  if (receipt.entries.length === 0) {
    line("No entries in these dates.");
    line(heavy);
  }
  let day = "";
  receipt.entries.forEach((entry, i) => {
    const entryDay = formatDate(entry.date);
    if (entryDay !== day) {
      day = entryDay;
      bold(() => line(`--- ${entryDay} ${"-".repeat(Math.max(LINE_WIDTH - entryDay.length - 5, 0))}`));
    } else {
      line(divider);
    }
    bold(() => wrapped(`${i + 1}. ${receiptLabel(entry.label).toUpperCase()}`));
    for (const item of entry.items) {
      wrapped(`${item.productName.trim()}: ${quantity(item.quantity)} ${item.unitName} x ${money(item.price)}`, "   ");
    }
    const discount = entry.items.reduce((sum, item) => sum + (item.discount ?? 0), 0);
    if (discount > 0.005) wrapped(`Discount: - ${money(discount)}`, "   ");
    for (const detail of receiptDetailLines(entry.detail)) wrapped(detail, "   ");
    const payment = receiptPayment(entry);
    if (payment) wrapped(payment, "   ");
    if (entry.stockOnly) line("   (grain only - no money)");
    else bold(() => amountLine(money(entry.amount)));
  });
  if (receipt.entries.length > 0) line(heavy);

  balance(`BALANCE ON ${formatDate(receipt.toDate)}`, receipt.closing);
  line("(after these entries)");
  line(heavy);

  const net = receipt.closing.customerOwes - receipt.closing.shopOwes;
  out.push(ALIGN_CENTER);
  bold(() => {
    line("NET BALANCE");
    if (Math.abs(net) < 0.01) line("ALL SETTLED");
    else {
      line(net > 0 ? "CUSTOMER OWES SHOP" : "SHOP OWES CUSTOMER");
      out.push(SIZE_DOUBLE);
      line(money(Math.abs(net)));
      out.push(SIZE_NORMAL);
    }
  });
  out.push(ALIGN_LEFT);
  line(heavy);

  if (header.footer.trim()) out.push(ALIGN_CENTER, `${ascii(header.footer.trim())}\n`, ALIGN_LEFT);
  out.push(feed(4));
  return out.join("");
}
