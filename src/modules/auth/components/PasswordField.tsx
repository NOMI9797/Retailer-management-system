"use client";

import { useId, useState } from "react";

// Shared by both Login and Signup — a password input with its own
// show/hide toggle, each field's visibility state independent of any
// other password field on the same page (Signup has two).
export function PasswordField({
  label,
  value,
  onChange,
  error,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  autoComplete: "new-password" | "current-password";
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-password-row">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          aria-invalid={!!error}
          required
        />
        <button
          type="button"
          className="auth-toggle-visibility"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {error && <p className="auth-field-error">{error}</p>}
    </div>
  );
}
