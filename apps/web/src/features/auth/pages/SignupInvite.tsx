// apps/web/src/features/auth/pages/SignupInvite.tsx

import React, { useEffect, useMemo, useState } from "react";
import { previewOrgInvite, signupInvite, type OrgInvitePreviewResponse } from "../../../features/auth/api";

import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";

type Props = {
  token: string;
  onSignedUp?: () => void | Promise<void>;
  onGoToLogin?: () => void;
};

function isValidEmail(email: string) {
  const v = email.trim();
  if (!v) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function formatDateTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message.trim()) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export function SignupInvite({ token, onSignedUp, onGoToLogin }: Props) {
  const [preview, setPreview] = useState<OrgInvitePreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);

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

  useEffect(() => {
    let alive = true;

    (async () => {
      setPreviewLoading(true);
      setPreviewError(null);

      try {
        const out = await previewOrgInvite(token.trim());
        if (!alive) return;

        setPreview(out);

        if (out?.email) {
          setEmail((current) => (current.trim() ? current : out.email));
        }
      } catch (err: unknown) {
        if (!alive) return;
        setPreview(null);
        setPreviewError(getErrorMessage(err, "Failed to load invite"));
      } finally {
        if (alive) setPreviewLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [token]);

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
    if (preview?.email && emailTrimmed !== preview.email.toLowerCase()) {
      return "Use the same email address that received the invite";
    }
    return null;
  }, [emailTrimmed, touched.email, preview]);

  const passwordError = useMemo(() => {
    if (!touched.password) return null;
    if (!password) return "Password is required";
    if (password.length < 6) return "Password must be at least 6 characters";
    return null;
  }, [password, touched.password]);

  const inviteInvalid = Boolean(preview && !preview.valid);
  const inviteReady = Boolean(preview && preview.valid);

  const canSubmit = useMemo(() => {
    if (loading || previewLoading) return false;
    if (!inviteReady) return false;
    if (!nameTrimmed) return false;
    if (!isValidEmail(emailTrimmed)) return false;
    if (preview?.email && emailTrimmed !== preview.email.toLowerCase()) return false;
    if (password.length < 6) return false;
    if (!token.trim()) return false;
    return true;
  }, [loading, previewLoading, inviteReady, nameTrimmed, emailTrimmed, password, token, preview]);

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
      await signupInvite({
        name: nameTrimmed,
        email: emailTrimmed,
        password,
        token: token.trim(),
      });

      await onSignedUp?.();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to create account from invite"));
    } finally {
      setLoading(false);
    }
  }

  const title = preview?.orgName ? `Join ${preview.orgName}` : "Create your account";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-900 text-white shadow-sm">
              <span className="text-sm font-semibold" aria-hidden>
                Docs
              </span>
            </div>

            <h1 className="mt-4 text-xl font-semibold text-gray-900 sm:text-2xl">
              {title}
            </h1>

            <p className="mt-2 text-sm text-gray-600">
              Finish creating your account to join the organization.
            </p>
          </div>

          <Card className="p-5 sm:p-6">
            {previewLoading && (
              <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                Loading invite details...
              </div>
            )}

            {!previewLoading && previewError && (
              <div
                className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                role="alert"
                aria-live="polite"
              >
                <div className="font-medium text-red-900">Could not load invite</div>
                <div className="mt-1">{previewError}</div>
              </div>
            )}

            {!previewLoading && preview && (
              <div
                className={`mb-4 rounded-xl border p-3 text-sm ${
                  preview.valid
                    ? "border-blue-200 bg-blue-50 text-blue-900"
                    : "border-yellow-200 bg-yellow-50 text-yellow-900"
                }`}
              >
                <div className={`font-medium ${preview.valid ? "text-blue-950" : "text-yellow-950"}`}>
                  {preview.valid ? "Organization invite" : "Invite unavailable"}
                </div>

                <div className="mt-1">
                  {preview.valid ? (
                    <>
                      You were invited to join{" "}
                      <span className="font-medium">{preview.orgName}</span>
                      {preview.invitedByName ? (
                        <>
                          {" "}by <span className="font-medium">{preview.invitedByName}</span>
                        </>
                      ) : null}
                      .
                    </>
                  ) : preview.status === "expired" ? (
                    <>This invite has expired.</>
                  ) : preview.status === "accepted" ? (
                    <>This invite has already been accepted.</>
                  ) : preview.status === "revoked" ? (
                    <>This invite has been revoked.</>
                  ) : (
                    <>This invite is not available.</>
                  )}
                </div>

                <div className="mt-2 space-y-1 text-xs">
                  <div>
                    Invited email: <span className="font-medium">{preview.email}</span>
                  </div>
                  <div>
                    Expires: <span className="font-medium">{formatDateTime(preview.expiresAt)}</span>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div
                className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                role="alert"
                aria-live="polite"
              >
                <div className="font-medium text-red-900">Could not create account</div>
                <div className="mt-1">{error}</div>
              </div>
            )}

            <form className="space-y-4" onSubmit={onSubmit}>
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
                    disabled={!inviteReady || loading || previewLoading}
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

              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Invited email
                </label>
                <div className="mt-2">
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                    placeholder="you@company.com"
                    autoComplete="email"
                    inputMode="email"
                    aria-invalid={Boolean(emailError)}
                    className={emailError ? "border-red-300 focus:ring-red-500" : undefined}
                    disabled={!inviteReady || loading || previewLoading}
                  />
                </div>
                <div className="mt-2 min-h-[16px] text-xs">
                  {emailError ? (
                    <span className="text-red-700">{emailError}</span>
                  ) : touched.email && isValidEmail(emailTrimmed) ? (
                    <span className="text-gray-500">Looks good</span>
                  ) : (
                    <span className="text-gray-500">
                      Use the same email address that received the invite.
                    </span>
                  )}
                </div>
              </div>

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
                    disabled={!inviteReady || loading || previewLoading}
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
                disabled={!canSubmit || inviteInvalid}
                className="w-full"
              >
                {loading ? "Joining organization..." : "Create account and join"}
              </Button>

              {onGoToLogin && (
                <button
                  type="button"
                  onClick={onGoToLogin}
                  className="w-full text-center text-xs text-gray-600 hover:text-gray-900"
                >
                  Already have an account? Sign in instead
                </button>
              )}
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
