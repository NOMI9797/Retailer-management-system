"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { login } from "../actions";
import { loginSchema } from "../schema";
import { PasswordField } from "./PasswordField";

type FieldErrors = Partial<Record<"email" | "password", string>>;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const errors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        if (!errors[key]) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setIsSubmitting(true);
    try {
      const response = await login(result.data);
      if (!response.success) {
        setFormError(response.error);
        return;
      }
      const redirectTo = searchParams.get("redirectTo") || "/dashboard";
      router.push(redirectTo);
      router.refresh();
    } catch {
      // A thrown error here means something genuinely unexpected
      // (network failure, etc) — login() itself returns a result
      // object for every normal failure case (see AuthResult), it
      // never throws for "wrong password"/"not found".
      setFormError("Something went wrong — please try again");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-root">
      <div className="auth-card">
        <div className="auth-mark">
          <div className="seal">S</div>
          <span>Shoaib Traders</span>
        </div>

        <h1>Welcome back</h1>
        <p className="auth-sub">Log in to your shop dashboard.</p>

        <form onSubmit={handleSubmit} noValidate>
          {formError && <p className="auth-banner error">{formError}</p>}

          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              aria-invalid={!!fieldErrors.email}
              required
            />
            {fieldErrors.email && <p className="auth-field-error">{fieldErrors.email}</p>}
          </div>

          <PasswordField
            label="Password"
            value={password}
            onChange={setPassword}
            error={fieldErrors.password}
            autoComplete="current-password"
          />

          <button type="submit" className="auth-submit" disabled={isSubmitting}>
            {isSubmitting ? "Logging in…" : "Log in"}
          </button>
        </form>

        <p className="auth-switch">
          Don&apos;t have an account? <Link href="/signup">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
