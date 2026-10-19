import { getQzCertificate, signQzRequest } from "./qzSigning.actions";

type QzApi = typeof import("qz-tray");

const PRINTER_STORAGE_KEY = "receiptPrinterName";

// Typical names a 58 mm Bluetooth thermal printer shows up under in
// Windows Printers — its own model name, or the generic text-only
// driver it's often installed with. Only used when no printer has been
// picked yet on this computer.
const RECEIPT_PRINTER_HINT = /speed|bt-?450|thermal|receipt|\bpos\b|pos-?58|58\s?mm|xp-?58|generic.*text|text only/i;

let qzLoad: Promise<QzApi> | null = null;

// Loaded on first use only — the library talks to QZ Tray over a local
// websocket and has no business running during server rendering.
function loadQz(): Promise<QzApi> {
  if (!qzLoad) {
    qzLoad = import("qz-tray").then((mod) => {
      const qz = (mod as QzApi & { default?: QzApi }).default ?? mod;
      qz.security.setCertificatePromise((resolve) => {
        getQzCertificate()
          .then((cert) => resolve(cert ?? undefined))
          .catch(() => resolve());
      });
      qz.security.setSignatureAlgorithm("SHA512");
      qz.security.setSignaturePromise((toSign: string) => (resolve) => {
        signQzRequest(toSign)
          .then((signature) => resolve(signature ?? undefined))
          .catch(() => resolve());
      });
      return qz;
    });
  }
  return qzLoad;
}

async function connect(): Promise<QzApi> {
  const qz = await loadQz();
  if (!qz.websocket.isActive()) {
    try {
      await qz.websocket.connect({ retries: 1, delay: 1 });
    } catch {
      throw new Error("Can't reach QZ Tray. Make sure QZ Tray is running on this computer, then try again.");
    }
  }
  return qz;
}

export function getSavedPrinter(): string | null {
  try {
    return localStorage.getItem(PRINTER_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function savePrinter(name: string) {
  try {
    localStorage.setItem(PRINTER_STORAGE_KEY, name);
  } catch {
    // Storage unavailable (private window) — the pick just won't persist.
  }
}

export async function listPrinters(): Promise<string[]> {
  const qz = await connect();
  const found = await qz.printers.find();
  return Array.isArray(found) ? found : [found];
}

async function resolvePrinter(): Promise<string> {
  const printers = await listPrinters();
  const saved = getSavedPrinter();
  if (saved && printers.includes(saved)) return saved;

  const match = printers.find((name) => RECEIPT_PRINTER_HINT.test(name));
  if (match) return match;
  if (printers.length === 1) return printers[0];

  throw new Error("Couldn't tell which printer is the receipt printer. Pick it under \"Printer\" on the Receipts page.");
}

export async function printRaw(data: string): Promise<string> {
  const qz = await connect();
  const printer = await resolvePrinter();
  const config = qz.configs.create(printer);
  await qz.print(config, [{ type: "raw", format: "command", flavor: "plain", data }]);
  return printer;
}
