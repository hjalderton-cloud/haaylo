import { createFileRoute, Link } from "@tanstack/react-router";
import { NAVY, INDIGO, PINK, PURPLE, LINE, GREY, SURFACE, TINT } from "@/lib/theme";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell, CARD } from "@/components/AppShell";
import { useActiveProject } from "@/hooks/useActiveProject";
import {
  getContentPerformance,
  generateContentInsight,
  type PerformancePost,
} from "@/lib/content-performance.functions";
import { matchPostStats, type PostStats } from "@/lib/match-post-stats";
import { getZernioAnalytics, type ZernioPostStat } from "@/lib/zernio.functions";

export const Route = createFileRoute("/_authenticated/analytics/content")({
  head: () => ({
    meta: [
      { title: "Content Performance — haaylo.com" },
      {
        name: "description",
        content: "Which posts, pillars and platforms are actually working for you.",
      },
      { property: "og:title", content: "Content Performance — haaylo.com" },
      {
        property: "og:description",
        content: "See what content is working — by platform, pillar, and format.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContentPerformancePage,
});

const UNASSIGNED = "Unassigned";

const PILLAR_COLOURS = [PINK, "#22D3EE", "#FACC15", "#4ADE80", PURPLE, "#FB923C"];
function pillarColour(pillar?: string | null): string {
  const key = (pillar || "").trim().toLowerCase();
  if (!key) return "#7C3AED";
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PILLAR_COLOURS[h % PILLAR_COLOURS.length]!;
}

const RANGES = [
  { id: "7", label: "Last 7 days", days: 7 },
  { id: "30", label: "Last 30 days", days: 30 },
  { id: "90", label: "Last 90 days", days: 90 },
  { id: "all", label: "All time", days: null as number | null },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

const PLATFORM_ICON: Record<string, string> = {
  linkedin: "in",
  instagram: "ig",
  facebook: "fb",
  youtube: "yt",
  tiktok: "tt",
};
const platformName = (p: string) => p.charAt(0).toUpperCase() + p.slice(1);

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const slotFor = (h: number) => (h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening");

type Row = PerformancePost & PostStats;

const num = (n: number) => n.toLocaleString("en-GB");
const pct = (n: number | null) => (typeof n === "number" ? `${n.toFixed(1)}%` : "—");
const avg = (list: (number | null)[]) => {
  const vals = list.filter((n): n is number => typeof n === "number");
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
};

function Skeleton({ height }: { height: number }) {
  return (
    <div
      style={{
        height,
        borderRadius: 12,
        background: SURFACE,
        animation: "pulse 1.4s ease-in-out infinite",
      }}
    />
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ ...CARD, padding: 18 }}>{children}</div>;
}

function Trend({ now, before }: { now: number | null; before: number | null }) {
  if (now == null || before == null || before === 0) {
    return <span style={{ opacity: 0.45 }}>—</span>;
  }
  const change = ((now - before) / before) * 100;
  const flat = Math.abs(change) < 1;
  const up = change > 0;
  return (
    <span style={{ color: flat ? "rgba(238,240,250,0.6)" : up ? "#4ADE80" : "#FB7185", fontWeight: 600 }}>
      {flat ? "→" : up ? "↑" : "↓"} {Math.abs(change).toFixed(0)}%
    </span>
  );
}

function ContentPerformancePage() {
  const projectId = useActiveProject();
  const loadPosts = useServerFn(getContentPerformance);
  const loadStats = useServerFn(getZernioAnalytics);
  const loadInsight = useServerFn(generateContentInsight);

  const [posts, setPosts] = useState<PerformancePost[]>([]);
  const [stats, setStats] = useState<ZernioPostStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [metricsConnected, setMetricsConnected] = useState(true);
  const [range, setRange] = useState<RangeId>("30");
  const [insight, setInsight] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await loadPosts({ data: { projectId } });
        if (!cancelled) setPosts(res.posts);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await loadStats({ data: { days: 365, limit: 200 } });
        if (cancelled) return;
        setMetricsConnected(res.ok);
        setStats(res.analytics.posts);
      } catch {
        if (!cancelled) setMetricsConnected(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allRows: Row[] = useMemo(() => matchPostStats(posts, stats), [posts, stats]);

  const publishedRows = useMemo(
    // A scheduled date is not a publication: only live posts with a past date count.
    () =>
      allRows.filter(
        (r) => r.status === "published" && !!r.publishedAt && new Date(r.publishedAt).getTime() <= Date.now(),
      ),
    [allRows],
  );

  const rangeDays = RANGES.find((r) => r.id === range)?.days ?? null;
  const rangeLabel = RANGES.find((r) => r.id === range)?.label ?? "Last 30 days";

  const { current, previous } = useMemo(() => {
    if (rangeDays == null) return { current: publishedRows, previous: [] as Row[] };
    const now = Date.now();
    const start = now - rangeDays * 86_400_000;
    const prevStart = start - rangeDays * 86_400_000;
    const at = (r: Row) => new Date(r.publishedAt as string).getTime();
    return {
      current: publishedRows.filter((r) => at(r) >= start && at(r) <= now),
      previous: publishedRows.filter((r) => at(r) >= prevStart && at(r) < start),
    };
  }, [publishedRows, rangeDays]);

  const bestPost = useMemo(() => {
    const withRate = current.filter((r) => typeof r.engagementRate === "number");
    return withRate.sort((a, b) => (b.engagementRate ?? 0) - (a.engagementRate ?? 0))[0] ?? null;
  }, [current]);

  const pillarRows = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of current) {
      const key = (r.pillar || UNASSIGNED).trim() || UNASSIGNED;
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()]
      .map(([pillar, rows]) => ({
        pillar,
        posts: rows.length,
        avgImpressions: avg(rows.map((r) => r.impressions)),
        avgReach: avg(rows.map((r) => r.reach)),
        avgEngagement: avg(rows.map((r) => r.engagementRate)),
        best:
          rows
            .filter((r) => typeof r.engagementRate === "number")
            .sort((a, b) => (b.engagementRate ?? 0) - (a.engagementRate ?? 0))[0] ?? null,
      }))
      .sort((a, b) => (b.avgEngagement ?? -1) - (a.avgEngagement ?? -1));
  }, [current]);

  const bestPillar = useMemo(
    () => [...pillarRows].sort((a, b) => (b.avgReach ?? -1) - (a.avgReach ?? -1))[0] ?? null,
    [pillarRows],
  );

  const dayRows = useMemo(() => {
    const map = new Map<number, Row[]>();
    for (const r of current) {
      const d = new Date(r.publishedAt as string).getDay();
      map.set(d, [...(map.get(d) ?? []), r]);
    }
    return [...map.entries()]
      .map(([day, rows]) => ({
        day: DAY_NAMES[day]!,
        posts: rows.length,
        avgEngagement: avg(rows.map((r) => r.engagementRate)),
      }))
      .sort((a, b) => (b.avgEngagement ?? -1) - (a.avgEngagement ?? -1));
  }, [current]);

  const slotRows = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of current) {
      const slot = slotFor(new Date(r.publishedAt as string).getHours());
      map.set(slot, [...(map.get(slot) ?? []), r]);
    }
    return [...map.entries()]
      .map(([slot, rows]) => ({ slot, posts: rows.length, avgEngagement: avg(rows.map((r) => r.engagementRate)) }))
      .sort((a, b) => (b.avgEngagement ?? -1) - (a.avgEngagement ?? -1));
  }, [current]);

  const bestDay = dayRows.find((d) => d.avgEngagement != null) ?? null;

  const platformRows = useMemo(() => {
    const names = new Set<string>();
    for (const r of [...current, ...previous]) {
      if (r.platform) names.add(r.platform.toLowerCase());
    }
    return [...names]
      .map((platform) => {
        const now = current.filter((r) => (r.platform ?? "").toLowerCase() === platform);
        const before = previous.filter((r) => (r.platform ?? "").toLowerCase() === platform);
        const impressions = now.reduce((t, r) => t + (r.impressions ?? 0), 0);
        return {
          platform,
          posts: now.length,
          impressions,
          avgEngagement: avg(now.map((r) => r.engagementRate)),
          prevImpressions: before.length ? before.reduce((t, r) => t + (r.impressions ?? 0), 0) : null,
          prevEngagement: avg(before.map((r) => r.engagementRate)),
        };
      })
      .sort((a, b) => b.impressions - a.impressions);
  }, [current, previous]);

  const totals = useMemo(
    () => ({
      posts: current.length,
      impressions: current.reduce((t, r) => t + (r.impressions ?? 0), 0),
      avgEngagement: avg(current.map((r) => r.engagementRate)),
    }),
    [current],
  );

  // Refresh the written insight whenever the range (or the underlying data) changes.
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    setInsightLoading(true);
    setInsight(null);
    void (async () => {
      try {
        const res = await loadInsight({
          data: {
            rangeLabel,
            totals,
            platforms: platformRows.slice(0, 8).map((p) => ({
              platform: platformName(p.platform),
              posts: p.posts,
              impressions: p.impressions,
              avgEngagement: p.avgEngagement,
            })),
            pillars: pillarRows.slice(0, 12).map((p) => ({
              pillar: p.pillar,
              posts: p.posts,
              avgImpressions: p.avgImpressions,
              avgEngagement: p.avgEngagement,
            })),
            days: dayRows.slice(0, 7).map((d) => ({
              day: d.day,
              posts: d.posts,
              avgEngagement: d.avgEngagement,
            })),
            slots: slotRows.slice(0, 4),
          },
        });
        if (!cancelled) setInsight(res.insight);
      } catch {
        if (!cancelled) setInsight(null);
      } finally {
        if (!cancelled) setInsightLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, loading, publishedRows.length, stats.length]);

  const nothingPublished = !loading && publishedRows.length === 0;

  const cell: React.CSSProperties = { padding: "10px 12px", fontSize: 14, verticalAlign: "top" };
  const head: React.CSSProperties = {
    textAlign: "left",
    padding: "10px 12px",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    opacity: 0.65,
    whiteSpace: "nowrap",
  };

  return (
    <AppShell title="Content Performance">
      <style>{`@keyframes pulse{0%,100%{opacity:.5}50%{opacity:.9}}`}</style>
      <div style={{ display: "grid", gap: 20, maxWidth: 1180 }}>
        <header>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700 }}>Content Performance</h1>
          <p style={{ margin: "8px 0 0", opacity: 0.72, fontSize: 15 }}>
            See what content is working — by platform, pillar, and format.
          </p>
        </header>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              style={{
                padding: "9px 16px",
                borderRadius: 999,
                border: `1px solid ${range === r.id ? PINK : LINE}`,
                background: range === r.id ? PINK : "#FFFFFF",
                color: range === r.id ? "#FFFFFF" : INDIGO,
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>

        {loading ? (
          <>
            <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
              <Skeleton height={132} />
              <Skeleton height={132} />
              <Skeleton height={132} />
            </div>
            <Skeleton height={200} />
            <Skeleton height={260} />
          </>
        ) : nothingPublished ? (
          <div style={{ ...CARD, padding: 28, textAlign: "center" }}>
            <p style={{ margin: 0, fontSize: 16 }}>
              Connect your social channels and publish your first post to start seeing analytics.
            </p>
            <Link
              to="/connect"
              style={{
                display: "inline-block",
                marginTop: 16,
                padding: "12px 20px",
                borderRadius: 12,
                background: PINK,
                color: "#FFFFFF",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Connect channels
            </Link>
          </div>
        ) : (
          <>
            {!metricsConnected ? (
              <div
                style={{
                  ...CARD,
                  padding: 14,
                  fontSize: 14,
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <span style={{ opacity: 0.8 }}>Connect your channels to see engagement data.</span>
                <Link to="/connect" style={{ color: PINK, fontWeight: 600 }}>
                  Connect channels →
                </Link>
              </div>
            ) : null}

            {/* Top performers */}
            <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
              <Card>
                <div style={{ fontSize: 13, opacity: 0.7 }}>Best performing post</div>
                {bestPost ? (
                  <>
                    <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8, overflowWrap: "anywhere" }}>
                      {bestPost.title}
                    </div>
                    <div style={{ fontSize: 13, opacity: 0.65, marginTop: 4 }}>
                      {bestPost.platform ? platformName(bestPost.platform) : "No channel"} ·{" "}
                      {pct(bestPost.engagementRate)} engagement
                    </div>
                    {bestPost.url ? (
                      <a
                        href={bestPost.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: "inline-block", marginTop: 10, color: PINK, fontWeight: 600, fontSize: 14 }}
                      >
                        View post →
                      </a>
                    ) : (
                      <Link
                        to="/bank"
                        style={{ display: "inline-block", marginTop: 10, color: PINK, fontWeight: 600, fontSize: 14 }}
                      >
                        View post →
                      </Link>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 14, opacity: 0.6, marginTop: 10 }}>
                    No engagement data reported yet.
                  </div>
                )}
              </Card>

              <Card>
                <div style={{ fontSize: 13, opacity: 0.7 }}>Best performing pillar</div>
                {bestPillar ? (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 999,
                          background: pillarColour(bestPillar.pillar),
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: 16, fontWeight: 700, overflowWrap: "anywhere" }}>
                        {bestPillar.pillar}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, opacity: 0.65, marginTop: 6 }}>
                      {bestPillar.avgReach != null ? `${num(Math.round(bestPillar.avgReach))} average reach` : "Reach not reported yet"}{" "}
                      · {bestPillar.posts} post{bestPillar.posts === 1 ? "" : "s"}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 14, opacity: 0.6, marginTop: 10 }}>Nothing published in this period.</div>
                )}
              </Card>

              <Card>
                <div style={{ fontSize: 13, opacity: 0.7 }}>Best performing day</div>
                {bestDay ? (
                  <>
                    <div style={{ fontSize: 22, fontWeight: 700, marginTop: 8 }}>{bestDay.day}</div>
                    <div style={{ fontSize: 13, opacity: 0.65, marginTop: 4 }}>
                      {pct(bestDay.avgEngagement)} average engagement · {bestDay.posts} post
                      {bestDay.posts === 1 ? "" : "s"}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 14, opacity: 0.6, marginTop: 10 }}>
                    No engagement data reported yet.
                  </div>
                )}
              </Card>
            </div>

            {/* Platform breakdown */}
            <section style={{ ...CARD, padding: 0, overflow: "hidden" }}>
              <h2 style={{ margin: 0, padding: "16px 18px 6px", fontSize: 17, fontWeight: 700 }}>
                Platform breakdown
              </h2>
              {platformRows.length === 0 ? (
                <p style={{ margin: 0, padding: "0 18px 18px", fontSize: 14, opacity: 0.65 }}>
                  Nothing published to a channel in this period.
                </p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${LINE}` }}>
                        <th style={head}>Platform</th>
                        <th style={head}>Posts published</th>
                        <th style={head}>Total impressions</th>
                        <th style={head}>Avg engagement</th>
                        <th style={head}>vs previous period</th>
                      </tr>
                    </thead>
                    <tbody>
                      {platformRows.map((p) => (
                        <tr key={p.platform} style={{ borderBottom: `1px solid ${LINE}` }}>
                          <td style={cell}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                              <span
                                style={{
                                  width: 26,
                                  height: 26,
                                  borderRadius: 8,
                                  background: SURFACE,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 11,
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                }}
                              >
                                {PLATFORM_ICON[p.platform] ?? p.platform.slice(0, 2)}
                              </span>
                              {platformName(p.platform)}
                            </span>
                          </td>
                          <td style={cell}>{num(p.posts)}</td>
                          <td style={cell}>{p.impressions ? num(p.impressions) : "—"}</td>
                          <td style={cell}>{pct(p.avgEngagement)}</td>
                          <td style={cell}>
                            {rangeDays == null ? (
                              <span style={{ opacity: 0.45 }}>—</span>
                            ) : (
                              <Trend now={p.impressions || null} before={p.prevImpressions} />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Pillar performance */}
            <section style={{ ...CARD, padding: 0, overflow: "hidden" }}>
              <h2 style={{ margin: 0, padding: "16px 18px 6px", fontSize: 17, fontWeight: 700 }}>
                Pillar performance
              </h2>
              {pillarRows.length === 0 ? (
                <p style={{ margin: 0, padding: "0 18px 18px", fontSize: 14, opacity: 0.65 }}>
                  Nothing published in this period.
                </p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${LINE}` }}>
                        <th style={head}>Pillar</th>
                        <th style={head}>Posts published</th>
                        <th style={head}>Avg impressions</th>
                        <th style={head}>Avg engagement</th>
                        <th style={head}>Best post</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pillarRows.map((p) => (
                        <tr key={p.pillar} style={{ borderBottom: `1px solid ${LINE}` }}>
                          <td style={cell}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                              <span
                                style={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: 999,
                                  background: pillarColour(p.pillar),
                                  flexShrink: 0,
                                }}
                              />
                              {p.pillar}
                            </span>
                          </td>
                          <td style={cell}>{num(p.posts)}</td>
                          <td style={cell}>
                            {p.avgImpressions != null ? num(Math.round(p.avgImpressions)) : "—"}
                          </td>
                          <td style={cell}>{pct(p.avgEngagement)}</td>
                          <td style={{ ...cell, maxWidth: 280, overflowWrap: "anywhere" }}>
                            {p.best ? p.best.title : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Insight callout */}
            <section
              style={{
                ...CARD,
                padding: 18,
                borderColor: "rgba(244,114,182,0.35)",
                background: "rgba(244,114,182,0.08)",
              }}
            >
              <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 8 }}>
                What the numbers say · {rangeLabel.toLowerCase()}
              </div>
              {insightLoading ? (
                <Skeleton height={54} />
              ) : (
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
                  {insight ?? "Not enough data yet to read anything into this period."}
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
