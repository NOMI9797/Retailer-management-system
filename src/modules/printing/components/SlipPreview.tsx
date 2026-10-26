import { escPosToSlipLines } from "../escposPreview";

// A receipt drawn as the 58 mm thermal printer would print it: 32
// characters a line, monospace, bold and large where the printer would
// be. Built from the same printer output, so what's here is what prints.
export function SlipPreview({ raw }: { raw: string }) {
  const lines = escPosToSlipLines(raw);
  return (
    <div
      style={{
        width: "max-content",
        margin: "0 auto",
        padding: "20px 18px",
        background: "#fff",
        color: "#111",
        boxShadow: "0 1px 3px rgba(0,0,0,0.12), 0 8px 24px rgba(0,0,0,0.06)",
        borderRadius: 4,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: 13,
        lineHeight: 1.45,
      }}
    >
      <div style={{ width: "32ch" }}>
        {lines.map((line, i) => (
          <div
            key={i}
            style={{
              whiteSpace: "pre",
              fontWeight: line.bold ? 700 : 400,
              textAlign: line.center ? "center" : "left",
              fontSize: line.large ? "2em" : undefined,
              lineHeight: line.large ? 1.2 : undefined,
              minHeight: "1.45em",
            }}
          >
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}
