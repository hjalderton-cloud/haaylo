import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell, CARD } from "@/components/AppShell";
import { NAVY, INDIGO, GREY, LINE, TINT, PURPLE, font } from "@/lib/theme";
import { PlatformIcon, platformLabel } from "@/components/PlatformIcon";
import { useActiveProject } from "@/hooks/useActiveProject";
import {
  getOptimizerContext,
  findHashtagsAndKeywords,
  appendHashtagsToPost,
  TAG_PLATFORMS,
  type OptimizerContext,
  type OptimizerSearch,
  type ReachTier,
  type KeywordTag,
  type TagPlatform,
} from "@/lib/hashtags.functions";

export const Route = createFileRoute("/_authenticated/hashtags")({
  head: () => ({
    meta: [
      { title: "Hashtag & Keyword Optimizer — haaylo.com" },
      {
        name: "description",
        content:
          "Find the hashtags and search keywords your audience is actually using, based on your own niche and content pillars.",
      },
      { property: "og:title", content: "Hashtag & Keyword Optimizer — haaylo" },
      {
        property: "og:description",
        content: "Hashtags and keywords for LinkedIn, Instagram and Facebook, built from your Brand DNA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HashtagOptimizerPage,
});

const REACH_LOOK: Record<ReachTier, { dot: string; label: string; colour: string }> = {
  high: { dot: "🟢", label: "High reach", colour: TINT.greenInk },
  medium: { dot: "🟡", label: "Medium reach", colour: "#B08900" },
  niche: { dot: "🔴", label: "Niche", colour: "#C0334B" },
};

const TAG_LOOK: Record<KeywordTag, string> = {
  core: TINT.purpleInk,
  supporting: TINT.blueInk,
  "long-tail": TINT.pinkInk,
};

const field: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: `1px solid ${LINE}`,
  background: "#FFFFFF",
  color: NAVY,
  fontSize: 15,
  fontFamily: font,
};

const primaryBtn: React.CSSProperties = {
  width: "100%",
  padding: "14px 18px",
  borderRadius: 12,
  fontWeight: 700,
  fontSize: 15.5,
  color: "#fff",
  cursor: "pointer",
  background: `linear-gradient(135deg,${INDIGO},${PURPLE})`,
  border: `1px solid ${LINE}`,
  boxShadow: "0 10px 22px -8px rgba(20,20,40,0.22)",
};

const smallBtn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 9,
  fontSize: 13.5,
  fontWeight: 600,
  cursor: "pointer",
  color: NAVY,
  background: "#FFFFFF",
  border: `1px solid ${LINE}`,
};

function when(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function HashtagOptimizerPage() {
  const projectId = useActiveProject();
  const contextFn = useServerFn(getOptimizerContext);
  const findFn = useServerFn(findHashtagsAndKeywords);
  const appendFn = useServerFn(appendHashtagsToPost);

  const [ctx, setCtx] = useState<OptimizerContext | null>(null);
  const [platform, setPlatform] = useState<TagPlatform>("instagram");
  const [niche, setNiche] = useState("");
  const [pillar, setPillar] = useState("");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<OptimizerSearch | null>(null);
  const [history, setHistory] = useState<OptimizerSearch[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const nicheTouched = useRef(false);
  const saveWrap = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await contextFn({ data: { projectId: projectId ?? null } });
        if (!alive) return;
        setCtx(res);
        setHistory(res.history);
        if (!nicheTouched.current) setNiche(res.niche);
      } catch {
        if (alive) setCtx({ niche: "", pillars: [], drafts: [], history: [] });
      }
    })();
    return () => {
      alive = false;
    };
  }, [contextFn, projectId]);

  useEffect(() => {
    if (!saveOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (saveWrap.current && !saveWrap.current.contains(e.target as Node)) setSaveOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [saveOpen]);

  const canRun = niche.trim().length >= 2 && !busy;

  const run = async () => {
    if (!canRun) return;
    setBusy(true);
    try {
      const res = await findFn({
        data: {
          platform,
          niche: niche.trim(),
          pillar: pillar.trim() || null,
          topic: topic.trim() || null,
          projectId: projectId ?? null,
        },
      });
      setCurrent(res.search);
      setHistory((prev) => [res.search, ...prev.filter((h) => h.id !== res.search.id)].slice(0, 5));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not find hashtags.");
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

  const reload = (h: OptimizerSearch) => {
    setCurrent(h);
    setPlatform(h.platform);
    setNiche(h.niche);
    nicheTouched.current = true;
    setPillar(h.pillar ?? "");
    setTopic(h.topic ?? "");
  };

  const saveToPost = async (postId: string) => {
    if (!current) return;
    setSavingId(postId);
    try {
      const res = await appendFn({ data: { postId, hashtags: current.result.hashtags.map((h) => h.tag) } });
      toast.success(res.added ? `Added ${res.added} hashtags to that draft.` : "Those hashtags were already on it.");
      setSaveOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add them to that post.");
    } finally {
      setSavingId(null);
    }
  };

  const hashtagText = current?.result.hashtags.map((h) => h.tag).join(" ") ?? "";
  const keywordText = current?.result.keywords.map((k) => k.keyword).join("\n") ?? "";

  return (
    <AppShell title="Hashtag & Keyword Optimizer">
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "8px 0 48px" }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 30, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
            Hashtag &amp; Keyword Optimizer
          </h1>
          <p style={{ margin: "8px 0 0", color: GREY, fontSize: 15, lineHeight: 1.5 }}>
            Find the hashtags and keywords your audience is actually searching.
          </p>
        </header>

        <section style={{ ...CARD, padding: 24, display: "grid", gap: 20 }}>
          <div style={{ display: "grid", gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Platform</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {TAG_PLATFORMS.map((p) => {
                const on = platform === p;
                return (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    style={{
                      ...smallBtn,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      borderRadius: 999,
                      background: on ? TINT.purple : "#FFFFFF",
                      borderColor: on ? PURPLE : LINE,
                      color: on ? PURPLE : NAVY,
                    }}
                  >
                    <PlatformIcon platform={p} size={13} />
                    {platformLabel(p)}
                  </button>
                );
              })}
            </div>
          </div>

          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Niche</span>
            <input
              style={field}
              value={niche}
              placeholder="e.g. Fitness coaches for busy mums"
              onChange={(e) => {
                nicheTouched.current = true;
                setNiche(e.target.value);
              }}
            />
            <span style={{ fontSize: 12.5, color: GREY }}>Pulled from your Brand DNA — edit it for this search.</span>
          </label>

          <div className="haaylo-two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>
                Content pillar <span style={{ opacity: 0.6, fontWeight: 400 }}>(optional)</span>
              </span>
              <select style={field} value={pillar} onChange={(e) => setPillar(e.target.value)}>
                <option value="">Any pillar</option>
                {(ctx?.pillars ?? []).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>
                Specific topic <span style={{ opacity: 0.6, fontWeight: 400 }}>(optional)</span>
              </span>
              <input
                style={field}
                value={topic}
                placeholder="e.g. email marketing for coaches"
                onChange={(e) => setTopic(e.target.value)}
              />
            </label>
          </div>

          <button
            style={{ ...primaryBtn, opacity: canRun ? 1 : 0.5, cursor: canRun ? "pointer" : "not-allowed" }}
            disabled={!canRun}
            onClick={() => void run()}
          >
            {busy ? "Looking…" : "Find hashtags & keywords"}
          </button>
        </section>

        {(busy || current) && (
          <div
            className="haaylo-two"
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 24 }}
          >
            <article style={{ ...CARD, padding: 22, display: "grid", gap: 14, alignContent: "start" }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Suggested hashtags</h2>
              {busy && !current ? (
                <Skeleton rows={6} />
              ) : (
                <>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {current?.result.hashtags.map((h) => {
                      const look = REACH_LOOK[h.reach];
                      return (
                        <span
                          key={h.tag}
                          title={look.label}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "7px 12px",
                            borderRadius: 999,
                            fontSize: 13.5,
                            fontWeight: 600,
                            background: TINT.blue,
                            border: `1px solid ${look.colour}55`,
                            color: NAVY,
                          }}
                        >
                          <span aria-hidden>{look.dot}</span>
                          {h.tag}
                        </span>
                      );
                    })}
                  </div>
                  <p style={{ margin: 0, fontSize: 12.5, color: GREY }}>
                    🟢 High · 🟡 Medium · 🔴 Niche — estimated reach.
                  </p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", position: "relative" }}>
                    <button style={smallBtn} onClick={() => void copy(hashtagText)}>
                      Copy all
                    </button>
                    <div ref={saveWrap} style={{ position: "relative", display: "inline-flex" }}>
                      <button style={smallBtn} onClick={() => setSaveOpen((v) => !v)}>
                        Save to post
                      </button>
                      {saveOpen && (
                        <div
                          style={{
                            position: "absolute",
                            top: "calc(100% + 6px)",
                            left: 0,
                            zIndex: 60,
                            minWidth: 250,
                            maxHeight: 280,
                            overflowY: "auto",
                            padding: 6,
                            display: "grid",
                            gap: 4,
                            background: "#FFFFFF",
                            border: `1px solid ${LINE}`,
                            borderRadius: 12,
                            boxShadow: "0 18px 40px rgba(20,20,40,0.16)",
                          }}
                        >
                          {(ctx?.drafts ?? []).length === 0 ? (
                            <span style={{ padding: "8px 10px", fontSize: 12.5, color: GREY }}>
                              You have no draft posts yet.
                            </span>
                          ) : (
                            ctx?.drafts.map((d) => (
                              <button
                                key={d.id}
                                disabled={savingId === d.id}
                                onClick={() => void saveToPost(d.id)}
                                style={{
                                  textAlign: "left",
                                  background: "transparent",
                                  border: 0,
                                  color: NAVY,
                                  padding: "8px 10px",
                                  borderRadius: 9,
                                  cursor: "pointer",
                                  display: "grid",
                                  gap: 2,
                                }}
                              >
                                <span style={{ fontSize: 13, fontWeight: 600 }}>{d.label}</span>
                                <span style={{ fontSize: 11.5, opacity: 0.65 }}>
                                  {platformLabel(d.platform)}
                                  {savingId === d.id ? " — adding…" : ""}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </article>

            <article style={{ ...CARD, padding: 22, display: "grid", gap: 14, alignContent: "start" }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>SEO &amp; content keywords</h2>
              {busy && !current ? (
                <Skeleton rows={8} />
              ) : (
                <>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
                    {current?.result.keywords.map((k) => (
                      <li
                        key={k.keyword}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          justifyContent: "space-between",
                          flexWrap: "wrap",
                          padding: "10px 12px",
                          borderRadius: 10,
                          background: "#FFFFFF",
                          border: `1px solid ${LINE}`,
                        }}
                      >
                        <span style={{ fontSize: 14 }}>{k.keyword}</span>
                        <span
                          style={{
                            fontSize: 11.5,
                            fontWeight: 700,
                            padding: "3px 9px",
                            borderRadius: 999,
                            color: TAG_LOOK[k.tag],
                            background: `${TAG_LOOK[k.tag]}22`,
                            border: `1px solid ${TAG_LOOK[k.tag]}55`,
                            textTransform: "capitalize",
                          }}
                        >
                          {k.tag}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div>
                    <button style={smallBtn} onClick={() => void copy(keywordText)}>
                      Copy all
                    </button>
                  </div>
                </>
              )}
            </article>
          </div>
        )}

        {history.length > 0 && (
          <section style={{ ...CARD, padding: 18, marginTop: 24, display: "grid", gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 15 }}>Recent searches</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {history.slice(0, 5).map((h) => (
                <button
                  key={h.id}
                  onClick={() => reload(h)}
                  style={{
                    ...smallBtn,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    background: current?.id === h.id ? TINT.purple : "#FFFFFF",
                  }}
                >
                  <PlatformIcon platform={h.platform} size={12} />
                  <span style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {h.topic || h.pillar || h.niche}
                  </span>
                  <span style={{ opacity: 0.6, fontWeight: 400 }}>{when(h.created_at)}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      <style>{`
        @media (max-width: 860px) {
          .haaylo-two { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </AppShell>
  );
}

function Skeleton({ rows }: { rows: number }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 14,
            width: `${60 + ((i * 13) % 38)}%`,
            borderRadius: 7,
            background: LINE,
          }}
        />
      ))}
    </div>
  );
}
