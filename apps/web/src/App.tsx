import { useEffect, useMemo, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  me as fetchMe,
  logout,
  deleteAccount as deleteAccountApi,
} from "./features/auth/api";
import { disconnectSocket } from "./features/realtime/socket";

import { Login } from "./features/auth/pages/Login";
import { OrganizationsPage } from "./features/auth/pages/Organizations";
import { SignupMember } from "./features/auth/pages/SignupMember";
import { SignupOwner } from "./features/auth/pages/SignupOwner";
import { SignupInvite } from "./features/auth/pages/SignupInvite";
import { Documents } from "./features/documents/pages/Documents";
import { EditorPage } from "./features/editor/pages/Editor";
import { AdminPage } from "./features/admin/pages/Admin";

import { AppHeader } from "./components/layout/AppHeader";

import {
  rememberPendingInvite,
  readPendingInvite,
  takePendingInvite,
} from "./app/routes";

import {
  hasToken,
  readMeLocal,
  normalizeMe,
  clearSession,
  type MeUser,
} from "./app/session";

import { acceptDocumentInviteToken, acceptOrgInviteToken } from "./app/invite";

function isAuthPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/signup/owner" ||
    pathname.startsWith("/signup/invite/")
  );
}

function isProtectedPath(pathname: string) {
  return (
    pathname === "/documents" ||
    pathname.startsWith("/documents/") ||
    pathname === "/organizations" ||
    pathname === "/admin" ||
    pathname.startsWith("/invite/org/") ||
    pathname.startsWith("/invite/document/")
  );
}

function readAccessTokenFromSearch(search: string) {
  const params = new URLSearchParams(search);
  const raw = params.get("access");
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

function readDocumentIdFromPathname(pathname: string) {
  const match = /^\/documents\/([^/?#]+)/.exec(pathname);
  const raw = match?.[1]?.trim();
  return raw ? raw : null;
}

function defaultAuthedPath(user: MeUser | null) {
  return user?.orgRole === "OrgAdmin" || user?.orgRole === "OrgOwner"
    ? "/admin"
    : "/documents";
}

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message.trim()) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [authChecked, setAuthChecked] = useState(false);
  const [me, setMe] = useState<MeUser | null>(() => readMeLocal());
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const isAdmin = useMemo(
    () => me?.orgRole === "OrgAdmin" || me?.orgRole === "OrgOwner",
    [me]
  );

  const isOrgOwner = me?.orgRole === "OrgOwner";
  const inAdmin = location.pathname === "/admin";
  const onAuthPage = isAuthPath(location.pathname);
  const inEditorRoute = location.pathname.startsWith("/documents/");

  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        disconnectSocket();
      } catch {
        // ignore
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      const pathname = location.pathname;
      const search = location.search;

      const orgInviteMatch = pathname.match(/^\/invite\/org\/([^/]+)$/);
      const documentInviteMatch = pathname.match(/^\/invite\/document\/([^/]+)$/);
      const signupInviteMatch = pathname.match(/^\/signup\/invite\/([^/]+)$/);
      const sharedDocumentId = readDocumentIdFromPathname(pathname);
      const sharedAccessToken = readAccessTokenFromSearch(search);

      const orgInviteToken = orgInviteMatch?.[1];
      const documentInviteToken = documentInviteMatch?.[1];
      const signupInviteToken = signupInviteMatch?.[1];

      if (!hasToken()) {
        if (sharedDocumentId && sharedAccessToken) {
          rememberPendingInvite({
            name: "documentLinkOpen",
            documentId: sharedDocumentId,
            token: sharedAccessToken,
          });
          if (alive) {
            setAuthChecked(true);
            navigate("/login", { replace: true });
          }
          return;
        }

        if (documentInviteToken) {
          rememberPendingInvite({ name: "documentInviteAccept", token: documentInviteToken });
          if (alive) {
            setAuthChecked(true);
            navigate("/login", { replace: true });
          }
          return;
        }

        if (orgInviteToken) {
          rememberPendingInvite({ name: "orgInviteAccept", token: orgInviteToken });
          if (alive) {
            setAuthChecked(true);
            navigate("/login", { replace: true });
          }
          return;
        }

        if (alive) {
          setAuthChecked(true);

          if (
            signupInviteToken ||
            pathname === "/login" ||
            pathname === "/signup" ||
            pathname === "/signup/owner"
          ) {
            return;
          }

          if (isProtectedPath(pathname) || pathname === "/") {
            navigate("/login", { replace: true });
          }
        }
        return;
      }

      try {
        const u = await fetchMe();
        if (!alive) return;

        const normalized = normalizeMe(u);
        setMe(normalized);
        localStorage.setItem("me", JSON.stringify(normalized));

        const pending = takePendingInvite();
        if (pending) {
          if (pending.name === "documentLinkOpen") {
            navigate(
              `/documents/${encodeURIComponent(pending.documentId)}?access=${encodeURIComponent(
                pending.token
              )}`,
              { replace: true }
            );
            return;
          }

          if (pending.name === "signupInvite") {
            navigate(defaultAuthedPath(normalized), { replace: true });
            return;
          }

          if (pending.name === "orgInviteAccept") {
            navigate(`/invite/org/${pending.token}`, { replace: true });
            return;
          }

          if (pending.name === "documentInviteAccept") {
            navigate(`/invite/document/${pending.token}`, { replace: true });
            return;
          }
        }

        if (
          pathname === "/" ||
          pathname === "/login" ||
          pathname === "/signup" ||
          pathname === "/signup/owner"
        ) {
          navigate(defaultAuthedPath(normalized), { replace: true });
        }
      } catch {
        try {
          disconnectSocket();
        } catch {
          // ignore
        }

        clearSession();

        if (!alive) return;

        setMe(null);

        if (pathname.startsWith("/signup/invite/")) {
          navigate(pathname, { replace: true });
        } else {
          navigate("/login", { replace: true });
        }
      } finally {
        if (alive) setAuthChecked(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, [location.pathname, location.search, navigate]);

  async function loadCurrentUserAndRouteAfterLogin() {
    try {
      const u = await fetchMe();
      const normalized = normalizeMe(u);

      setMe(normalized);
      localStorage.setItem("me", JSON.stringify(normalized));

      const pending = takePendingInvite();
      if (pending) {
        if (pending.name === "documentLinkOpen") {
          navigate(
            `/documents/${encodeURIComponent(pending.documentId)}?access=${encodeURIComponent(
              pending.token
            )}`,
            { replace: true }
          );
          return;
        }

        if (pending.name === "orgInviteAccept") {
          navigate(`/invite/org/${pending.token}`, { replace: true });
          return;
        }

        if (pending.name === "documentInviteAccept") {
          navigate(`/invite/document/${pending.token}`, { replace: true });
          return;
        }

        if (pending.name === "signupInvite") {
          navigate(defaultAuthedPath(normalized), { replace: true });
          return;
        }
      }

      navigate(defaultAuthedPath(normalized), { replace: true });
    } catch {
      try {
        disconnectSocket();
      } catch {
        // ignore
      }

      clearSession();
      setMe(null);
      navigate("/login", { replace: true });
    }
  }

  async function refreshCurrentUser() {
    try {
      const u = await fetchMe();
      const normalized = normalizeMe(u);
      setMe(normalized);
      localStorage.setItem("me", JSON.stringify(normalized));
    } catch {
      try {
        disconnectSocket();
      } catch {
        // ignore
      }

      clearSession();
      setMe(null);
      navigate("/login", { replace: true });
    }
  }

  async function doLogout() {
    try {
      disconnectSocket();
    } catch {
      // ignore
    }

    await logout();

    clearSession();
    setMe(null);
    navigate("/login", { replace: true });
  }

  async function handleDeleteAccount() {
    if (!me || isDeletingAccount) return;

    if (me.orgRole === "OrgOwner") {
      window.alert("Organization owners cannot delete their account.");
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to delete your account? This action cannot be undone."
    );

    if (!confirmed) return;

    try {
      setIsDeletingAccount(true);
      await deleteAccountApi();
      clearSession();
      setMe(null);
      navigate("/login", { replace: true });
      window.alert("Your account has been deleted.");
    } catch (e: unknown) {
      window.alert(getErrorMessage(e, "Failed to delete account"));
    } finally {
      setIsDeletingAccount(false);
    }
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-600">
        Loading...
      </div>
    );
  }

  const pendingInviteForLogin = !hasToken() ? readPendingInvite() : null;
  const loginInviteMode =
    pendingInviteForLogin?.name === "orgInviteAccept" ||
    pendingInviteForLogin?.name === "signupInvite";
  const loginInviteToken = loginInviteMode ? pendingInviteForLogin?.token : undefined;

  return (
    <div className="min-h-screen bg-gray-50">
      {!onAuthPage && !inEditorRoute && (
        <AppHeader
          me={me}
          isAdmin={isAdmin}
          isOrgOwner={isOrgOwner}
          inAdmin={inAdmin}
          onOpenOrganizations={() => navigate("/organizations")}
          onToggleAdmin={() => navigate(inAdmin ? "/documents" : "/admin")}
          onDeleteAccount={handleDeleteAccount}
          onLogout={doLogout}
        />
      )}

      <Routes>
        <Route
          path="/"
          element={<Navigate to={hasToken() ? defaultAuthedPath(me) : "/login"} replace />}
        />

        <Route
          path="/login"
          element={
            <Login
              onLoggedIn={loadCurrentUserAndRouteAfterLogin}
              onGoToSignup={() => navigate("/signup")}
              onGoToSignupInvite={() => {
                if (loginInviteToken) {
                  rememberPendingInvite({ name: "signupInvite", token: loginInviteToken });
                  navigate(`/signup/invite/${loginInviteToken}`);
                  return;
                }
                navigate("/signup");
              }}
              inviteMode={loginInviteMode}
              inviteToken={loginInviteToken}
            />
          }
        />

        <Route
          path="/signup"
          element={
            <SignupMember
              onSignedUp={loadCurrentUserAndRouteAfterLogin}
              onGoToLogin={() => navigate("/login")}
            />
          }
        />

        <Route
          path="/signup/owner"
          element={
            <SignupOwner
              onSignedUp={loadCurrentUserAndRouteAfterLogin}
              onGoToLogin={() => navigate("/login")}
            />
          }
        />

        <Route
          path="/signup/invite/:token"
          element={<SignupInviteRoute onSignedUp={loadCurrentUserAndRouteAfterLogin} />}
        />

        <Route
          path="/documents"
          element={
            hasToken() ? (
              <Documents
                onOpenDocument={(documentId) => navigate(`/documents/${documentId}`)}
              />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/documents/:documentId"
          element={hasToken() ? <EditorRoute /> : <Navigate to="/login" replace />}
        />

        <Route
          path="/organizations"
          element={
            hasToken() ? (
              <OrganizationsPage
                onSessionChanged={refreshCurrentUser}
                onOpenWorkspace={() => navigate(defaultAuthedPath(readMeLocal()), { replace: true })}
              />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/admin"
          element={
            hasToken() ? (
              <AdminPage onBack={() => navigate("/documents")} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/invite/org/:token"
          element={
            hasToken() ? (
              <OrgInviteAcceptRoute
                meEmail={me?.email}
                isAdmin={isAdmin}
                onLogout={doLogout}
              />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/invite/document/:token"
          element={
            hasToken() ? (
              <DocumentInviteAcceptRoute
                meEmail={me?.email}
                isAdmin={isAdmin}
                onLogout={doLogout}
              />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="*"
          element={<Navigate to={hasToken() ? defaultAuthedPath(me) : "/login"} replace />}
        />
      </Routes>
    </div>
  );
}

function SignupInviteRoute(props: {
  onSignedUp: () => void;
}) {
  const navigate = useNavigate();
  const params = useParams<{ token: string }>();

  const token = params.token ?? "";

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return (
    <SignupInvite
      token={token}
      onSignedUp={props.onSignedUp}
      onGoToLogin={() => {
        rememberPendingInvite({ name: "orgInviteAccept", token });
        navigate("/login");
      }}
    />
  );
}

function EditorRoute() {
  const navigate = useNavigate();
  const params = useParams<{ documentId: string }>();

  const documentId = params.documentId ?? "";

  if (!documentId) {
    return <Navigate to="/documents" replace />;
  }

  return <EditorPage documentId={documentId} onBack={() => navigate("/documents")} />;
}

function OrgInviteAcceptRoute(props: {
  meEmail?: string;
  isAdmin: boolean;
  onLogout: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const params = useParams<{ token: string }>();

  const token = params.token ?? "";

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return (
    <OrgInviteAcceptView
      token={token}
      meEmail={props.meEmail}
      onSwitchAccount={async () => {
        rememberPendingInvite({ name: "orgInviteAccept", token });
        await props.onLogout();
      }}
      onAccepted={() => {
        navigate(props.isAdmin ? "/admin" : "/documents", { replace: true });
      }}
      onCancel={() => {
        navigate(hasToken() ? (props.isAdmin ? "/admin" : "/documents") : "/login", {
          replace: true,
        });
      }}
    />
  );
}

function DocumentInviteAcceptRoute(props: {
  meEmail?: string;
  isAdmin: boolean;
  onLogout: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const params = useParams<{ token: string }>();

  const token = params.token ?? "";

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return (
    <DocumentInviteAcceptView
      token={token}
      meEmail={props.meEmail}
      onSwitchAccount={async () => {
        rememberPendingInvite({ name: "documentInviteAccept", token });
        await props.onLogout();
      }}
      onAccepted={() => {
        navigate("/documents", { replace: true });
      }}
      onCancel={() => {
        navigate(hasToken() ? (props.isAdmin ? "/admin" : "/documents") : "/login", {
          replace: true,
        });
      }}
    />
  );
}

function OrgInviteAcceptView({
  token,
  meEmail,
  onAccepted,
  onSwitchAccount,
  onCancel,
}: {
  token: string;
  meEmail?: string;
  onAccepted: () => void;
  onSwitchAccount: () => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "accepting" | "accepted" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      setStatus("accepting");
      setError(null);

      try {
        const out = await acceptOrgInviteToken(token);
        if (!alive) return;

        if (out?.joined) {
          setStatus("accepted");
          onAccepted();
          return;
        }

        setStatus("error");
        setError("Invite could not be accepted.");
      } catch (e: unknown) {
        if (!alive) return;
        setStatus("error");
        setError(getErrorMessage(e, "Failed to accept organization invite"));
      }
    })();

    return () => {
      alive = false;
    };
  }, [token, onAccepted]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="text-sm font-semibold text-gray-900">Accept organization invite</div>
        <div className="mt-1 text-xs text-gray-600">
          We’ll add you to the organization after you accept.
        </div>

        {status === "accepting" && (
          <div className="mt-4 text-sm text-gray-700">Accepting invite...</div>
        )}

        {status === "error" && (
          <div className="mt-4">
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
              {error ?? "Failed to accept invite"}
            </div>

            <div className="mt-3 text-xs text-gray-600">
              {meEmail ? (
                <>
                  You are currently logged in as: <span className="font-medium">{meEmail}</span>.
                </>
              ) : (
                <>You may be logged in with the wrong account.</>
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={onSwitchAccount}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Switch account
              </button>

              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {status === "accepted" && (
          <div className="mt-4 text-sm text-gray-700">Accepted. Redirecting...</div>
        )}
      </div>
    </div>
  );
}

function DocumentInviteAcceptView({
  token,
  meEmail,
  onAccepted,
  onSwitchAccount,
  onCancel,
}: {
  token: string;
  meEmail?: string;
  onAccepted: () => void;
  onSwitchAccount: () => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "accepting" | "accepted" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      setStatus("accepting");
      setError(null);

      try {
        const out = await acceptDocumentInviteToken(token);
        if (!alive) return;

        if (out?.accepted) {
          setStatus("accepted");
          onAccepted();
          return;
        }

        setStatus("error");
        setError("Invite could not be accepted.");
      } catch (e: unknown) {
        if (!alive) return;
        setStatus("error");
        setError(getErrorMessage(e, "Failed to accept document invite"));
      }
    })();

    return () => {
      alive = false;
    };
  }, [token, onAccepted]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="text-sm font-semibold text-gray-900">Accept document invite</div>
        <div className="mt-1 text-xs text-gray-600">
          We’ll add the document to your workspace after you accept.
        </div>

        {status === "accepting" && (
          <div className="mt-4 text-sm text-gray-700">Accepting invite...</div>
        )}

        {status === "error" && (
          <div className="mt-4">
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
              {error ?? "Failed to accept invite"}
            </div>

            <div className="mt-3 text-xs text-gray-600">
              {meEmail ? (
                <>
                  You are currently logged in as: <span className="font-medium">{meEmail}</span>.
                </>
              ) : (
                <>You may be logged in with the wrong account.</>
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={onSwitchAccount}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Switch account
              </button>

              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {status === "accepted" && (
          <div className="mt-4 text-sm text-gray-700">Accepted. Redirecting...</div>
        )}
      </div>
    </div>
  );
}
