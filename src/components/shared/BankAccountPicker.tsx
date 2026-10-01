"use client";

// A plain select for "which bank account was this Account payment
// through" — shown by the caller only when paymentMethod === "ACCOUNT"
// (or, on the payment-split form, when the account amount is > 0).
// Takes the already-loaded list of active bank accounts as a prop
// (per the server-first data loading convention — no fetch inside
// this component) rather than fetching its own data.
export function BankAccountPicker({
  bankAccounts,
  value,
  onChange,
}: {
  bankAccounts: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="field">
      <label>Bank account</label>
      {bankAccounts.length === 0 ? (
        <p style={{ color: "var(--ink-muted)", fontSize: 13.5 }}>
          No bank accounts yet — add one in Settings → Bank accounts.
        </p>
      ) : (
        <select value={value} onChange={(e) => onChange(e.target.value)} required>
          <option value="" disabled>
            Select a bank account
          </option>
          {bankAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
