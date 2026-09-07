"use client";

import { useState } from "react";
import { createExpense, updateExpense } from "../actions";
import type { listExpenses } from "../actions";

type Expense = Awaited<ReturnType<typeof listExpenses>>["expenses"][number];

const PAYMENT_METHODS = ["CASH", "ACCOUNT", "CREDIT"] as const;

function toDateInputValue(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().slice(0, 10);
}

// One form for both add and edit — same shape either way, only
// whether an existing expense is passed in and which Server Action
// gets called differs.
export function ExpenseForm({
  expense,
  onSaved,
  onCancel,
}: {
  expense?: Expense;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const [description, setDescription] = useState(expense?.description ?? "");
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
    setIsSaving(true);
    try {
      const data = {
        description,
        amount: Number(amount),
        expenseDate,
        paymentMethod,
      };
      if (expense) {
        await updateExpense({ id: expense.id, ...data });
      } else {
        await createExpense(data);
      }
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save expense");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-banner error">{error}</p>}

      <div className="field">
        <label>Description</label>
        <input
          type="text"
          placeholder="e.g. Labour wages"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
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
        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          {isSaving ? "Saving…" : expense ? "Save changes" : "Add expense"}
        </button>
      </div>
    </form>
  );
}
