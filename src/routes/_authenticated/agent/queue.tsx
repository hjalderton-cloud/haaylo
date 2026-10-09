import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CARD } from "@/components/AppShell";
import { PINK, NAVY, MUTED } from "@/components/WorkflowNav";
import { LINE, NAVY as THEME_NAVY } from "@/lib/theme";
import { useActiveProject } from "@/hooks/useActiveProject";
import {
  listAgentPosts, approveAgentPost, rejectAgentPost, type AgentPostRow,
} from "@/lib/agent-queue.functions";
import { triggerAgentRun } from "@/lib/agent.functions";

export const Route = createFileRoute("/_authenticated/agent/queue")({
  head: () => ({
    meta: [
      { title: "Agent post queue — haaylo.com" },
      { name: "description", content: "Every post the AI agent has drafted, waiting for you to approve a time or reject it." },
      { property: "og:title", content: "Agent post queue — haaylo" },
      { property: "og:description", content: "Approve and schedule agent drafts, or reject them with a reason the agent learns from." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgentQueue,
});

const inputStyle: React.CSSProperties = {
  padding: "8px 10px", borderRadius: 8, border: `1px solid ${LINE}`,
  background: "#FFFFFF", color: THEME_NAVY, fontSize: 14,
};

function tomorrowAt9(): { date: string; time: string } {
  const d = new Date(Date.now() + 86_400_000);
  return { date: d.toISOString().slice(0, 10), time: "09:00" };
}

function PostCard({ post, onDone }: { post: AgentPostRow; onDone: () => void }) {
  const approveFn = useServerFn(approveAgentPost);
  const rejectFn = useServerFn(rejectAgentPost);
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");
  const [{ date, time }, setWhen] = useState(tomorrowAt9);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const approve = async () => {
    const iso = new Date(`${date}T${time}:00`).toISOString();
    setBusy(true);
    try {
      const res = await approveFn({ data: { id: post.id, scheduled_at: iso } });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(`Scheduled for ${new Date(iso).toLocaleString("en-GB")} — ${res.accounts.join(", ")}`);
        onDone();
      }
    } catch { toast.error("Could not schedule that post."); }
    setBusy(false);
  };

  const reject = async () => {
    setBusy(true);
    try {
      const res = await rejectFn({ data: { id: post.id, reason: reason.trim() || null } });
      if (!res.ok) toast.error(res.error);
      else { toast.success("Rejected. The agent will take that on board."); onDone(); }
    } catch { toast.error("Could not reject that post."); }
    setBusy(false);
  };

  return (
    <article style={{ ...CARD, padding: 18, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ background: PINK, color: "#fff", borderRadius: 999, padding: "3px 10px", fontSize: 12 }}>
          {post.platform}
        </span>
        {post.pillar ? (
          <span style={{ border: `1px solid ${LINE}`, borderRadius: 999, padding: "3px 10px", fontSize: 12, color: MUTED }}>
            {post.pillar}
          </span>
        ) : null}
        <span style={{ color: MUTED, fontSize: 12 }}>
          drafted {new Date(post.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
        </span>
      </div>

      {post.title ? <h3 style={{ margin: 0, fontSize: 16 }}>{post.title}</h3> : null}
      <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{post.caption}</p>

      {mode === "idle" ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => setMode("approve")}
            style={{ padding: "8px 14px", borderRadius: 8, background: PINK, color: "#fff", border: "none", fontWeight: 600, cursor: "pointer" }}
          >
            Approve &amp; schedule
          </button>
          <button
            onClick={() => setMode("reject")}
            style={{ padding: "8px 14px", borderRadius: 8, background: "transparent", color: MUTED, border: `1px solid ${LINE}`, cursor: "pointer" }}
          >
            Reject
          </button>
        </div>
      ) : mode === "approve" ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input type="date" value={date} onChange={(e) => setWhen((w) => ({ ...w, date: e.target.value }))} style={inputStyle} />
          <input type="time" value={time} onChange={(e) => setWhen((w) => ({ ...w, time: e.target.value }))} style={inputStyle} />
          <button disabled={busy} onClick={approve} style={{ padding: "8px 14px", borderRadius: 8, background: PINK, color: "#fff", border: "none", fontWeight: 600, cursor: "pointer" }}>
            {busy ? "Scheduling…" : "Confirm time"}
          </button>
          <button onClick={() => setMode("idle")} style={{ padding: "8px 12px", borderRadius: 8, background: "transparent", color: MUTED, border: `1px solid ${LINE}`, cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why isn't this right? (optional)"
            style={{ ...inputStyle, width: "100%" }}
          />
          <div style={{ display: "flex", gap: 10 }}>
            <button disabled={busy} onClick={reject} style={{ padding: "8px 14px", borderRadius: 8, background: "transparent", color: "#fff", border: `1px solid ${PINK}`, cursor: "pointer" }}>
              {busy ? "Removing…" : "Confirm reject"}
            </button>
            <button onClick={() => setMode("idle")} style={{ padding: "8px 12px", borderRadius: 8, background: "transparent", color: MUTED, border: `1px solid ${LINE}`, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function AgentQueue() {
  const projectId = useActiveProject();
  const listFn = useServerFn(listAgentPosts);
  const runFn = useServerFn(triggerAgentRun);
  const [posts, setPosts] = useState<AgentPostRow[] | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setPosts(null);
    try {
      const res = await listFn({ data: { projectId: projectId ?? null, status: "pending" } });
      setPosts(res.posts);
    } catch { setPosts([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await runFn({ data: { projectId: projectId ?? null } });
      if (!res.ok) toast.error(res.error ?? "The agent couldn't draft anything this time.");
      else toast.success(`${res.drafted} drafts added for your review.`);
      await load();
    } catch { toast.error("The agent run failed."); }
    setRunning(false);
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>Post queue</h1>
          <p style={{ color: MUTED, margin: "4px 0 0" }}>Nothing here is scheduled until you approve a time.</p>
        </div>
        <button
          onClick={runNow}
          disabled={running}
          style={{ padding: "10px 16px", borderRadius: 10, background: PINK, color: "#fff", border: "none", fontWeight: 600, cursor: "pointer" }}
        >
          {running ? "Drafting…" : "Draft posts now"}
        </button>
      </div>

      {posts === null ? (
        <div style={{ ...CARD, padding: 24, color: MUTED }}>Loading the queue…</div>
      ) : !posts.length ? (
        <div style={{ ...CARD, padding: 24, color: MUTED }}>
          Nothing waiting. Run the agent, or leave it to its schedule.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {posts.map((p) => <PostCard key={p.id} post={p} onDone={() => void load()} />)}
        </div>
      )}
    </div>
  );
}
