import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CARD } from "@/components/AppShell";
import { PINK, NAVY, MUTED } from "@/components/WorkflowNav";
import { LINE, NAVY as THEME_NAVY } from "@/lib/theme";
import { useActiveProject } from "@/hooks/useActiveProject";
import { getAgentSettings, saveAgentSettings, type AgentSettingsRow } from "@/lib/agent.functions";

export const Route = createFileRoute("/_authenticated/agent/settings")({
  head: () => ({
    meta: [
      { title: "Agent settings — haaylo.com" },
      { name: "description", content: "How often the AI agent drafts, which platforms it writes for, the tone it uses, and how to pause it." },
      { property: "og:title", content: "Agent settings — haaylo" },
      { property: "og:description", content: "Set posting frequency, platforms and tone, or pause the agent entirely." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgentSettings,
});

const PLATFORMS = ["linkedin", "instagram", "facebook"] as const;

const field: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: `1px solid ${LINE}`, background: "#FFFFFF", color: THEME_NAVY,
};

function AgentSettings() {
  const projectId = useActiveProject();
  const getFn = useServerFn(getAgentSettings);
  const saveFn = useServerFn(saveAgentSettings);

  const [row, setRow] = useState<AgentSettingsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [perWeek, setPerWeek] = useState(3);
  const [platforms, setPlatforms] = useState<string[]>(["linkedin"]);
  const [tone, setTone] = useState("");
  const [paused, setPaused] = useState(false);
  const [active, setActive] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let off = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await getFn({ data: { projectId: projectId ?? null } });
        if (off) return;
        setRow(res);
        if (res) {
          setPerWeek(res.posts_per_run);
          setPlatforms(res.platforms?.length ? res.platforms : ["linkedin"]);
          setTone(res.tone_override ?? "");
          setPaused(!!res.paused);
          setActive(!!res.active);
        }
      } catch { /* defaults stand */ }
      if (!off) setLoading(false);
    })();
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const toggle = (p: string) =>
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const save = async () => {
    if (!platforms.length) { toast.error("Pick at least one platform."); return; }
    setSaving(true);
    try {
      const saved = await saveFn({
        data: {
          project_id: projectId ?? null,
          mode: "review",
          cadence: "weekly",
          platforms,
          posts_per_run: perWeek,
          approval_email: row?.approval_email ?? null,
          active,
          paused,
          tone_override: tone.trim() || null,
        },
      });
      setRow(saved);
      toast.success("Agent settings saved.");
    } catch { toast.error("Could not save those settings."); }
    setSaving(false);
  };

  if (loading) return <div style={{ ...CARD, padding: 24, color: MUTED }}>Loading settings…</div>;

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 640 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24 }}>Agent settings</h1>
        <p style={{ color: MUTED, margin: "4px 0 0" }}>
          The agent always drafts for review. It never schedules or publishes on its own.
        </p>
      </div>

      <div style={{ ...CARD, padding: 20, display: "grid", gap: 18 }}>
        <label style={{ display: "grid", gap: 8 }}>
          <span>Posts per week: <strong>{perWeek}</strong></span>
          <input type="range" min={1} max={7} value={perWeek} onChange={(e) => setPerWeek(Number(e.target.value))} />
        </label>

        <div style={{ display: "grid", gap: 8 }}>
          <span>Platforms to write for</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PLATFORMS.map((p) => {
              const on = platforms.includes(p);
              return (
                <button
                  key={p}
                  onClick={() => toggle(p)}
                  style={{
                    padding: "8px 14px", borderRadius: 999, cursor: "pointer",
                    textTransform: "capitalize",
                    background: on ? PINK : "transparent",
                    color: on ? "#fff" : MUTED,
                    border: `1px solid ${on ? PINK : LINE}`,
                  }}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>

        <label style={{ display: "grid", gap: 8 }}>
          <span>Tone override <span style={{ color: MUTED, fontSize: 13 }}>(leave blank to use your Brand Voice)</span></span>
          <textarea
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            rows={3}
            placeholder="e.g. Drier and more technical than my usual voice."
            style={{ ...field, resize: "vertical" }}
          />
        </label>

        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span>Let the agent draft on a weekly schedule</span>
        </label>

        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} />
          <span>Pause the agent — no new drafts until I resume</span>
        </label>

        <button
          onClick={save}
          disabled={saving}
          style={{ padding: "10px 18px", borderRadius: 10, background: PINK, color: "#fff", border: "none", fontWeight: 600, cursor: "pointer", justifySelf: "start" }}
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
      </div>
    </div>
  );
}
