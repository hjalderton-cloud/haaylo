import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell, CARD } from "@/components/AppShell";
import { SURFACE, NAVY, GREY, LINE, TINT } from "@/lib/theme";
import { WorkbenchTabs, sendToEditor } from "@/components/content/WorkbenchTabs";
import { useActiveProject } from "@/hooks/useActiveProject";
import {
  getIdeaContext,
  generateIdeaConcepts,
  type IdeaCampaign,
  type IdeaConcept,
} from "@/lib/idea-generator.functions";

export const Route = createFileRoute("/_authenticated/ideas")({
  head: () => ({
    meta: [
      { title: "Idea Generator — haaylo.com" },
      {
        name: "description",
        content: "Turn one keyword into three post concepts written to your brand voice and campaign theme.",
      },
      { property: "og:title", content: "Idea Generator — haaylo" },
      {
        property: "og:description",
        content: "Three post hooks from a single keyword, mapped to your Brand DNA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IdeaGeneratorPage,
});

const field: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: `1px solid ${LINE}`,
  background: SURFACE,
  color: NAVY,
  fontSize: 15,
  fontFamily: "inherit",
};

const primaryBtn: React.CSSProperties = {
  padding: "13px 22px",
  borderRadius: 12,
  fontWeight: 700,
  fontSize: 15,
  color: "#fff",
  cursor: "pointer",
  background: "linear-gradient(135deg,#6366F1,#8B5CF6)",
  border: `1px solid ${LINE}`,
  boxShadow: "0 10px 22px -8px rgba(99,102,241,0.3)",
};

const smallBtn: React.CSSProperties = {
  padding: "9px 15px",
  borderRadius: 9,
  fontSize: 13.5,
  fontWeight: 600,
  cursor: "pointer",
  color: NAVY,
  background: "#FFFFFF",
  border: `1px solid ${LINE}`,
};

const label: React.CSSProperties = {
  display: "block",
  marginBottom: 7,
  fontSize: 13,
  fontWeight: 600,
  color: GREY,
};

function IdeaGeneratorPage() {
  const projectId = useActiveProject();
  const navigate = useNavigate();
  const contextFn = useServerFn(getIdeaContext);
  const generateFn = useServerFn(generateIdeaConcepts);

  const [campaigns, setCampaigns] = useState<IdeaCampaign[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [busy, setBusy] = useState(false);
  const [concepts, setConcepts] = useState<IdeaConcept[]>([]);

  useEffect(() => {
    let alive = true;
    setCampaigns([]);
    setCampaignId("");
    setConcepts([]);
    void (async () => {
      try {
        const res = await contextFn({ data: { projectId: projectId ?? null } });
        if (!alive) return;
        setCampaigns(res.campaigns);
      } catch {
        /* the tool still works without campaign themes */
      }
    })();
    return () => {
      alive = false;
    };
  }, [contextFn, projectId]);

  const run = async () => {
    if (keyword.trim().length < 2 || busy) return;
    setBusy(true);
    try {
      const res = await generateFn({
        data: {
          keyword: keyword.trim(),
          campaignId: campaignId || null,
          projectId: projectId ?? null,
        },
      });
      setConcepts(res.concepts);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate ideas.");
    } finally {
      setBusy(false);
    }
  };

  const toEditor = (c: IdeaConcept) => {
    sendToEditor(c.hook);
    toast.success("Sent to the editor");
    void navigate({ to: "/engine", hash: "m=content&t=post" });
  };

  return (
    <AppShell title="Idea Generator">
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "8px 0 40px" }}>
        <WorkbenchTabs active="ideas" />

        <header style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Idea Generator</h1>
          <p style={{ margin: "8px 0 0", color: GREY, fontSize: 15, lineHeight: 1.5 }}>
            One keyword, three post concepts written for your audience and your voice.
          </p>
        </header>

        <section style={{ ...CARD, padding: 24, display: "grid", gap: 16 }}>
          <div>
            <label style={label} htmlFor="idea-campaign">
              Campaign theme (optional)
            </label>
            <select
              id="idea-campaign"
              style={field}
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
            >
              <option value="">No campaign — just my brand</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                  {c.theme ? ` — ${c.theme}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={label} htmlFor="idea-keyword">
              Keyword
            </label>
            <input
              id="idea-keyword"
              style={field}
              value={keyword}
              placeholder="e.g. onboarding, pricing, referrals"
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void run();
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" style={primaryBtn} onClick={() => void run()} disabled={busy || keyword.trim().length < 2}>
              {busy ? "Thinking…" : "Generate 3 concepts"}
            </button>
            {concepts.length > 0 && !busy && (
              <button type="button" style={smallBtn} onClick={() => void run()}>
                Regenerate
              </button>
            )}
          </div>
        </section>

        {busy && (
          <p style={{ color: GREY, fontSize: 14, marginTop: 20 }}>
            Writing three angles on “{keyword.trim()}”…
          </p>
        )}

        {concepts.length > 0 && (
          <div style={{ display: "grid", gap: 16, marginTop: 24 }}>
            {concepts.map((c, i) => (
              <article key={`${i}-${c.hook.slice(0, 24)}`} style={{ ...CARD, padding: 22, display: "grid", gap: 12 }}>
                {c.pillar && (
                  <span
                    style={{
                      justifySelf: "start",
                      fontSize: 12,
                      fontWeight: 700,
                      padding: "4px 10px",
                      borderRadius: 100,
                      color: TINT.purpleInk,
                      background: TINT.purple,
                      border: `1px solid ${TINT.purpleInk}`,
                    }}
                  >
                    {c.pillar}
                  </span>
                )}
                <p style={{ margin: 0, fontSize: 17.5, fontWeight: 600, lineHeight: 1.45 }}>{c.hook}</p>
                {c.why && <p style={{ margin: 0, color: GREY, fontSize: 14.5, lineHeight: 1.55 }}>{c.why}</p>}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="button" style={primaryBtn} onClick={() => toEditor(c)}>
                    Send to Editor
                  </button>
                  <button
                    type="button"
                    style={smallBtn}
                    onClick={() => {
                      void navigator.clipboard.writeText(c.hook);
                      toast.success("Copied");
                    }}
                  >
                    Copy hook
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
