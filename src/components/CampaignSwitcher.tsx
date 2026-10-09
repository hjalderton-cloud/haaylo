import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { listCampaigns, type CampaignRecord } from "@/lib/campaigns.functions";
import { useWorkspace } from "@/hooks/useActiveProject";
import { CampaignEngineModal } from "@/components/CampaignEngineModal";
import { SURFACE, NAVY, INDIGO, PURPLE, PINK, GREY, LINE, TINT, font } from "@/lib/theme";

const GROUPS = [
  { key: "active", label: "Active" },
  { key: "past", label: "Past" },
] as const;

function isActive(r: CampaignRecord): boolean {
  const s = (r.status ?? "").toLowerCase();
  return s !== "complete" && s !== "completed" && s !== "archived" && s !== "closed";
}

/** Compact "3 posts · emails · page" line so the state of the work shows in the list. */
function assetLine(r: CampaignRecord): string {
  const bits: string[] = [];
  if (r.has_social_posts) bits.push("posts");
  if (r.has_email_sequence) bits.push("emails");
  if (r.has_landing_page) bits.push("page");
  if (r.has_lead_magnet) bits.push("guide");
  if (r.has_blog) bits.push("blog");
  if (r.has_image_pack) bits.push("images");
  return bits.length ? bits.join(" · ") : "Nothing built yet";
}

export function CampaignSwitcher({
  currentId,
  compact = false,
  label = "Switch campaign",
}: {
  currentId?: string;
  compact?: boolean;
  label?: string;
}) {
  const navigate = useNavigate();
  const { projectId } = useWorkspace();
  const listFn = useServerFn(listCampaigns);
  const [rows, setRows] = useState<CampaignRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(false);
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({});
  const wrap = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listFn({ data: { projectId } });
        if (!cancelled) setRows(data);
      } catch {
        if (!cancelled) setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const current = rows.find((r) => r.id === currentId);
  const buttonLabel = compact ? current?.campaign_title ?? "Campaigns" : label;

  return (
    <div ref={wrap} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          width: compact ? "100%" : undefined,
          maxWidth: compact ? "100%" : 260,
          padding: compact ? "9px 11px" : "9px 13px",
          borderRadius: 12,
          border: `1px solid ${LINE}`,
          background: "#FFFFFF",
          color: NAVY,
          fontSize: compact ? 12.5 : 13,
          fontWeight: 700,
          cursor: "pointer",
          textAlign: "left",
          fontFamily: font,
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {buttonLabel}
        </span>
        <span style={{ color: GREY, fontSize: 10 }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            zIndex: 60,
            top: "calc(100% + 6px)",
            right: compact ? undefined : 0,
            left: compact ? 0 : undefined,
            width: compact ? "100%" : 280,
            maxHeight: 320,
            overflowY: "auto",
            borderRadius: 14,
            border: `1px solid ${LINE}`,
            background: "#FFFFFF",
            boxShadow: "0 18px 40px rgba(20,20,40,0.16)",
            padding: 6,
          }}
        >
          {rows.length === 0 && (
            <p style={{ margin: 0, padding: "10px 10px 12px", fontSize: 12.5, color: GREY, fontFamily: font }}>
              No campaigns yet.
            </p>
          )}
          {GROUPS.map((g) => {
            const list = rows.filter((r) => (g.key === "active" ? isActive(r) : !isActive(r)));
            if (list.length === 0) return null;
            const isOpenGroup = groupOpen[g.key] ?? g.key === "active";
            return (
              <div key={g.key} style={{ marginBottom: 4 }}>
                <button
                  type="button"
                  onClick={() => setGroupOpen((p) => ({ ...p, [g.key]: !isOpenGroup }))}
                  style={{
                    display: "flex",
                    width: "100%",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "7px 10px",
                    border: "none",
                    background: "transparent",
                    color: NAVY,
                    fontSize: 11.5,
                    fontWeight: 800,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                    cursor: "pointer",
                    fontFamily: font,
                  }}
                >
                  <span>
                    {g.label} ({list.length})
                  </span>
                  <span style={{ color: GREY }}>{isOpenGroup ? "▾" : "▸"}</span>
                </button>
                {isOpenGroup &&
                  list.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        navigate({ to: "/campaign/$id", params: { id: r.id } });
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "9px 10px",
                        borderRadius: 10,
                        border: "none",
                        cursor: "pointer",
                        background: r.id === currentId ? TINT.purple : "transparent",
                        color: r.id === currentId ? PURPLE : INDIGO,
                        fontSize: 13,
                        fontWeight: 700,
                        fontFamily: font,
                      }}
                    >
                      <span
                        style={{
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.campaign_title}
                      </span>
                      <span style={{ display: "block", fontSize: 11, color: GREY, fontWeight: 600 }}>
                        {r.campaign_duration === "30-day" ? "30-Day Launch" : "90-Day"}
                        {r.agent_brief ? " · Built by Haaylo" : ""}
                      </span>
                      <span style={{ display: "block", fontSize: 10.5, color: GREY, fontWeight: 600, marginTop: 2 }}>
                        {assetLine(r)}
                      </span>
                    </button>
                  ))}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setModal(true);
            }}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              marginTop: 4,
              padding: "10px",
              borderRadius: 10,
              border: `1px solid ${TINT.pink}`,
              background: TINT.pink,
              color: PINK,
              fontSize: 12.5,
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: font,
            }}
          >
            New Campaign +
          </button>
        </div>
      )}

      <CampaignEngineModal open={modal} onClose={() => setModal(false)} />
    </div>
  );
}
