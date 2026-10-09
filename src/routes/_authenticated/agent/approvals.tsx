import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CARD } from "@/components/AppShell";
import { PINK, NAVY, MUTED } from "@/components/WorkflowNav";
import { LINE, NAVY as THEME_NAVY } from "@/lib/theme";
import { useActiveProject } from "@/hooks/useActiveProject";
import { listToolApprovals, decideToolApproval, approveAndRun } from "@/lib/tool-registry/approvals.functions";

export const Route = createFileRoute("/_authenticated/agent/approvals")({
  head: () => ({
    meta: [
      { title: "Agent approvals — haaylo.com" },
      {
        name: "description",
        content:
          "Everything the AI agent wants to do that needs your say-so, with the exact details it asked for.",
      },
      { property: "og:title", content: "Agent approvals — haaylo" },
      {
        property: "og:description",
        content: "Approve or turn down the agent's requests before anything is created or sent.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgentApprovals,
});

type Row = {
  id: string;
  tool_name: string;
  risk: string;
  summary: string | null;
  input: Record<string, unknown>;
  status: string;
  reason: string | null;
  error: string | null;
  expires_at: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Waiting on you",
  approved: "Approved",
  rejected: "Turned down",
  executed: "Done",
  failed: "Did not work",
};

function Pill({ text, tone }: { text: string; tone: "pink" | "plain" }) {
  return (
    <span
      style={{
        borderRadius: 999,
        padding: "3px 10px",
        fontSize: 12,
        background: tone === "pink" ? PINK : "transparent",
        color: tone === "pink" ? "#fff" : MUTED,
        border: tone === "pink" ? `1px solid ${PINK}` : `1px solid ${LINE}`,
      }}
    >
      {text}
    </span>
  );
}

function RequestCard({ row, onDone }: { row: Row; onDone: () => void }) {
  const runFn = useServerFn(approveAndRun);
  const decideFn = useServerFn(decideToolApproval);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [showReason, setShowReason] = useState(false);

  const approve = async () => {
    setBusy(true);
    try {
      await runFn({ data: { approvalId: row.id } });
      toast.success("Approved and done.");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That could not be completed.");
      onDone();
    }
    setBusy(false);
  };

  const reject = async () => {
    setBusy(true);
    try {
      await decideFn({
        data: { approvalId: row.id, decision: "reject", ...(reason.trim() ? { reason: reason.trim() } : {}) },
      });
      toast.success("Turned down.");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not turn that down.");
    }
    setBusy(false);
  };

  const details = Object.entries(row.input).filter(([k]) => k !== "workspaceId");

  return (
    <article style={{ ...CARD, padding: 18, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Pill text={row.risk === "HIGH" ? "Goes public" : "Makes a change"} tone="pink" />
        <Pill text={row.tool_name.replace(/_/g, " ")} tone="plain" />
        <span style={{ color: MUTED, fontSize: 12 }}>
          asked {new Date(row.created_at).toLocaleString("en-GB")}
        </span>
      </div>

      <h3 style={{ margin: 0, fontSize: 16 }}>{row.summary ?? row.tool_name}</h3>

      {details.length ? (
        <dl style={{ margin: 0, display: "grid", gap: 6, fontSize: 13, color: MUTED }}>
          {details.map(([key, value]) => (
            <div key={key} style={{ display: "flex", gap: 8 }}>
              <dt style={{ minWidth: 130 }}>{key.replace(/([A-Z])/g, " $1").toLowerCase()}</dt>
              <dd style={{ margin: 0, color: THEME_NAVY, wordBreak: "break-word" }}>
                {typeof value === "string" ? value : JSON.stringify(value)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {showReason ? (
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why not? (optional)"
          rows={2}
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: `1px solid ${LINE}`,
            background: "#FFFFFF",
            color: THEME_NAVY,
            fontSize: 14,
            resize: "vertical",
          }}
        />
      ) : null}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={approve}
          disabled={busy}
          style={{
            padding: "9px 16px",
            borderRadius: 10,
            border: "none",
            background: PINK,
            color: "#fff",
            fontWeight: 600,
            cursor: busy ? "default" : "pointer",
          }}
        >
          {busy ? "Working…" : "Approve and run"}
        </button>
        <button
          type="button"
          onClick={() => (showReason ? void reject() : setShowReason(true))}
          disabled={busy}
          style={{
            padding: "9px 16px",
            borderRadius: 10,
            background: "transparent",
            color: MUTED,
            border: `1px solid ${LINE}`,
            cursor: busy ? "default" : "pointer",
          }}
        >
          {showReason ? "Confirm turn down" : "Turn down"}
        </button>
      </div>
    </article>
  );
}

function AgentApprovals() {
  const projectId = useActiveProject();
  const listFn = useServerFn(listToolApprovals);
  const [rows, setRows] = useState<Row[] | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = (await listFn({ data: { workspaceId: projectId } })) as unknown as Row[];
      setRows(res);
    } catch {
      setRows([]);
    }
  }, [listFn, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!projectId) {
    return <div style={{ ...CARD, padding: 24, color: MUTED }}>Pick a workspace first.</div>;
  }
  if (rows === null) {
    return <div style={{ ...CARD, padding: 24, color: MUTED }}>Loading requests…</div>;
  }

  const pending = rows.filter((r) => r.status === "pending");
  const history = rows.filter((r) => r.status !== "pending").slice(0, 20);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <header>
        <h1 style={{ margin: "0 0 6px", fontSize: 22 }}>Approvals</h1>
        <p style={{ margin: 0, color: MUTED, fontSize: 14, lineHeight: 1.6 }}>
          The agent can read your workspace and write drafts on its own. Anything that changes your
          saved work or goes out publicly waits here until you say yes.
        </p>
      </header>

      {pending.length ? (
        <div style={{ display: "grid", gap: 12 }}>
          {pending.map((row) => (
            <RequestCard key={row.id} row={row} onDone={() => void load()} />
          ))}
        </div>
      ) : (
        <div style={{ ...CARD, padding: 24, color: MUTED }}>Nothing waiting on you.</div>
      )}

      {history.length ? (
        <section style={{ display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Recent decisions</h2>
          {history.map((row) => (
            <div
              key={row.id}
              style={{
                ...CARD,
                padding: 14,
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
                fontSize: 13,
              }}
            >
              <Pill text={STATUS_LABEL[row.status] ?? row.status} tone="plain" />
              <span>{row.summary ?? row.tool_name}</span>
              {row.error ? <span style={{ color: PINK }}>{row.error}</span> : null}
              {row.reason ? <span style={{ color: MUTED }}>“{row.reason}”</span> : null}
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
