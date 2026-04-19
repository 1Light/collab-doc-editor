// apps/web/src/features/auth/pages/SignupMember.tsx

import React, { useMemo, useState } from "react";
import { signup } from "../../../features/auth/api";

import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";

type Props = {
  onSignedUp?: () => void | Promise<void>;
  onGoToLogin?: () => void;
};

function isValidEmail(email: string) {
  const v = email.trim();
  if (!v) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function SignupMember({ onSignedUp, onGoToLogin }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [touched, setTouched] = useState<{
    name: boolean;
    email: boolean;
    password: boolean;
  }>({
    name: false,
    email: false,
    password: false,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameTrimmed = name.trim();
  const emailTrimmed = email.trim().toLowerCase();

  const nameError = useMemo(() => {
    if (!touched.name) return null;
    if (!nameTrimmed) return "Full name is required";
    if (nameTrimmed.length < 2) return "Enter your full name";
    return null;
  }, [nameTrimmed, touched.name]);

  const emailError = useMemo(() => {
    if (!touched.email) return null;
    if (!emailTrimmed) return "Email is required";
    if (!isValidEmail(emailTrimmed)) return "Enter a valid email";
    return null;
  }, [emailTrimmed, touched.email]);

  const passwordError = useMemo(() => {
    if (!touched.password) return null;
    if (!password) return "Password is required";
    if (password.length < 6) return "Password must be at least 6 characters";
    return null;
  }, [password, touched.password]);

  const canSubmit = useMemo(() => {
    if (loading) return false;
    if (!nameTrimmed) return false;
    if (!isValidEmail(emailTrimmed)) return false;
    if (password.length < 6) return false;
    return true;
  }, [loading, nameTrimmed, emailTrimmed, password]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    setTouched({
      name: true,
      email: true,
      password: true,
    });
    setError(null);

    if (!canSubmit) return;

    setLoading(true);
    try {
      await signup({
        name: nameTrimmed,
        email: emailTrimmed,
        password,
      });

      await onSignedUp?.();
    } catch (err: any) {
      setError(err?.message ?? "Failed to create account");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-900 text-white shadow-sm">
              <span className="text-sm font-semibold">Docs</span>
            </div>

            <h1 className="mt-4 text-xl font-semibold text-gray-900 sm:text-2xl">
              Create your account
            </h1>

            <p className="mt-2 text-sm text-gray-600">
              Sign up to get started. You can join an organization later.
            </p>
          </div>

          <Card className="p-5 sm:p-6">
            {error && (
              <div
                className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                role="alert"
              >
                <div className="font-medium text-red-900">
                  Could not create account
                </div>
                <div className="mt-1">{error}</div>
              </div>
            )}

            <form className="space-y-4" onSubmit={onSubmit}>
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Full name
                </label>
                <div className="mt-2">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                    placeholder="Jane Doe"
                    autoComplete="name"
                    aria-invalid={Boolean(nameError)}
                    className={nameError ? "border-red-300 focus:ring-red-500" : undefined}
                  />
                </div>
                <div className="mt-2 min-h-[16px] text-xs">
                  {nameError ? (
                    <span className="text-red-700">{nameError}</span>
                  ) : touched.name && nameTrimmed.length >= 2 ? (
                    <span className="text-gray-500">Looks good</span>
                  ) : (
                    <span className="text-gray-500">Use your real full name.</span>
                  )}
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Email
                </label>
                <div className="mt-2">
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                    placeholder="you@example.com"
                    autoComplete="email"
                    inputMode="email"
                    aria-invalid={Boolean(emailError)}
                    className={emailError ? "border-red-300 focus:ring-red-500" : undefined}
                  />
                </div>
                <div className="mt-2 min-h-[16px] text-xs">
                  {emailError ? (
                    <span className="text-red-700">{emailError}</span>
                  ) : touched.email && isValidEmail(emailTrimmed) ? (
                    <span className="text-gray-500">Looks good</span>
                  ) : (
                    <span className="text-gray-500">Enter a valid email address.</span>
                  )}
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Password
                </label>
                <div className="mt-2">
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    aria-invalid={Boolean(passwordError)}
                    className={passwordError ? "border-red-300 focus:ring-red-500" : undefined}
                  />
                </div>
                <div className="mt-2 min-h-[16px] text-xs">
                  {passwordError ? (
                    <span className="text-red-700">{passwordError}</span>
                  ) : touched.password && password.length >= 6 ? (
                    <span className="text-gray-500">Ready</span>
                  ) : (
                    <span className="text-gray-500">Minimum 6 characters.</span>
                  )}
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                disabled={!canSubmit}
                className="w-full"
              >
                {loading ? "Creating account..." : "Create account"}
              </Button>

              {onGoToLogin && (
                <button
                  type="button"
                  onClick={onGoToLogin}
                  className="w-full text-center text-xs text-gray-600 hover:text-gray-900"
                >
                  Already have an account? Sign in
                </button>
              )}
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
