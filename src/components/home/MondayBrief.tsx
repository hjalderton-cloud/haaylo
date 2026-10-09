import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { approveReadyDrafts, type HomeActivity } from "@/lib/home-activity.functions";
import type { ChannelPerformance } from "@/lib/dashboard.functions";
import { listCompetitorScans, saveAngleToBank, type CompetitorScan } from "@/lib/competitors.functions";
import { INDIGO, LINE, NAVY, PINK, PURPLE, TINT, card, font, primaryButton, secondaryButton } from "@/lib/theme";

const DISMISS_KEY = "haaylo.home.dismissedMoves";

function briefTitle() {
  const d = new Date();
  const day = d.toLocaleDateString("en-GB", { weekday: "long" });
  return `${day} brief`;
}

function ago(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export function MondayBrief({
  projectId,
  activity,
  channels,
  onOpenPost,
  onChanged,
}: {
  projectId: string | null;
  activity: HomeActivity | null;
  channels: ChannelPerformance | null;
  onOpenPost: (id: string) => void;
  onChanged: () => void;
}) {
  const approveFn = useServerFn(approveReadyDrafts);
  const [approving, setApproving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (!activity) return null;

  const ready = activity.readyDrafts;
  const flagged = activity.flaggedDrafts;
  const top = [...(channels?.channels ?? [])].sort((a, b) => b.published - a.published)[0];
  const changes = activity.recent.slice(0, 3);

  async function approveAll() {
    if (!projectId || ready.length === 0) return;
    setApproving(true);
    try {
      const r = await approveFn({ data: { workspaceId: projectId, ids: ready.map((p) => p.id) } });
      toast.success(
        r.approved.length === 1 ? "1 post approved. Give it a date in the calendar." : `${r.approved.length} posts approved. Give them dates in the calendar.`,
      );
      setConfirming(false);
      onChanged();
    } catch {
      toast.error("Could not approve those posts. Try again.");
    } finally {
      setApproving(false);
    }
  }

  return (
    <section style={{ display: "grid", gap: 14, marginBottom: 28, fontFamily: font }}>
      <div style={{ ...card, padding: "20px 22px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: NAVY }}>Your {briefTitle()}</h2>
          {ready.length > 0 && !confirming && (
            <button type="button" onClick={() => setConfirming(true)} style={{ ...primaryButton, fontSize: 13.5 }}>
              Approve all {ready.length}
            </button>
          )}
        </div>

        {confirming && ready.length > 0 && (
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: "14px 16px", marginBottom: 16, background: TINT.purple }}>
            <p style={{ ...body, margin: "0 0 10px", color: NAVY, fontWeight: 600 }}>
              You are about to approve these {ready.length} posts. Approving does not schedule or publish them; you still pick a date for each one.
            </p>
            <ul style={{ margin: "0 0 12px", padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
              {ready.map((p) => (
                <li key={p.id} style={{ ...body, display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ color: NAVY, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.label}</span>
                  <span style={{ flexShrink: 0, fontSize: 12, color: INDIGO, textTransform: "capitalize" }}>{p.platform}</span>
                </li>
              ))}
            </ul>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => void approveAll()} disabled={approving} style={{ ...primaryButton, fontSize: 13 }}>
                {approving ? "Approving…" : `Yes, approve these ${ready.length}`}
              </button>
              <button type="button" onClick={() => setConfirming(false)} disabled={approving} style={{ ...secondaryButton, fontSize: 13, border: `1px solid ${LINE}` }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <div>
            <h3 style={h3}>What worked</h3>
            <p style={body}>
              {top && top.published > 0
                ? `${top.channel} carried the most: ${top.published} published in the last ${channels?.windowDays ?? 30} days.`
                : "Nothing published yet in the last 30 days, so there is nothing to compare."}
            </p>
            <Link to="/analytics/campaigns" style={link}>See Insights</Link>
          </div>

          <div>
            <h3 style={h3}>What changed</h3>
            {changes.length === 0 ? (
              <p style={body}>No new campaigns or posts this week.</p>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
                {changes.map((c) => (
                  <li key={`${c.kind}-${c.id}`} style={body}>
                    {c.kind === "campaign" ? "New campaign: " : "New post: "}
                    <span style={{ color: NAVY }}>{c.label}</span>{" "}
                    <span style={{ color: INDIGO, fontSize: 12 }}>({ago(c.at)})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div style={{ minWidth: 0, overflow: "hidden" }}>
            <h3 style={h3}>Ready for you</h3>
            {ready.length === 0 && flagged.length === 0 && <p style={body}>No drafts waiting.</p>}
            <div style={{ display: "grid", gap: 6, gridTemplateColumns: "minmax(0, 1fr)" }}>
              {ready.slice(0, 4).map((p) => (
                <ReviewRow key={p.id} label={p.label} tag={p.platform} tone="ok" onClick={() => onOpenPost(p.id)} />
              ))}
              {flagged.slice(0, 3).map((p) => (
                <ReviewRow key={p.id} label={p.label} tag="Needs a look" tone="warn" onClick={() => onOpenPost(p.id)} />
              ))}
            </div>
            {flagged.length > 0 && (
              <p style={{ ...body, fontSize: 12, marginTop: 8 }}>Flagged drafts are left out of Approve all.</p>
            )}
          </div>
        </div>
      </div>

    </section>
  );
}

function ReviewRow({ label, tag, tone, onClick }: { label: string; tag: string; tone: "ok" | "warn"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ all: "unset", cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13.5, minWidth: 0, width: "100%", boxSizing: "border-box", overflow: "hidden" }}
    >
      <span style={{ color: NAVY, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <span
        style={{
          flexShrink: 0,
          fontSize: 11.5,
          fontWeight: 600,
          padding: "2px 8px",
          borderRadius: 999,
          background: tone === "ok" ? TINT.purple : TINT.pink,
          color: tone === "ok" ? PURPLE : PINK,
        }}
      >
        {tag}
      </span>
    </button>
  );
}

export function CompetitorMove({ projectId }: { projectId: string | null }) {
  const listFn = useServerFn(listCompetitorScans);
  const saveFn = useServerFn(saveAngleToBank);
  const [scan, setScan] = useState<CompetitorScan | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    try {
      setDismissed(JSON.parse(window.localStorage.getItem(DISMISS_KEY) ?? "[]"));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!projectId) return;
    let live = true;
    listFn({ data: { projectId } })
      .then((rows) => {
        if (live) setScan(rows.find((r) => r.results.angles.length > 0) ?? null);
      })
      .catch(() => {
        /* home still works without it */
      });
    return () => {
      live = false;
    };
  }, [projectId, listFn]);

  if (!scan || dismissed.includes(scan.id)) return null;
  const angle = scan.results.angles[0]!;

  function dismiss() {
    if (!scan) return;
    const next = [...dismissed, scan.id].slice(-50);
    setDismissed(next);
    try {
      window.localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  async function save() {
    if (!scan) return;
    setSaving(true);
    try {
      await saveFn({ data: { scanId: scan.id, competitor: scan.competitor_name, title: angle.title, body: angle.brief, projectId: projectId ?? undefined } });
      toast.success("Saved to your Content Bank as an idea.");
      dismiss();
    } catch {
      toast.error("Could not save that idea. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ ...card, padding: "18px 22px", borderLeft: `4px solid ${PINK}` }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: PINK, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
        Competitor move
      </div>
      <p style={{ ...body, margin: "0 0 4px" }}>
        From your scan of <span style={{ color: NAVY, fontWeight: 600 }}>{scan.competitor_name}</span> ({ago(scan.created_at)}). An angle they are leaving open:
      </p>
      <h3 style={{ margin: "6px 0 4px", fontSize: 15.5, fontWeight: 700, color: NAVY }}>{angle.title}</h3>
      <p style={{ ...body, margin: "0 0 14px" }}>{angle.brief}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={() => void save()} disabled={saving} style={{ ...primaryButton, fontSize: 13 }}>
          {saving ? "Saving…" : "Save as idea"}
        </button>
        <Link to="/content-plan" style={{ ...secondaryButton, fontSize: 13, textDecoration: "none" }}>
          Add to plan
        </Link>
        <button type="button" onClick={dismiss} style={{ ...secondaryButton, fontSize: 13, border: `1px solid ${LINE}` }}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

const h3: React.CSSProperties = { margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: INDIGO, textTransform: "uppercase", letterSpacing: 0.5 };
const body: React.CSSProperties = { margin: 0, fontSize: 13.5, color: INDIGO, lineHeight: 1.55 };
const link: React.CSSProperties = { display: "inline-block", marginTop: 8, color: PURPLE, fontWeight: 600, fontSize: 13, textDecoration: "none" };
