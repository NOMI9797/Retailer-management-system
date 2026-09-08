"use client";

import { useState } from "react";
import { createMonthlyExpense, updateMonthlyExpense } from "../actions";
import type { listMonthlyExpenses, listMonthlyExpenseTypes } from "../actions";

type MonthlyExpense = Awaited<ReturnType<typeof listMonthlyExpenses>>["expenses"][number];
type MonthlyExpenseType = Awaited<ReturnType<typeof listMonthlyExpenseTypes>>[number];

const PAYMENT_METHODS = ["CASH", "ACCOUNT", "CREDIT"] as const;

function toDateInputValue(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().slice(0, 10);
}

// Same shape as ExpenseForm, but picks one of the Settings-managed
// Monthly expense types instead of typing a free-text description —
// the same handful of bills repeat every month, so this is a
// dropdown, not an input. Not wired into Cash Flow or anything else
// yet — recorded here only, per the "handle it later" decision.
export function MonthlyExpenseForm({
  types,
  expense,
  onSaved,
  onCancel,
}: {
  types: MonthlyExpenseType[];
  expense?: MonthlyExpense;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const [monthlyExpenseTypeId, setMonthlyExpenseTypeId] = useState(
    expense?.monthlyExpenseTypeId ?? types[0]?.id ?? ""
  );
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [expenseDate, setExpenseDate] = useState(
    expense ? toDateInputValue(expense.expenseDate) : toDateInputValue(new Date())
  );
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_METHODS)[number]>(
    expense?.paymentMethod ?? "CASH"
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!monthlyExpenseTypeId) {
      setError("Add a monthly expense type in Settings first");
      return;
    }

    setIsSaving(true);
    try {
      const data = {
        monthlyExpenseTypeId,
        amount: Number(amount),
        expenseDate,
        paymentMethod,
      };
      if (expense) {
        await updateMonthlyExpense({ id: expense.id, ...data });
      } else {
        await createMonthlyExpense(data);
      }
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save monthly expense");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-banner error">{error}</p>}

      <div className="field">
        <label>Expense type</label>
        {types.length === 0 ? (
          <p style={{ color: "var(--ink-muted)", fontSize: 13.5 }}>
            No monthly expense types yet — add one in Settings first.
          </p>
        ) : (
          <select value={monthlyExpenseTypeId} onChange={(e) => setMonthlyExpenseTypeId(e.target.value)} required>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="field-row">
        <div className="field">
          <label>Amount</label>
          <input
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>Date</label>
          <input
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="field">
        <label>Payment method</label>
        <div className="stock-toggle">
          {PAYMENT_METHODS.map((method) => (
            <button
              key={method}
              type="button"
              className={paymentMethod === method ? "active" : ""}
              onClick={() => setPaymentMethod(method)}
            >
              {method.charAt(0) + method.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="modal-actions">
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={isSaving || types.length === 0}>
          {isSaving ? "Saving…" : expense ? "Save changes" : "Add monthly expense"}
        </button>
      </div>
    </form>
  );
}
