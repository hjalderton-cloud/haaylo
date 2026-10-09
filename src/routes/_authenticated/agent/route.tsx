import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell, CARD } from "@/components/AppShell";
import { PINK, MUTED } from "@/components/WorkflowNav";
import { NAVY, SURFACE, LINE } from "@/lib/theme";
import { canUse, type Tier } from "@/lib/tier";
import { getMyTier } from "@/lib/tier.functions";
import { Lock, Sparkles, CalendarCheck, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/agent")({
  component: AgentLayout,
});

function AgentLayout() {
  const tierFn = useServerFn(getMyTier);
  const [tier, setTier] = useState<Tier | null>(null);

  useEffect(() => {
    let off = false;
    void (async () => {
      try {
        const res = await tierFn();
        if (!off) setTier(res.tier);
      } catch {
        if (!off) setTier("none");
      }
    })();
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locked = tier !== null && !canUse(tier, "agent");

  return (
    <AppShell title="AI Agent">
      {tier === null ? (
        <div style={{ ...CARD, padding: 24, color: MUTED }}>Checking your plan…</div>
      ) : locked ? (
        <div style={{ ...CARD, padding: "48px 32px", maxWidth: 560, margin: "40px auto", textAlign: "center" }}>
          <div style={{
            width: 72, height: 72, borderRadius: "50%", margin: "0 auto 20px",
            background: "rgba(236,72,153,0.12)", border: `1px solid rgba(236,72,153,0.35)`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Lock size={32} color={PINK} />
          </div>
          <h1 style={{ margin: "0 0 10px", fontSize: 24 }}>AI Agent — Pro plan and above</h1>
          <p style={{ margin: "0 0 28px", color: MUTED, lineHeight: 1.6 }}>
            Let the AI Agent run your content operation while you focus on your business.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, textAlign: "left", marginBottom: 32 }}>
            {[
              { icon: Sparkles, text: "Generates posts from your strategy automatically" },
              { icon: CalendarCheck, text: "Proposes a schedule — you approve before anything goes live" },
              { icon: TrendingUp, text: "Tracks what's working and adapts your content plan" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                  background: SURFACE, border: `1px solid ${LINE}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon size={16} color={PINK} />
                </div>
                <span style={{ fontSize: 14, lineHeight: 1.5 }}>{text}</span>
              </div>
            ))}
          </div>
          <Link
            to="/pricing"
            style={{
              display: "block", padding: "12px 18px", borderRadius: 10,
              background: PINK, color: "#fff", fontWeight: 600, textDecoration: "none",
            }}
          >
            Upgrade to Pro
          </Link>
          <Link
            to="/pricing"
            style={{ display: "inline-block", marginTop: 14, color: MUTED, fontSize: 14, textDecoration: "none" }}
          >
            See what's included in Pro →
          </Link>
        </div>
      ) : <Outlet />}
    </AppShell>
  );
}
