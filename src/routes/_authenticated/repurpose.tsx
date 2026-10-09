import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell, CARD } from "@/components/AppShell";
import { SURFACE, NAVY, GREY, LINE, TINT } from "@/lib/theme";
import { WorkbenchTabs } from "@/components/content/WorkbenchTabs";
import { useActiveProject } from "@/hooks/useActiveProject";
import {
  listBankCaptions,
  repurposeContent,
  saveRepurposed,
  REPURPOSE_TARGETS,
  TARGET_LABEL,
  type BankCaption,
  type RepurposeTarget,
} from "@/lib/repurpose.functions";

export const Route = createFileRoute("/_authenticated/repurpose")({
  head: () => ({
    meta: [
      { title: "Repurposing Suite — haaylo.com" },
      {
        name: "description",
        content: "Turn a saved caption into a carousel script, a short-form video script or an email newsletter.",
      },
      { property: "og:title", content: "Repurposing Suite — haaylo" },
      {
        property: "og:description",
        content: "One caption, three formats: carousel, short-form video, newsletter.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RepurposePage,
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

function RepurposePage() {
  const projectId = useActiveProject();
  const listFn = useServerFn(listBankCaptions);
  const runFn = useServerFn(repurposeContent);
  const saveFn = useServerFn(saveRepurposed);

  const [posts, setPosts] = useState<BankCaption[]>([]);
  const [search, setSearch] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [content, setContent] = useState("");
  const [target, setTarget] = useState<RepurposeTarget>("carousel");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [output, setOutput] = useState("");

  useEffect(() => {
    let alive = true;
    setPosts([]);
    setSourceId("");
    setContent("");
    setOutput("");
    void (async () => {
      try {
        const rows = await listFn({ data: { projectId: projectId ?? null } });
        if (alive) setPosts(rows);
      } catch {
        /* pasting content still works */
      }
    })();
    return () => {
      alive = false;
    };
  }, [listFn, projectId]);

  // Handoff from the Content Bank "Repurpose" action.
  useEffect(() => {
    let pending: string | null = null;
    try {
      pending = sessionStorage.getItem("haaylo:repurpose");
      if (pending) sessionStorage.removeItem("haaylo:repurpose");
    } catch {
      pending = null;
    }
    if (pending) setContent(pending);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return posts.slice(0, 40);
    return posts
      .filter((p) => p.title.toLowerCase().includes(q) || p.caption.toLowerCase().includes(q))
      .slice(0, 40);
  }, [posts, search]);

  const loadPost = (p: BankCaption) => {
    setSourceId(p.id);
    setContent(p.caption);
    setOutput("");
  };

  const run = async () => {
    if (content.trim().length < 20 || busy) return;
    setBusy(true);
    try {
      const res = await runFn({
        data: { content: content.trim(), target, projectId: projectId ?? null },
      });
      setOutput(res.output);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not repurpose this.");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!output.trim() || saving) return;
    setSaving(true);
    try {
      const source = posts.find((p) => p.id === sourceId);
      const base = source?.title || content.trim().slice(0, 60);
      const suffix =
        target === "carousel" ? "carousel script" : target === "video" ? "video script" : "newsletter";
      await saveFn({
        data: {
          title: `${base} — ${suffix}`.slice(0, 300),
          body: output.trim(),
          target,
          projectId: projectId ?? null,
        },
      });
      toast.success("Saved to your Content Bank as a draft");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell title="Repurposing Suite">
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "8px 0 40px" }}>
        <WorkbenchTabs active="repurpose" />

        <header style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Repurposing Suite</h1>
          <p style={{ margin: "8px 0 0", color: GREY, fontSize: 15, lineHeight: 1.5 }}>
            Take something you have already written and turn it into another format.
          </p>
        </header>

        <section style={{ ...CARD, padding: 24, display: "grid", gap: 16 }}>
          <div>
            <label style={label} htmlFor="repurpose-search">
              Load a caption from your Content Bank
            </label>
            <input
              id="repurpose-search"
              style={field}
              value={search}
              placeholder="Search your saved posts"
              onChange={(e) => setSearch(e.target.value)}
            />
            <div
              style={{
                marginTop: 10,
                maxHeight: 190,
                overflowY: "auto",
                display: "grid",
                gap: 8,
              }}
            >
              {filtered.length === 0 && (
                <p style={{ margin: 0, color: GREY, fontSize: 13.5 }}>
                  {posts.length ? "Nothing matches that search." : "No saved captions yet — paste something below."}
                </p>
              )}
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => loadPost(p)}
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: 10,
                    cursor: "pointer",
                    color: NAVY,
                    background: sourceId === p.id ? TINT.purple : SURFACE,
                    border: `1px solid ${sourceId === p.id ? TINT.purpleInk : LINE}`,
                  }}
                >
                  <span style={{ display: "block", fontWeight: 600, fontSize: 14 }}>{p.title}</span>
                  <span style={{ display: "block", color: GREY, fontSize: 12.5, marginTop: 3 }}>
                    {p.caption.slice(0, 90)}
                    {p.caption.length > 90 ? "…" : ""}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={label} htmlFor="repurpose-content">
              Content to work from
            </label>
            <textarea
              id="repurpose-content"
              style={{ ...field, minHeight: 150, resize: "vertical" }}
              value={content}
              placeholder="Pick a post above, or paste your own text here"
              onChange={(e) => {
                setContent(e.target.value);
                setSourceId("");
              }}
            />
          </div>

          <div>
            <label style={label} htmlFor="repurpose-target">
              Convert to
            </label>
            <select
              id="repurpose-target"
              style={field}
              value={target}
              onChange={(e) => setTarget(e.target.value as RepurposeTarget)}
            >
              {REPURPOSE_TARGETS.map((t) => (
                <option key={t} value={t}>
                  {TARGET_LABEL[t]}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              style={primaryBtn}
              onClick={() => void run()}
              disabled={busy || content.trim().length < 20}
            >
              {busy ? "Rewriting…" : "Convert"}
            </button>
          </div>
        </section>

        {output && (
          <section style={{ ...CARD, padding: 24, marginTop: 22, display: "grid", gap: 14 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{TARGET_LABEL[target]}</h2>
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontFamily: "inherit",
                fontSize: 15,
                lineHeight: 1.6,
                color: NAVY,
              }}
            >
              {output}
            </pre>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                style={smallBtn}
                onClick={() => {
                  void navigator.clipboard.writeText(output);
                  toast.success("Copied");
                }}
              >
                Copy
              </button>
              <button type="button" style={smallBtn} onClick={() => void run()} disabled={busy}>
                Regenerate
              </button>
              <button type="button" style={primaryBtn} onClick={() => void save()} disabled={saving}>
                {saving ? "Saving…" : "Save to Content Bank"}
              </button>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
