// Reads the bytes buildReceiptEscPos / buildLedgerReceiptEscPos send to
// the printer back into lines of text with their style — so a receipt
// can be shown on screen exactly as the 58 mm printer would print it,
// from the very same output (nothing laid out twice).

export type SlipLine = {
  text: string;
  bold: boolean;
  // Double width + height (the shop name).
  large: boolean;
  center: boolean;
};

export function escPosToSlipLines(raw: string): SlipLine[] {
  const lines: SlipLine[] = [];
  let bold = false;
  let large = false;
  let center = false;
  let text = "";
  // A line's style is the one in effect when its first character lands.
  let lineStyle: Omit<SlipLine, "text"> | null = null;

  const endLine = () => {
    lines.push({ text, ...(lineStyle ?? { bold, large, center }) });
    text = "";
    lineStyle = null;
  };

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "\x1B") {
      const cmd = raw[i + 1];
      const arg = raw.charCodeAt(i + 2);
      if (cmd === "@") {
        bold = large = center = false;
        i += 1;
      } else if (cmd === "a") {
        center = arg === 1;
        i += 2;
      } else if (cmd === "E") {
        bold = arg === 1;
        i += 2;
      } else if (cmd === "d") {
        // Paper feed: blank lines at the end of the slip.
        if (text) endLine();
        for (let n = 0; n < arg; n++)
          lines.push({ text: "", bold: false, large: false, center: false });
        i += 2;
      } else {
        i += 1;
      }
    } else if (ch === "\x1D" && raw[i + 1] === "!") {
      large = raw.charCodeAt(i + 2) !== 0;
      i += 2;
    } else if (ch === "\n") {
      endLine();
    } else {
      if (!lineStyle) lineStyle = { bold, large, center };
      text += ch;
    }
  }
  if (text) endLine();
  return lines;
}
