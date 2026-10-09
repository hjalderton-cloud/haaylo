import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell, CARD } from "@/components/AppShell";
import { PlatformIcon, platformLabel } from "@/components/PlatformIcon";
import { useActiveProject } from "@/hooks/useActiveProject";
import {
  getTrendContext,
  scanTrends,
  saveTrendIdea,
  TREND_PLATFORMS,
  type Trend,
  type TrendScan,
  type TrendSignal,
  type TrendPlatform,
} from "@/lib/trends.functions";
import { SURFACE, NAVY, PURPLE, PINK, GREY, LINE, TINT, font } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/trends")({
  head: () => ({
    meta: [
      { title: "Trending Scan — haaylo.com" },
      {
        name: "description",
        content:
          "See what your niche is talking about right now and get a suggested angle written in your own brand voice.",
      },
      { property: "og:title", content: "Trending Scan — haaylo" },
      {
        property: "og:description",
        content: "Five trend themes for your niche, each with a ready angle you can post about.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TrendingScanPage,
});

const SIGNAL_LOOK: Record<TrendSignal, { dot: string; label: string; colour: string }> = {
  high: { dot: "🔥", label: "High", colour: PINK },
  rising: { dot: "📈", label: "Rising", colour: TINT.greenInk },
  steady: { dot: "📊", label: "Steady", colour: TINT.blueInk },
};

const field: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: `1px solid ${LINE}`,
  background: SURFACE,
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
  background: `linear-gradient(135deg, ${NAVY}, ${PURPLE})`,
  border: `1px solid ${LINE}`,
  boxShadow: "0 10px 22px -10px rgba(45,41,100,0.35)",
};

const smallBtn: React.CSSProperties = {
  padding: "9px 15px",
  borderRadius: 9,
  fontSize: 13.5,
  fontWeight: 600,
  cursor: "pointer",
  color: NAVY,
  background: SURFACE,
  border: `1px solid ${LINE}`,
};

function when(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function TrendingScanPage() {
  const projectId = useActiveProject();
  const navigate = useNavigate();
  const contextFn = useServerFn(getTrendContext);
  const scanFn = useServerFn(scanTrends);
  const saveFn = useServerFn(saveTrendIdea);

  const [platform, setPlatform] = useState<TrendPlatform>("linkedin");
  const [niche, setNiche] = useState("");
  const [keyword, setKeyword] = useState("");
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<TrendScan | null>(null);
  const [history, setHistory] = useState<TrendScan[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const nicheTouched = useRef(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await contextFn({ data: { projectId: projectId ?? null } });
        if (!alive) return;
        setHistory(res.history);
        if (!nicheTouched.current) setNiche(res.niche);
      } catch {
        /* the page still works without pre-filled context */
      }
    })();
    return () => {
      alive = false;
    };
  }, [contextFn, projectId]);

  const canRun = niche.trim().length >= 2 && !busy;

  const run = async () => {
    if (!canRun) return;
    setBusy(true);
    try {
      const res = await scanFn({
        data: {
          platform,
          niche: niche.trim(),
          keyword: keyword.trim() || null,
          projectId: projectId ?? null,
        },
      });
      setCurrent(res.scan);
      setHistory((prev) => [res.scan, ...prev.filter((h) => h.id !== res.scan.id)].slice(0, 10));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not scan trends.");
    } finally {
      setBusy(false);
    }
  };

  const writePost = (t: Trend) => {
    const brief = [`Trend: ${t.topic}`, "", t.summary, "", `Your angle: ${t.angle}`].join("\n");
    try {
      sessionStorage.setItem("haaylo:post-topic", brief);
    } catch {
      /* ignore */
    }
    void navigate({ to: "/engine", hash: "m=content&t=post" });
  };

  const saveIdea = async (t: Trend, idx: number) => {
    setSavingIdx(idx);
    try {
      await saveFn({ data: { title: t.topic, platform, projectId: projectId ?? null } });
      toast.success("Saved to your Content Bank as a draft.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that trend.");
    } finally {
      setSavingIdx(null);
    }
  };

  const reload = (h: TrendScan) => {
    setCurrent(h);
    setPlatform(h.platform);
    setNiche(h.niche);
    nicheTouched.current = true;
    setKeyword(h.keyword ?? "");
    setHistoryOpen(false);
  };

  return (
    <AppShell title="Trending Scan">
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "8px 0 48px" }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 30, fontWeight: 700, margin: 0, letterSpacing: "-0.02em", fontFamily: font }}>Trending Scan</h1>
          <p style={{ margin: "8px 0 0", color: GREY, fontSize: 15, lineHeight: 1.5 }}>
            See what&rsquo;s trending in your niche right now — and find your angle before the conversation moves on.
          </p>
        </header>

        <section style={{ ...CARD, padding: 24, display: "grid", gap: 20 }}>
          <div style={{ display: "grid", gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Platform</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {TREND_PLATFORMS.map((p) => {
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
                      background: on ? TINT.purple : SURFACE,
                      borderColor: on ? TINT.purpleInk : LINE,
                      color: on ? TINT.purpleInk : NAVY,
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
            <span style={{ fontSize: 14, fontWeight: 600 }}>Niche / industry</span>
            <input
              style={field}
              value={niche}
              placeholder="e.g. Payment services for independent retailers"
              onChange={(e) => {
                nicheTouched.current = true;
                setNiche(e.target.value);
              }}
            />
            <span style={{ fontSize: 12.5, color: GREY }}>
              Pulled from your Brand DNA — edit it for this scan.
            </span>
          </label>

          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              Keyword <span style={{ opacity: 0.6, fontWeight: 400 }}>(optional)</span>
            </span>
            <input
              style={field}
              value={keyword}
              placeholder="Focus on a specific topic"
              onChange={(e) => setKeyword(e.target.value)}
            />
          </label>

          <button
            style={{ ...primaryBtn, opacity: canRun ? 1 : 0.5, cursor: canRun ? "pointer" : "not-allowed" }}
            disabled={!canRun}
            onClick={() => void run()}
          >
            {busy ? "Scanning…" : "Scan trends"}
          </button>
        </section>

        {busy && (
          <section style={{ ...CARD, padding: 22, marginTop: 24, display: "grid", gap: 16 }}>
            <p style={{ margin: 0, fontSize: 14.5, color: GREY }}>
              Scanning what&rsquo;s trending in your niche… usually about 20&ndash;30 seconds
            </p>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ display: "grid", gap: 9 }}>
                <div style={{ height: 16, width: "44%", borderRadius: 7, background: SURFACE }} />
                <div style={{ height: 12, width: "92%", borderRadius: 6, background: SURFACE }} />
                <div style={{ height: 12, width: "78%", borderRadius: 6, background: SURFACE }} />
              </div>
            ))}
          </section>
        )}

        {!busy && current && (
          <>
            <p style={{ margin: "24px 0 12px", fontSize: 12.5, color: GREY }}>
              AI trend suggestions based on your niche — not live platform data.
            </p>

            <div style={{ display: "grid", gap: 16 }}>
              {current.trends.map((t, i) => {
                const look = SIGNAL_LOOK[t.signal];
                return (
                  <article key={`${t.topic}-${i}`} style={{ ...CARD, padding: 22, display: "grid", gap: 12 }}>
                    <div
                      style={{
                        display: "flex",
                        gap: 12,
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                      }}
                    >
                      <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, flex: "1 1 260px", lineHeight: 1.3, fontFamily: font }}>
                        {t.topic}
                      </h2>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 12.5,
                          fontWeight: 700,
                          padding: "5px 11px",
                          borderRadius: 999,
                          color: look.colour,
                          background: `${look.colour}22`,
                          border: `1px solid ${look.colour}55`,
                          whiteSpace: "nowrap",
                        }}
                      >
                        <span aria-hidden>{look.dot}</span>
                        {look.label}
                      </span>
                    </div>

                    <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: NAVY }}>{t.summary}</p>

                    <p
                      style={{
                        margin: 0,
                        fontSize: 14.5,
                        lineHeight: 1.6,
                        padding: "12px 14px",
                        borderRadius: 10,
                        background: TINT.purple,
                        border: `1px solid ${LINE}`,
                      }}
                    >
                      <strong style={{ fontWeight: 700 }}>Your angle:</strong> {t.angle}
                    </p>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        style={{
                          ...smallBtn,
                          background: `linear-gradient(135deg, ${NAVY}, ${PURPLE})`,
                          color: "#fff",
                          borderColor: LINE,
                        }}
                        onClick={() => writePost(t)}
                      >
                        Write a post on this
                      </button>
                      <button style={smallBtn} disabled={savingIdx === i} onClick={() => void saveIdea(t, i)}>
                        {savingIdx === i ? "Saving…" : "Save trend idea"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            <div style={{ marginTop: 16 }}>
              <button
                onClick={() => void run()}
                style={{
                  background: "none",
                  border: 0,
                  padding: 0,
                  color: PURPLE,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Rescan
              </button>
            </div>
          </>
        )}

        {history.length > 0 && (
          <section style={{ ...CARD, padding: 18, marginTop: 24, display: "grid", gap: 12 }}>
            <button
              onClick={() => setHistoryOpen((v) => !v)}
              style={{
                background: "none",
                border: 0,
                padding: 0,
                color: NAVY,
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              {historyOpen ? "▾" : "▸"} Scan history
            </button>
            {historyOpen && (
              <div style={{ display: "grid", gap: 8 }}>
                {history.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => reload(h)}
                    style={{
                      ...smallBtn,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                      textAlign: "left",
                      background: current?.id === h.id ? TINT.purple : SURFACE,
                    }}
                  >
                    <PlatformIcon platform={h.platform} size={12} />
                    <span style={{ flex: "1 1 200px" }}>
                      {h.keyword || h.niche} — {h.trends[0]?.topic ?? "5 trends"}
                    </span>
                    <span style={{ opacity: 0.6, fontWeight: 400 }}>{when(h.created_at)}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </AppShell>
  );
}
