// Every kind of entry the New entry screen offers, split the way the
// Daily sales page reads: Credit (money in) and Debit (money out), each
// with its own groups. The one place a new entry type gets added: its
// tile, icon, search keywords and URL key all come from here. Shared by
// the page (tiles) and EntrySearch (typing "rent" finds Monthly
// expense).

export type EntryDef = {
  tab: string;
  title: string;
  description: string;
  // Extra words the search box matches, besides the title (English and
  // the Urdu/Roman words a shopkeeper actually uses).
  keywords: string;
  // SVG path data drawn on a 24×24 stroke icon.
  icon: string;
};

export type EntrySide = {
  side: "credit" | "debit";
  title: string;
  subtitle: string;
  groups: { title: string; entries: EntryDef[] }[];
};

const ICON = {
  cart: "M3 4h2l2.4 11.2a2 2 0 002 1.6h7.7a2 2 0 002-1.5L21 8H6.1M10 21a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z",
  cashIn: "M12 3v12m0 0l-4-4m4 4l4-4M4 19h16",
  cashOut: "M12 15V3m0 0L8 7m4-4l4 4M4 19h16",
  handshake: "M3 12l4-4 4 3 3-3 7 6M7 8l-4 4 6 6 3-3 3 3 6-6",
  wheat: "M12 21V9m0 0c-2-1-3-3-3-6 2 1 3 3 3 6zm0 0c2-1 3-3 3-6-2 1-3 3-3 6zm0 5c-2-1-3-3-3-5 2 1 3 3 3 5zm0 0c2-1 3-3 3-5-2 1-3 3-3 5z",
  swap: "M7 7h11l-3-3M17 17H6l3 3",
  undo: "M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3",
  box: "M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8",
  truck: "M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 100-4 2 2 0 000 4zm10 0a2 2 0 100-4 2 2 0 000 4z",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2",
  book: "M4 4h10a4 4 0 014 4v12H8a4 4 0 01-4-4V4zM4 16a4 4 0 014-4h10",
  plusBox: "M4 4h16v16H4zM12 8v8M8 12h8",
  printer: "M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z",
};

export const ENTRY_SIDES: EntrySide[] = [
  {
    side: "credit",
    title: "Credit",
    subtitle: "Money coming in",
    groups: [
      {
        title: "Sales & receipts",
        entries: [
          {
            tab: "new-sale",
            title: "New sale",
            description: "Sell products or grain.",
            keywords: "sell sale bech becha farokht bill receipt",
            icon: ICON.cart,
          },
          {
            tab: "udhaar-clearance",
            title: "Receive Udhaar",
            description: "Customer pays back Udhaar.",
            keywords: "udhaar udhar wapsi payment received vasooli loan return",
            icon: ICON.cashIn,
          },
          {
            tab: "receive-dealer",
            title: "Receive from dealer",
            description: "Dealer pays what they owe.",
            keywords: "dealer payment received vasooli udhaar",
            icon: ICON.cashIn,
          },
        ],
      },
      {
        title: "Loans",
        entries: [
          {
            tab: "borrow-from-customer",
            title: "Borrow from customer",
            description: "Shop takes cash, repays later.",
            keywords: "borrow qarz udhaar to shop loan liya",
            icon: ICON.handshake,
          },
        ],
      },
      {
        title: "Grain loans",
        entries: [
          {
            tab: "grain-loan",
            title: "Grain loan",
            description: "Lend or borrow grain, to give back later.",
            keywords: "grain loan lend borrow bori bags cotton wheat qarz anaaj",
            icon: ICON.swap,
          },
          {
            tab: "grain-loan-return",
            title: "Grain loan return",
            description: "Grain given back on a loan.",
            keywords: "grain loan return wapsi bags",
            icon: ICON.undo,
          },
        ],
      },
      {
        title: "Returns",
        entries: [
          {
            tab: "purchase-return",
            title: "Purchase return",
            description: "Send goods back to a dealer.",
            keywords: "return wapsi dealer purchase back maal wapis",
            icon: ICON.undo,
          },
        ],      },
    ],
  },
  {
    side: "debit",
    title: "Debit",
    subtitle: "Money going out",
    groups: [
      {
        title: "Udhaar & stock",
        entries: [
          {
            tab: "pay-shop-udhaar",
            title: "Pay back shop's Udhaar",
            description: "Repay borrowed money or grain owed.",
            keywords: "pay back repay udhaar wapsi shop owes",
            icon: ICON.cashOut,
          },
          {
            tab: "stock-from-customer",
            title: "Buy/Keep stock",
            description: "Customer's grain drop-off or purchase.",
            keywords: "grain deposit drop off amanat keep store buy customer",
            icon: ICON.wheat,
          },
          {
            tab: "add-batch",
            title: "Add batch",
            description: "Add grain to stock.",
            keywords: "grain batch stock add own",
            icon: ICON.plusBox,
          },
        ],
      },
      {
        title: "Purchases from dealers",
        entries: [
          {
            tab: "dealer-products",
            title: "Buy products from dealer",
            description: "Bulk stock from a products dealer.",
            keywords: "dealer purchase khareed products stock maal",
            icon: ICON.box,
          },
          {
            tab: "dealer-grain",
            title: "Buy grain from dealer",
            description: "Bulk grain from a grain dealer.",
            keywords: "dealer purchase khareed grain cotton wheat",
            icon: ICON.truck,
          },
          {
            tab: "pay-dealer",
            title: "Pay a dealer",
            description: "Pay what the shop owes a dealer.",
            keywords: "dealer payment pay udhaar",
            icon: ICON.cashOut,
          },
        ],
      },
      {
        title: "Expenses",
        entries: [
          {
            tab: "daily-expense",
            title: "Daily expense",
            description: "Fuel, wages, repairs.",
            keywords: "expense kharcha petrol fuel wages mazdoori repair",
            icon: ICON.receipt,
          },
          {
            tab: "monthly-expense",
            title: "Monthly expense",
            description: "Rent, salary, bills.",
            keywords: "expense rent kiraya salary tankhwah bill bijli",
            icon: ICON.calendar,
          },
        ],
      },
      {
        title: "Loans & Udhaar",
        entries: [
          {
            tab: "long-term-loan",
            title: "Give long-term loan",
            description: "Lend cash for a fixed term.",
            keywords: "loan qarz long term lend",
            icon: ICON.clock,
          },
          {
            tab: "import-udhaar",
            title: "Import old Udhaar",
            description: "Bring a balance from the register.",
            keywords: "import old register purana udhaar",
            icon: ICON.book,
          },
        ],
      },
      {
        title: "Returns",
        entries: [
          {
            tab: "sales-return",
            title: "Sales return",
            description: "Customer brings goods back.",
            keywords: "return wapsi sale back customer maal wapis refund",
            icon: ICON.undo,
          },
        ],      },
    ],
  },
];

// Not entries — nothing is recorded — but reached the same way: a tile
// under the Credit / Debit columns, and by search.
export const REPORT_ENTRIES: EntryDef[] = [
  {
    tab: "ledger-receipt",
    title: "Ledger receipt",
    description: "Print a customer's record for chosen dates.",
    keywords: "ledger receipt statement print history hisaab khata record report",
    icon: ICON.printer,
  },
];

export const ENTRIES: EntryDef[] = [
  ...ENTRY_SIDES.flatMap((side) => side.groups.flatMap((group) => group.entries)),
  ...REPORT_ENTRIES,
];
