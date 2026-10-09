import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import { BG, NAVY, INDIGO, PURPLE, LINE, font } from "@/lib/theme";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — haaylo.com" },
      { name: "description", content: "Set a new password for your haaylo.com account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Supabase-js parses the recovery token from the URL hash automatically.
    // We just need to wait for the PASSWORD_RECOVERY event or a session.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) return toast.error("Password must be at least 6 characters.");
    if (password !== confirm) return toast.error("Passwords don't match.");
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated. You're signed in.");
      navigate({ to: "/engine" });
    } catch (err) {
      toast.error(friendlyError(err, "Could not update your password. Please try again."));
    } finally {
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
        <h1
          className="text-center text-3xl font-bold mb-2"
          style={{ color: NAVY, fontFamily: font, letterSpacing: "-0.02em" }}
        >
          Set a new password
        </h1>
        <p className="text-center mb-8" style={{ color: NAVY, fontSize: 15 }}>
          {ready ? "Choose something you'll remember this time." : "Verifying your reset link…"}
        </p>

        <div
          className="rounded-2xl p-6 sm:p-8"
          style={{
            background: "#FFFFFF",
            border: `1px solid ${LINE}`,
            borderRadius: 16,
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-3">
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.18em", color: INDIGO, display: "block" }}>
              New password
            </label>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
              className="w-full px-4 py-3 rounded-xl outline-none"
              style={inputStyle}
            />
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.18em", color: INDIGO, display: "block", marginTop: 8 }}>
              Confirm password
            </label>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Retype password"
              className="w-full px-4 py-3 rounded-xl outline-none"
              style={inputStyle}
            />
            <button
              type="submit"
              disabled={busy || !ready}
              className="w-full py-3 rounded-xl font-semibold transition disabled:opacity-50 mt-2"
              style={{
                background: PURPLE,
                color: "#fff",
                fontFamily: font,
              }}
            >
              {busy ? "Saving…" : "Update password →"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
