import React, { useEffect, useMemo, useState } from "react";
import {
  login,
  previewOrgInvite,
  type OrgInvitePreviewResponse,
} from "../../../features/auth/api";

import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";

type Props = {
  onLoggedIn?: () => void;
  onGoToSignup?: () => void;
  onGoToSignupInvite?: () => void;
  inviteMode?: boolean;
  inviteToken?: string;
  inviteEmailHint?: string;
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

export function Login({
  onLoggedIn,
  onGoToSignup,
  onGoToSignupInvite,
  inviteMode = false,
  inviteToken,
  inviteEmailHint,
}: Props) {
  const [preview, setPreview] = useState<OrgInvitePreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [email, setEmail] = useState(inviteEmailHint ?? "");
  const [password, setPassword] = useState("");

  const [touched, setTouched] = useState<{ email: boolean; password: boolean }>({
    email: false,
    password: false,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailTrimmed = email.trim();

  useEffect(() => {
    let alive = true;

    if (!inviteMode || !inviteToken || !inviteToken.trim()) {
      setPreview(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }

    (async () => {
      setPreviewLoading(true);
      setPreviewError(null);

      try {
        const out = await previewOrgInvite(inviteToken.trim());
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
  }, [inviteMode, inviteToken]);

  const emailError = useMemo(() => {
    if (!touched.email) return null;
    if (!emailTrimmed) return "Email is required";
    if (!isValidEmail(emailTrimmed)) return "Enter a valid email";
    if (
      inviteMode &&
      preview?.email &&
      emailTrimmed.toLowerCase() !== preview.email.toLowerCase()
    ) {
      return "Use the same email address that received the invite";
    }
    return null;
  }, [emailTrimmed, touched.email, inviteMode, preview]);

  const passwordError = useMemo(() => {
    if (!touched.password) return null;
    if (!password) return "Password is required";
    if (password.length < 6) return "Password must be at least 6 characters";
    return null;
  }, [password, touched.password]);

  const inviteReady = !inviteMode || Boolean(preview?.valid);
  const inviteInvalid = Boolean(inviteMode && preview && !preview.valid);

  const canSubmit = useMemo(() => {
    if (loading || previewLoading) return false;
    if (!inviteReady) return false;
    if (!emailTrimmed || !password) return false;
    if (!isValidEmail(emailTrimmed)) return false;
    if (
      inviteMode &&
      preview?.email &&
      emailTrimmed.toLowerCase() !== preview.email.toLowerCase()
    ) {
      return false;
    }
    if (password.length < 6) return false;
    return true;
  }, [
    emailTrimmed,
    password,
    loading,
    previewLoading,
    inviteReady,
    inviteMode,
    preview,
  ]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    setTouched({ email: true, password: true });
    setError(null);

    if (!canSubmit) return;

    setLoading(true);
    try {
      await login(emailTrimmed, password);
      onLoggedIn?.();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Login failed"));
    } finally {
      setLoading(false);
    }
  }

  const title = inviteMode
    ? preview?.orgName
      ? `Sign in to join ${preview.orgName}`
      : "Sign in to accept your invite"
    : "Sign in";

  return (
    <div className="relative min-h-screen bg-gray-50">
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
              {inviteMode
                ? "Use your existing account to join the organization. If you do not have one yet, create an account first."
                : "Use your account email and password to continue."}
            </p>
          </div>

          <Card className="p-5 sm:p-6">
            {inviteMode && previewLoading && (
              <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                Loading invite details...
              </div>
            )}

            {inviteMode && !previewLoading && previewError && (
              <div
                className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                role="alert"
                aria-live="polite"
              >
                <div className="font-medium text-red-900">Could not load invite</div>
                <div className="mt-1">{previewError}</div>
              </div>
            )}

            {inviteMode && !previewLoading && preview && (
              <div
                className={`mb-4 rounded-xl border p-3 text-sm ${
                  preview.valid
                    ? "border-blue-200 bg-blue-50 text-blue-900"
                    : "border-yellow-200 bg-yellow-50 text-yellow-900"
                }`}
              >
                <div
                  className={`font-medium ${
                    preview.valid ? "text-blue-950" : "text-yellow-950"
                  }`}
                >
                  {preview.valid ? "Organization invite" : "Invite unavailable"}
                </div>

                <div className="mt-1">
                  {preview.valid ? (
                    <>
                      You were invited to join{" "}
                      <span className="font-medium">{preview.orgName}</span>
                      {preview.invitedByName ? (
                        <>
                          {" "}
                          by <span className="font-medium">{preview.invitedByName}</span>
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
                    Expires:{" "}
                    <span className="font-medium">
                      {formatDateTime(preview.expiresAt)}
                    </span>
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
                <div className="font-medium text-red-900">Could not sign in</div>
                <div className="mt-1">{error}</div>
              </div>
            )}

            <form className="space-y-4" onSubmit={onSubmit}>
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
                    className={
                      emailError ? "border-red-300 focus:ring-red-500" : undefined
                    }
                    disabled={loading || previewLoading || inviteInvalid}
                  />
                </div>
                <div className="mt-2 min-h-[16px] text-xs">
                  {emailError ? (
                    <span className="text-red-700">{emailError}</span>
                  ) : touched.email && emailTrimmed ? (
                    <span className="text-gray-500">Looks good</span>
                  ) : (
                    <span className="text-gray-500">
                      {inviteMode
                        ? "Use the same email address that received the invite."
                        : "Use the email tied to your account."}
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
                    autoComplete="current-password"
                    aria-invalid={Boolean(passwordError)}
                    className={
                      passwordError ? "border-red-300 focus:ring-red-500" : undefined
                    }
                    disabled={loading || previewLoading || inviteInvalid}
                  />
                </div>
                <div className="mt-2 min-h-[16px] text-xs">
                  {passwordError ? (
                    <span className="text-red-700">{passwordError}</span>
                  ) : touched.password && password ? (
                    <span className="text-gray-500">Ready</span>
                  ) : (
                    <span className="text-gray-500">
                      Minimum 6 characters recommended.
                    </span>
                  )}
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                disabled={!canSubmit || inviteInvalid}
                className="w-full"
              >
                {loading
                  ? inviteMode
                    ? "Signing in to accept invite..."
                    : "Signing in..."
                  : inviteMode
                    ? "Sign in and continue"
                    : "Sign in"}
              </Button>

              {inviteMode ? (
                onGoToSignupInvite && (
                  <button
                    type="button"
                    onClick={onGoToSignupInvite}
                    className="w-full text-center text-xs text-gray-600 hover:text-gray-900"
                  >
                    Need a new account? Create one first
                  </button>
                )
              ) : (
                onGoToSignup && (
                  <button
                    type="button"
                    onClick={onGoToSignup}
                    className="w-full text-center text-xs text-gray-600 hover:text-gray-900"
                  >
                    New here? Create an account
                  </button>
                )
              )}
            </form>
          </Card>

          <p className="mt-6 text-center text-xs text-gray-500">
            By signing in, you agree to your workspace policies.
          </p>
        </div>
      </div>
    </div>
  );
}
