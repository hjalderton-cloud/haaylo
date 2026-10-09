import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { createCampaign } from "@/lib/campaigns.functions";
import { getStrategyPlan } from "@/lib/strategy.functions";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "@/hooks/useActiveProject";
import { SURFACE, NAVY, INDIGO, PURPLE, PINK, GREY, LINE, TINT, font } from "@/lib/theme";

type Duration = "90-day" | "30-day";

export type CampaignAssets = {
  socialPosts: boolean;
  landingPage: boolean;
  leadMagnet: boolean;
  emailSequence: boolean;
  imagePack: boolean;
};

const EMPTY_ASSETS: CampaignAssets = {
  socialPosts: false,
  landingPage: false,
  leadMagnet: false,
  emailSequence: false,
  imagePack: false,
};

export const ASSET_LABELS: Record<keyof CampaignAssets, string> = {
  socialPosts: "Social posts",
  landingPage: "High-converting landing page",
  leadMagnet: "Matching lead magnet guide",
  emailSequence: "Email nurture sequence (3–5 automated emails)",
  imagePack: "Promotional image pack",
};

const TYPES: { value: Duration; title: string; blurb: string }[] = [
  {
    value: "90-day",
    title: "90-Day Content System",
    blurb: "Steady growth, brand authority, long-form content strategy",
  },
  {
    value: "30-day",
    title: "30-Day Launch Campaign",
    blurb: "High intensity, urgency-driven, sales and conversion focused",
  },
];

const MUTED = GREY;

const panel: React.CSSProperties = {
  borderRadius: 14,
  border: `1px solid ${LINE}`,
  background: "#FFFFFF",
  color: NAVY,
  padding: "11px 12px",
  fontSize: 14,
  width: "100%",
  fontFamily: font,
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  color: MUTED,
  marginBottom: 6,
  fontFamily: font,
};

export function CampaignEngineModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { projectId: activeProjectId, projectName } = useWorkspace();
  const createFn = useServerFn(createCampaign);

  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [theme, setTheme] = useState("");
  const [duration, setDuration] = useState<Duration>("90-day");
  const [assets, setAssets] = useState<CampaignAssets>(EMPTY_ASSETS);
  const [weekStart, setWeekStart] = useState<number | null>(null);
  const [weekEnd, setWeekEnd] = useState<number | null>(null);
  const [untied, setUntied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setTitle("");
      setTheme("");
      setDuration("90-day");
      setAssets(EMPTY_ASSETS);
      setWeekStart(null);
      setWeekEnd(null);
      setUntied(false);
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const fetchPlan = useServerFn(getStrategyPlan);
  const planQuery = useQuery({
    queryKey: ["strategy-plan", activeProjectId ?? "default"],
    queryFn: () => fetchPlan({ data: { projectId: activeProjectId } }),
    enabled: open,
  });
  const planWeeks = planQuery.data?.plan?.weeks ?? [];
  const planUpdatedAt = planQuery.data?.updatedAt ?? null;

  // Switching client clears any week picked against the previous client's plan.
  useEffect(() => {
    setWeekStart(null);
    setWeekEnd(null);
    setUntied(false);
  }, [activeProjectId]);

  useEffect(() => {
    if (!open || planQuery.isFetching || planWeeks.length === 0 || weekStart !== null || untied) return;
    const started = planUpdatedAt ? new Date(planUpdatedAt).getTime() : Date.now();
    const week = Math.min(12, Math.max(1, Math.floor((Date.now() - started) / 604800000) + 1));
    setWeekStart(week);
    setWeekEnd(Math.min(planWeeks.length, week + 3));
  }, [open, planQuery.isFetching, planWeeks.length, planUpdatedAt, weekStart, untied]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const postsLabel = duration === "30-day" ? "30-day post schedule" : "90 days of social posts";
  const chosen = (Object.keys(assets) as (keyof CampaignAssets)[]).filter((k) => assets[k]);

  function next() {
    setError(null);
    if (step === 1) {
      if (!title.trim()) return setError("Give the campaign a title.");
      if (!theme.trim()) return setError("Add a campaign theme.");
      return setStep(2);
    }
    if (step === 2) {
      if (chosen.length === 0) return setError("Choose at least one thing to generate.");
      return setStep(3);
    }
  }

  async function launch() {
    setBusy(true);
    setError(null);
    try {
      const row = await createFn({
        data: {
          title: title.trim(),
          theme: theme.trim(),
          duration,
          assets,
          planWeekStart: weekStart,
          planWeekEnd: weekStart === null ? null : (weekEnd ?? weekStart),
          projectId: activeProjectId,
        },
      });
      onClose();
      navigate({ to: "/campaign/$id", params: { id: row.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save. Try again.");
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Campaign Engine"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(20,20,40,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "88vh",
          overflowY: "auto",
          borderRadius: 20,
          background: "#FFFFFF",
          border: `1px solid ${LINE}`,
          boxShadow: "0 30px 70px rgba(20,20,40,0.22)",
          padding: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h2 style={{ fontFamily: font, fontSize: 18, margin: 0, color: NAVY, fontWeight: 700 }}>
            New campaign
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: "none", border: "none", color: MUTED, fontSize: 20, cursor: "pointer" }}
          >
            ×
          </button>
        </div>

        {/* Progress */}
        <div style={{ display: "flex", gap: 8, margin: "14px 0 18px" }}>
          {[1, 2, 3].map((n) => (
            <div key={n} style={{ flex: 1 }}>
              <div
                style={{
                  height: 4,
                  borderRadius: 999,
                  background: n <= step ? PINK : LINE,
                }}
              />
              <div style={{ marginTop: 6, fontSize: 10, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: n <= step ? NAVY : MUTED, fontFamily: font }}>
                {n === 1 ? "Basics" : n === 2 ? "Assets" : "Launch"}
              </div>
            </div>
          ))}
        </div>

        {step === 1 && (
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <label style={label} htmlFor="c-title">Campaign title</label>
              <input
                id="c-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Q1 Content System Launch"
                style={panel}
              />
            </div>
            <div>
              <label style={label} htmlFor="c-theme">Campaign theme</label>
              <input
                id="c-theme"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="e.g. Help small business owners get consistent online"
                style={panel}
              />
            </div>
            <div>
              <span style={label}>Campaign type</span>
              <div style={{ display: "grid", gap: 8 }}>
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setDuration(t.value)}
                    style={{
                      ...panel,
                      textAlign: "left",
                      cursor: "pointer",
                      borderColor: duration === t.value ? PINK : LINE,
                      background: duration === t.value ? TINT.pink : "#FFFFFF",
                    }}
                  >
                    <span style={{ display: "block", fontWeight: 800 }}>{t.title}</span>
                    <span style={{ display: "block", fontSize: 12, color: MUTED, marginTop: 3 }}>{t.blurb}</span>
                  </button>
                ))}
              </div>
            </div>
            {planWeeks.length > 0 && (
              <div>
                <span style={label}>Which weeks of {projectName}'s 90-day plan does this cover?</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <select
                    aria-label="First plan week"
                    value={weekStart ?? ""}
                    onChange={(e) => {
                      const v = e.target.value ? Number(e.target.value) : null;
                      setUntied(v === null);
                      setWeekStart(v);
                      if (v === null) setWeekEnd(null);
                      else if (weekEnd === null || weekEnd < v) setWeekEnd(v);
                    }}
                    style={{ ...panel, cursor: "pointer" }}
                  >
                    <option value="">Not tied to the plan</option>
                    {planWeeks.map((w) => (
                      <option key={w.week} value={w.week}>{`Week ${w.week} — ${w.theme}`}</option>
                    ))}
                  </select>
                  <span style={{ fontSize: 12, color: MUTED, fontFamily: font }}>to</span>
                  <select
                    aria-label="Last plan week"
                    value={weekEnd ?? ""}
                    disabled={weekStart === null}
                    onChange={(e) => setWeekEnd(e.target.value ? Number(e.target.value) : null)}
                    style={{ ...panel, cursor: weekStart === null ? "not-allowed" : "pointer" }}
                  >
                    <option value="">—</option>
                    {planWeeks
                      .filter((w) => weekStart === null || w.week >= weekStart)
                      .map((w) => (
                        <option key={w.week} value={w.week}>{`Week ${w.week}`}</option>
                      ))}
                  </select>
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 12, color: MUTED, lineHeight: 1.5, fontFamily: font }}>
                  Posts will follow those weekly themes and your own content pillars.
                </p>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: 15, color: NAVY, fontFamily: font }}>
              What do you want to generate for this campaign?
            </h3>
            <p style={{ margin: "0 0 14px", fontSize: 12.5, color: MUTED, lineHeight: 1.5, fontFamily: font }}>
              Select everything you need — Haaylo will build it all from your Strategy Profile.
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              {(Object.keys(EMPTY_ASSETS) as (keyof CampaignAssets)[]).map((key) => (
                <label
                  key={key}
                  style={{
                    ...panel,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px 14px",
                    cursor: "pointer",
                    borderColor: assets[key] ? PINK : LINE,
                    background: assets[key] ? TINT.pink : "#FFFFFF",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={assets[key]}
                    onChange={(e) => setAssets((a) => ({ ...a, [key]: e.target.checked }))}
                    style={{ width: 18, height: 18, accentColor: PINK, flexShrink: 0 }}
                  />
                  <span style={{ fontWeight: 700 }}>{key === "socialPosts" ? postsLabel : ASSET_LABELS[key]}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div
            style={{
              borderRadius: 16,
              border: `1px solid ${LINE}`,
              background: SURFACE,
              padding: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontFamily: font, fontSize: 16, color: NAVY, fontWeight: 700 }}>{title}</span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  padding: "3px 8px",
                  borderRadius: 999,
                  background: TINT.pink,
                  color: PINK,
                  fontFamily: font,
                }}
              >
                {duration === "90-day" ? "90-day" : "30-day"}
              </span>
            </div>
            <p style={{ margin: "8px 0 14px", fontSize: 13, color: MUTED, lineHeight: 1.5, fontFamily: font }}>{theme}</p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
              {chosen.map((key) => (
                <li key={key} style={{ fontSize: 13, color: NAVY, display: "flex", gap: 8, fontFamily: font }}>
                  <span style={{ color: PINK }}>✓</span>
                  {key === "socialPosts" ? postsLabel : ASSET_LABELS[key]}
                </li>
              ))}
            </ul>
            <p style={{ margin: "14px 0 0", fontSize: 11, color: MUTED, fontFamily: font }}>Powered by your Strategy Profile</p>
          </div>
        )}

        {error && (
          <p style={{ margin: "12px 0 0", fontSize: 13, color: "#C0334B", fontFamily: font }} role="alert">
            {error}
          </p>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          {step > 1 && (
            <button
              type="button"
              onClick={() => { setError(null); setStep((s) => s - 1); }}
              disabled={busy}
              style={{
                flex: 1,
                padding: "12px 16px",
                borderRadius: 12,
                border: `1px solid ${LINE}`,
                background: "#FFFFFF",
                color: INDIGO,
                fontWeight: 800,
                fontSize: 13,
                cursor: "pointer",
                fontFamily: font,
              }}
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={step === 3 ? launch : next}
            disabled={busy}
            style={{
              flex: 2,
              padding: "12px 16px",
              borderRadius: 12,
              border: "none",
              background: PINK,
              color: "#FFFFFF",
              fontWeight: 800,
              fontSize: 13,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.7 : 1,
              fontFamily: font,
            }}
          >
            {step === 3 ? (busy ? "Launching…" : "Launch campaign") : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
