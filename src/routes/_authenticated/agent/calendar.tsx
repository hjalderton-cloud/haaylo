import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CARD } from "@/components/AppShell";
import { PINK, MUTED } from "@/components/WorkflowNav";
import { LINE, NAVY as THEME_NAVY } from "@/lib/theme";
import { useActiveProject } from "@/hooks/useActiveProject";
import { listAgentPosts, type AgentPostRow } from "@/lib/agent-queue.functions";

export const Route = createFileRoute("/_authenticated/agent/calendar")({
  head: () => ({
    meta: [
      { title: "Agent calendar — haaylo.com" },
      { name: "description", content: "Every post the AI agent has scheduled, with who approved it and when." },
      { property: "og:title", content: "Agent calendar — haaylo" },
      { property: "og:description", content: "A month view of agent-approved posts only, kept apart from your own calendar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgentCalendar,
});

function monthDays(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7)); // Monday-first
  return Array.from({ length: 42 }, (_, i) => new Date(start.getTime() + i * 86_400_000));
}

const key = (d: Date) => d.toISOString().slice(0, 10);

function AgentCalendar() {
  const projectId = useActiveProject();
  const listFn = useServerFn(listAgentPosts);
  const [posts, setPosts] = useState<AgentPostRow[] | null>(null);
  const [anchor, setAnchor] = useState(() => new Date());

  useEffect(() => {
    let off = false;
    setPosts(null);
    void (async () => {
      try {
        const res = await listFn({ data: { projectId: projectId ?? null, status: "scheduled" } });
        if (!off) setPosts(res.posts);
      } catch { if (!off) setPosts([]); }
    })();
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const byDay = useMemo(() => {
    const map = new Map<string, AgentPostRow[]>();
    for (const p of posts ?? []) {
      if (!p.scheduled_at) continue;
      const k = new Date(p.scheduled_at).toISOString().slice(0, 10);
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    return map;
  }, [posts]);

  const days = monthDays(anchor);
  const month = anchor.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>Agent calendar</h1>
          <p style={{ color: MUTED, margin: "4px 0 0" }}>Agent-approved posts only. Your own schedule lives in Schedule &amp; Publish.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))} style={navBtn}>←</button>
          <strong>{month}</strong>
          <button onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))} style={navBtn}>→</button>
        </div>
      </div>

      {posts === null ? (
        <div style={{ ...CARD, padding: 24, color: MUTED }}>Loading the agent calendar…</div>
      ) : (
        <div style={{ ...CARD, padding: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} style={{ color: MUTED, fontSize: 12, textAlign: "center", padding: 4 }}>{d}</div>
            ))}
            {days.map((d) => {
              const items = byDay.get(key(d)) ?? [];
              const dim = d.getMonth() !== anchor.getMonth();
              return (
                <div
                  key={d.toISOString()}
                  style={{
                    minHeight: 92, borderRadius: 10, padding: 6,
                    border: `1px solid ${LINE}`,
                    opacity: dim ? 0.4 : 1,
                    display: "grid", gap: 4, alignContent: "start",
                  }}
                >
                  <span style={{ fontSize: 12, color: MUTED }}>{d.getDate()}</span>
                  {items.map((p) => (
                    <div key={p.id} style={{ background: PINK, color: "#fff", borderRadius: 6, padding: "4px 6px", fontSize: 11, lineHeight: 1.3 }}>
                      <strong style={{ display: "block" }}>
                        {new Date(p.scheduled_at!).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · {p.platform}
                      </strong>
                      {p.caption.slice(0, 48)}…
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ ...CARD, padding: 18 }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 18 }}>Scheduled by the agent</h2>
        {!posts?.length ? (
          <p style={{ color: MUTED, margin: 0 }}>Nothing approved yet.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
            {posts.map((p) => (
              <li key={p.id} style={{ borderBottom: `1px solid ${LINE}`, paddingBottom: 8 }}>
                <div style={{ fontSize: 12, color: MUTED }}>
                  Scheduled by AI Agent — approved by {p.approved_by ?? "you"} on{" "}
                  {p.approved_at ? new Date(p.approved_at).toLocaleDateString("en-GB") : "—"}
                </div>
                <div>{p.caption.slice(0, 140)}{p.caption.length > 140 ? "…" : ""}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const navBtn: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 8, background: "transparent",
  color: THEME_NAVY, border: `1px solid ${LINE}`, cursor: "pointer",
};
