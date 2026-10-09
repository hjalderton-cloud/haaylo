import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell, CARD } from "@/components/AppShell";
import { SURFACE, PURPLE, GREY, LINE } from "@/lib/theme";
import { PlatformIcon, platformColour, platformLabel } from "@/components/PlatformIcon";
import { useActiveProject } from "@/hooks/useActiveProject";
import { saveContentPost } from "@/lib/content.functions";
import {
  varyCaption,
  VARIATOR_PLATFORMS,
  type CaptionVariant,
  type VariatorPlatform,
} from "@/lib/caption-variator.functions";

export const Route = createFileRoute("/_authenticated/caption-variator")({
  head: () => ({
    meta: [
      { title: "Caption Variator — haaylo.com" },
      {
        name: "description",
        content:
          "Paste one caption and get LinkedIn, Instagram and Facebook versions written in your own brand voice, ready to save as drafts.",
      },
      { property: "og:title", content: "Caption Variator — haaylo" },
      {
        property: "og:description",
        content: "Write once. Get versions for every platform instantly.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CaptionVariatorPage,
});

const NOTES: Record<VariatorPlatform, string> = {
  linkedin: "Professional, slightly longer, no hashtags in the body",
  instagram: "Hook-heavy opening, conversational, hashtags at the end",
  facebook: "Warm and community-focused, slightly shorter",
};

const field: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: `1px solid ${LINE}`,
  background: SURFACE,
  color: "#171D41",
  fontSize: 15,
  fontFamily: "inherit",
  lineHeight: 1.55,
};

const primaryBtn: React.CSSProperties = {
  width: "100%",
  padding: "14px 18px",
  borderRadius: 12,
  fontWeight: 700,
  fontSize: 15.5,
  color: "#fff",
  cursor: "pointer",
  background: "linear-gradient(135deg,#6366F1,#8B5CF6)",
  border: `1px solid ${LINE}`,
  boxShadow: "0 10px 22px -8px rgba(99,102,241,0.3)",
};

const smallBtn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 9,
  fontSize: 13.5,
  fontWeight: 600,
  cursor: "pointer",
  color: "#171D41",
  background: "#FFFFFF",
  border: `1px solid ${LINE}`,
};

function CaptionVariatorPage() {
  const projectId = useActiveProject();
  const vary = useServerFn(varyCaption);
  const save = useServerFn(saveContentPost);

  const [caption, setCaption] = useState("");
  const [source, setSource] = useState<VariatorPlatform | null>(null);
  const [targets, setTargets] = useState<VariatorPlatform[]>([...VARIATOR_PLATFORMS]);
  const [variants, setVariants] = useState<CaptionVariant[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [voiceMissing, setVoiceMissing] = useState(false);
  const nonce = useRef(0);
  const boxRef = useRef<HTMLTextAreaElement | null>(null);

  // Grow the textarea with the caption.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(120, el.scrollHeight)}px`;
  }, [caption]);

  const canRun = caption.trim().length >= 10 && targets.length > 0 && !busy;

  const toggleTarget = (p: VariatorPlatform) =>
    setTargets((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const run = async (fresh: boolean) => {
    if (!caption.trim() || !targets.length) return;
    setBusy(true);
    if (fresh) nonce.current += 1;
    try {
      const res = await vary({
        data: {
          caption: caption.trim(),
          source,
          targets,
          projectId: projectId ?? null,
          nonce: nonce.current || null,
        },
      });
      setVariants(res.variants);
      setVoiceMissing(!res.hasVoice);
      setSaved({});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not rewrite that caption.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied.");
    } catch {
      toast.error("Your browser blocked copying — select the text instead.");
    }
  };

  const saveToBank = async (v: CaptionVariant) => {
    setSavingKey(v.platform);
    try {
      await save({
        data: {
          project_id: projectId ?? null,
          caption: v.caption,
          title: caption.trim().split("\n")[0]?.slice(0, 120) || "Caption variation",
          platform: v.platform,
          status: "draft" as const,
          meta: { source: "caption_variator" },
        },
      });
      setSaved((prev) => ({ ...prev, [v.platform]: true }));
      toast.success(`Saved as a ${platformLabel(v.platform)} draft.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that one.");
    } finally {
      setSavingKey(null);
    }
  };

  const shown = useMemo(() => variants.filter((v) => targets.includes(v.platform)), [variants, targets]);

  return (
    <AppShell title="Caption Variator">
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "8px 0 48px" }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 30, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Caption Variator</h1>
          <p style={{ margin: "8px 0 0", color: GREY, fontSize: 15, lineHeight: 1.5 }}>
            Write once. Get versions for every platform instantly.
          </p>
        </header>

        <section style={{ ...CARD, padding: 24, display: "grid", gap: 20 }}>
          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Master caption</span>
            <textarea
              ref={boxRef}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Paste your master caption here"
              style={{ ...field, minHeight: 120, resize: "vertical", overflow: "hidden" }}
            />
          </label>

          <div style={{ display: "grid", gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              Source platform <span style={{ opacity: 0.6, fontWeight: 400 }}>(optional)</span>
            </span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[...VARIATOR_PLATFORMS, null].map((p) => {
                const on = source === p;
                return (
                  <button
                    key={p ?? "none"}
                    onClick={() => setSource(p)}
                    style={{
                      ...smallBtn,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      borderRadius: 999,
                      background: on ? "#EEEAF7" : "#FFFFFF",
                      borderColor: on ? PURPLE : LINE,
                      color: on ? "#171D41" : "#171D41",
                    }}
                  >
                    {p && <PlatformIcon platform={p} size={13} />}
                    {p ? platformLabel(p) : "None"}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Target platforms</span>
            <div style={{ display: "grid", gap: 8 }}>
              {VARIATOR_PLATFORMS.map((p) => (
                <label
                  key={p}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "11px 14px",
                    borderRadius: 10,
                    border: `1px solid ${LINE}`,
                    background: SURFACE,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={targets.includes(p)}
                    onChange={() => toggleTarget(p)}
                    style={{ width: 17, height: 17, accentColor: PURPLE }}
                  />
                  <PlatformIcon platform={p} size={14} />
                  <strong style={{ fontSize: 14.5 }}>{platformLabel(p)}</strong>
                  <span style={{ color: GREY, fontSize: 13.5 }}>— {NOTES[p]}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            style={{ ...primaryBtn, opacity: canRun ? 1 : 0.5, cursor: canRun ? "pointer" : "not-allowed" }}
            disabled={!canRun}
            onClick={() => void run(false)}
          >
            {busy ? "Writing your versions…" : "Vary this caption"}
          </button>

          {voiceMissing && (
            <p style={{ margin: 0, fontSize: 13.5, color: GREY }}>
              Your Brand DNA is empty, so these are written in a neutral voice.{" "}
              <Link to="/brain/setup" style={{ color: PURPLE }}>
                Fill in your Brand DNA
              </Link>{" "}
              and they'll sound like you.
            </p>
          )}
        </section>

        {(busy || shown.length > 0) && (
          <div
            className="haaylo-variant-grid"
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.max(1, busy && !shown.length ? targets.length : shown.length)}, minmax(0,1fr))`,
              gap: 18,
              marginTop: 24,
            }}
          >
            {busy && shown.length === 0
              ? targets.map((p) => (
                  <article key={p} style={{ ...CARD, padding: 20, minHeight: 220 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                      <PlatformIcon platform={p} size={14} />
                      <strong>{platformLabel(p)}</strong>
                    </div>
                    {[92, 100, 78, 96, 60].map((w, i) => (
                      <div
                        key={i}
                        style={{
                          height: 11,
                          width: `${w}%`,
                          borderRadius: 6,
                          background: LINE,
                          marginBottom: 10,
                        }}
                      />
                    ))}
                  </article>
                ))
              : shown.map((v) => (
                  <article
                    key={v.platform}
                    style={{
                      ...CARD,
                      padding: 20,
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                      borderLeft: `3px solid ${platformColour(v.platform)}`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <PlatformIcon platform={v.platform} size={14} />
                      <strong style={{ fontSize: 16 }}>{platformLabel(v.platform)}</strong>
                      {source === v.platform && (
                        <span
                          style={{
                            marginLeft: "auto",
                            fontSize: 11.5,
                            fontWeight: 700,
                            padding: "3px 9px",
                            borderRadius: 999,
                            background: "#EEEAF7",
                            border: `1px solid ${PURPLE}`,
                          }}
                        >
                          Original
                        </span>
                      )}
                    </div>
                    <p
                      style={{
                        margin: 0,
                        whiteSpace: "pre-wrap",
                        fontSize: 14.5,
                        lineHeight: 1.6,
                        color: "#171D41",
                        flex: 1,
                      }}
                    >
                      {v.caption}
                    </p>
                    <span style={{ fontSize: 12.5, color: GREY }}>{v.caption.length} characters</span>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button style={smallBtn} onClick={() => void copy(v.caption)}>
                        Copy
                      </button>
                      <button
                        style={{ ...smallBtn, opacity: savingKey === v.platform ? 0.6 : 1 }}
                        disabled={savingKey === v.platform}
                        onClick={() => void saveToBank(v)}
                      >
                        {saved[v.platform]
                          ? "Saved ✓"
                          : savingKey === v.platform
                            ? "Saving…"
                            : "Save to Content Bank"}
                      </button>
                    </div>
                  </article>
                ))}
          </div>
        )}

        {shown.length > 0 && (
          <p style={{ marginTop: 18, fontSize: 14 }}>
            <button
              onClick={() => void run(true)}
              disabled={busy}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: PURPLE,
                fontSize: 14,
                cursor: busy ? "not-allowed" : "pointer",
                textDecoration: "underline",
              }}
            >
              {busy ? "Rewriting…" : "Regenerate all"}
            </button>
            <span style={{ color: GREY }}> — saved versions land in your Content Bank as drafts.</span>
          </p>
        )}
      </div>

      <style>{`
        @media (max-width: 860px) {
          .haaylo-variant-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </AppShell>
  );
}
