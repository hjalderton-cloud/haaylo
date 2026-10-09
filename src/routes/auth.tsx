import { createFileRoute, useSearch, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import { BG, NAVY, INDIGO, PURPLE, LINE, GREY, font, POPPINS_LINKS } from "@/lib/theme";


const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in to haaylo.com — Inbound Engine & Social Planner" },
      { name: "description", content: "Sign in or create your haaylo.com account to access the AI Inbound Engine and Social Planner for LinkedIn, Facebook and Instagram." },
      { property: "og:title", content: "Sign in to haaylo.com" },
      { property: "og:description", content: "Access your AI Inbound Engine and Social Planner." },
      { property: "og:url", content: "https://appcontentcollectiv.lovable.app/auth" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "canonical", href: "https://appcontentcollectiv.lovable.app/auth" },
      ...POPPINS_LINKS,
    ],
  }),
  component: AuthPage,
});

function safePath(raw?: string): string | null {
  if (!raw) return null;
  try {
    // Accept absolute same-origin URLs and relative paths only.
    const url = raw.startsWith("/") ? new URL(raw, window.location.origin) : new URL(raw);
    if (url.origin !== window.location.origin) return null;
    const path = url.pathname + url.search;
    if (path.startsWith("/auth")) return null;
    return path;
  } catch {
    return null;
  }
}

const OAUTH_INTENT_KEY = "haaylo-oauth-intent";

function AuthPage() {
  const { redirect } = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [existingEmail, setExistingEmail] = useState<string | null>(null);

  function go(fallback: string) {
    const target = safePath(redirect) || fallback;
    try { window.sessionStorage.removeItem(OAUTH_INTENT_KEY); } catch { /* ignore */ }
    window.location.assign(target);
  }

  // Never sign someone straight through on arrival: if a session already
  // exists we surface it and let the user choose. The only automatic hop is
  // the return leg of an OAuth flow the user started on this screen.
  useEffect(() => {
    let active = true;
    let oauthReturn = false;
    try { oauthReturn = window.sessionStorage.getItem(OAUTH_INTENT_KEY) === "1"; } catch { /* ignore */ }

    supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user || data.user.is_anonymous) return;
      if (oauthReturn) go("/engine");
      else setExistingEmail(data.user.email ?? "your account");
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active || event !== "SIGNED_IN" || !session?.user || session.user.is_anonymous) return;
      let intent = false;
      try { intent = window.sessionStorage.getItem(OAUTH_INTENT_KEY) === "1"; } catch { /* ignore */ }
      if (intent) go("/engine");
      else setExistingEmail(session.user.email ?? "your account");
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redirect]);

  async function useDifferentAccount() {
    setBusy(true);
    try {
      await supabase.auth.signOut();
      setExistingEmail(null);
    } finally {
      setBusy(false);
    }
  }


  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/brain/setup?onboarding=1" },
        });
        if (error) throw error;
        // Supabase returns a user with no identities when the email is already
        // registered — surface that instead of a misleading "check your email".
        const alreadyRegistered =
          !data.session && !!data.user && (data.user.identities?.length ?? 0) === 0;
        if (alreadyRegistered) {
          toast.error("You already have an account with that email. Sign in instead.");
          setMode("signin");
          setPassword("");
          return;
        }
        if (!data.session) {
          toast.success("Account created. Check your email to confirm your address, then sign in.");
          setMode("signin");
          setPassword("");
          return;
        }
        go("/brain/setup?onboarding=1");
        return;
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.session?.user || data.session.user.is_anonymous) {
        throw new Error("Sign in did not complete. Please try again.");
      }
      go("/engine");
    } catch (err) {
      toast.error(friendlyError(err, mode === "signup" ? "We could not create your account. Please try again." : "We could not sign you in. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      toast.error("Enter your email above first, then click 'Forgot password'.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/reset-password",
      });
      if (error) throw error;
      toast.success("Check your inbox for a reset link.");
    } catch (err) {
      toast.error(friendlyError(err, "We could not send the reset email. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    try { window.sessionStorage.setItem(OAUTH_INTENT_KEY, "1"); } catch { /* ignore */ }
    const redirectTo = `${window.location.origin}/auth${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`;
    try {
      // Base44 preview: Lovable's /~oauth broker only exists on Lovable hosting,
      // so use Supabase's native Google provider directly.
      if (import.meta.env.VITE_BASE44_PREVIEW_MODE === "1") {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo },
        });
        if (error) throw error;
        return;
      }
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: redirectTo,
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user || data.user.is_anonymous) {
        throw error ?? new Error("Google sign-in did not complete. Please try again.");
      }
      go("/engine");
    } catch (err) {
      try { window.sessionStorage.removeItem(OAUTH_INTENT_KEY); } catch { /* ignore */ }
      toast.error(friendlyError(err, "Google sign-in did not complete. Please try again."));
      setBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    background: "#FFFFFF",
    border: `1px solid ${LINE}`,
    color: NAVY,
    fontFamily: font,
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{
        background: BG,
        fontFamily: font,
        color: NAVY,
      }}
    >
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="inline-flex items-center gap-1 mb-5 text-xs font-bold"
          style={{ color: PURPLE }}
        >
          ← Back
        </Link>

        <h1 className="text-center text-3xl font-bold mb-2" style={{ color: NAVY, fontFamily: font, letterSpacing: "-0.02em" }}>
          haaylo.com
        </h1>
        <p
          className="text-center mb-8"
          style={{ color: NAVY, fontSize: 15, lineHeight: 1.55 }}
        >
          {mode === "signup"
            ? "Create your account — your first generation is on us."
            : "Welcome back. Sign in to your Engine."}
        </p>

        {/* Card */}
        <div
          className="rounded-2xl p-6 sm:p-8"
          style={{
            background: "#FFFFFF",
            border: `1px solid ${LINE}`,
            borderRadius: 16,
          }}
        >
          {existingEmail && (
            <div
              className="mb-5 rounded-xl p-4"
              style={{ background: "#F6F7FA", border: `1px solid ${LINE}` }}
            >
              <div style={{ fontSize: 13.5, color: INDIGO, marginBottom: 10 }}>
                You&rsquo;re already signed in as <strong style={{ color: NAVY }}>{existingEmail}</strong>.
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => go("/engine")}
                  disabled={busy}
                  className="px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-50"
                  style={{ background: PURPLE, color: "#FFFFFF" }}
                >
                  Continue to my Engine →
                </button>
                <button
                  type="button"
                  onClick={useDifferentAccount}
                  disabled={busy}
                  className="px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-50"
                  style={{ background: "transparent", color: INDIGO, border: `1px solid ${LINE}` }}
                >
                  Use a different account
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogle}
            disabled={busy}
            className="w-full py-3 rounded-xl font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2 mb-4"
            style={{
              background: "#fff",
              color: NAVY,
              border: `1px solid ${LINE}`,
              fontFamily: font,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-4" style={{ color: GREY, fontSize: 11, letterSpacing: "0.12em" }}>
            <div style={{ flex: 1, height: 1, background: LINE }} />
            OR
            <div style={{ flex: 1, height: 1, background: LINE }} />
          </div>

          <form onSubmit={handleEmail} className="space-y-3">
            <label
              htmlFor="auth-email"
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: INDIGO,
                display: "block",
              }}
            >
              Email
            </label>
            <input
              id="auth-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 rounded-xl outline-none"
              style={inputStyle}
            />
            <label
              htmlFor="auth-password"
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: INDIGO,
                display: "block",
                marginTop: 8,
              }}
            >
              Password
            </label>
            <input
              id="auth-password"
              name="password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
              className="w-full px-4 py-3 rounded-xl outline-none"
              style={inputStyle}
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 rounded-xl font-semibold transition disabled:opacity-50 mt-2"
              style={{
                background: PURPLE,
                color: "#ffffff",
                fontFamily: font,
                letterSpacing: "0.01em",
              }}
            >
              {busy ? "..." : mode === "signup" ? "Create account →" : "Sign in →"}
            </button>
          </form>

          {mode === "signin" && (
            <p className="mt-4 text-center text-sm">
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={busy}
                style={{ color: PURPLE, fontWeight: 600, fontSize: 13 }}
              >
                Forgot password?
              </button>
            </p>
          )}

          <p
            className="mt-6 text-center text-sm"
            style={{ color: NAVY }}
          >
            {mode === "signup" ? "Already have an account?" : "New here?"}{" "}
            <button
              type="button"
              onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              style={{ color: PURPLE, fontWeight: 700 }}
            >
              {mode === "signup" ? "Sign in" : "Create one"}
            </button>
          </p>
        </div>

        <p
          className="text-center mt-6"
          style={{ color: NAVY, fontSize: 12, letterSpacing: "0.06em" }}
        >
          By continuing you agree to the{" "}
          <Link to="/terms" style={{ color: PURPLE, fontWeight: 700 }}>
            terms
          </Link>{" "}
          and{" "}
          <Link to="/privacy" style={{ color: PURPLE, fontWeight: 700 }}>
            privacy policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
