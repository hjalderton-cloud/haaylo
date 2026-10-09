import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CARD } from "@/components/AppShell";
import { PINK, MUTED } from "@/components/WorkflowNav";
import { LINE } from "@/lib/theme";
import { useActiveProject } from "@/hooks/useActiveProject";
import { getAgentHome, type AgentActivity } from "@/lib/agent-queue.functions";

export const Route = createFileRoute("/_authenticated/agent/")({
  head: () => ({
    meta: [
      { title: "AI Agent home — haaylo.com" },
      { name: "description", content: "What your AI agent drafted, scheduled and flagged this week. Nothing publishes without your approval." },
      { property: "og:title", content: "AI Agent home — haaylo" },
      { property: "og:description", content: "Your agent's week at a glance: posts drafted, posts scheduled, leads captured." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgentHome,
});

type Home = {
  generated: number; pending: number; scheduled: number; rejected: number; leads: number;
  activity: AgentActivity[];
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ ...CARD, padding: 18, flex: "1 1 160px" }}>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
      <div style={{ color: MUTED, fontSize: 13 }}>{label}</div>
    </div>
  );
}

function AgentHome() {
  const activeProjectId = useActiveProject();
  const homeFn = useServerFn(getAgentHome);
  const [data, setData] = useState<Home | null>(null);

  useEffect(() => {
    let off = false;
    setData(null);
    void (async () => {
      try {
        const res = await homeFn({ data: { projectId: activeProjectId ?? null } });
        if (!off) setData(res as Home);
      } catch {
        if (!off) setData({ generated: 0, pending: 0, scheduled: 0, rejected: 0, leads: 0, activity: [] });
      }
    })();
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId]);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 26 }}>AI Agent</h1>
        <p style={{ color: MUTED, margin: "6px 0 0" }}>
          Runs on its own every week, drafting posts from your Brand DNA, brand voice and content plan.
          You review what it leaves here; nothing is published without you.
        </p>
      </div>

      {!data ? (
        <div style={{ ...CARD, padding: 24, color: MUTED }}>Loading your agent's week…</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Stat label="Posts drafted this week" value={data.generated} />
            <Stat label="Waiting for your review" value={data.pending} />
            <Stat label="Scheduled this week" value={data.scheduled} />
            <Stat label="Leads captured this week" value={data.leads} />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link
              to="/agent/queue"
              style={{ padding: "10px 16px", borderRadius: 10, background: PINK, color: "#fff", fontWeight: 600, textDecoration: "none" }}
            >
              Review the queue
            </Link>
            <Link
              to="/agent/settings"
              style={{ padding: "10px 16px", borderRadius: 10, background: "transparent", color: MUTED, textDecoration: "none", border: `1px solid ${LINE}` }}
            >
              Agent settings
            </Link>
          </div>

        </>
      )}
    </div>
  );
}
