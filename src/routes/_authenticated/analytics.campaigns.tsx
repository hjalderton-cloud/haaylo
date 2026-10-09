import { createFileRoute, Link } from "@tanstack/react-router";
import { NAVY, INDIGO, PINK, LINE, GREY, TINT, SURFACE } from "@/lib/theme";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell, CARD } from "@/components/AppShell";
import { useActiveProject } from "@/hooks/useActiveProject";
import {
  getCampaignAnalytics,
  type AnalyticsPost,
  type CampaignAnalytics,
} from "@/lib/campaign-analytics.functions";
import { getZernioAnalytics, type ZernioPostStat } from "@/lib/zernio.functions";
import { matchPostStats } from "@/lib/match-post-stats";

export const Route = createFileRoute("/_authenticated/analytics/campaigns")({
  head: () => ({
    meta: [
      { title: "Campaign Analytics — haaylo.com" },
      {
        name: "description",
        content: "How each campaign performed end to end, from first view to captured lead.",
      },
      { property: "og:title", content: "Campaign Analytics — haaylo.com" },
      {
        property: "og:description",
        content: "How each campaign performed, from first view to captured lead.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CampaignAnalyticsPage,
});

const LINE_COLOURS = ["#F472B6", "#38BDF8", "#34D399", "#FBBF24", "#A78BFA"];
const UNASSIGNED = "Unassigned";

type Row = AnalyticsPost & {
  impressions: number | null;
  clicks: number | null;
  reach: number | null;
  engagementRate: number | null;
};

type SortKey = "title" | "platform" | "publishedAt" | "impressions" | "engagementRate" | "clicks" | "status";

const num = (n: number) => n.toLocaleString("en-GB");

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div style={{ ...CARD, padding: 18 }}>
      <div style={{ fontSize: 13, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, marginTop: 6 }}>{value}</div>
      {note ? <div style={{ fontSize: 12, opacity: 0.55, marginTop: 4 }}>{note}</div> : null}
    </div>
  );
}

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

function CampaignAnalyticsPage() {
  const projectId = useActiveProject();
  const loadAnalytics = useServerFn(getCampaignAnalytics);
  const loadStats = useServerFn(getZernioAnalytics);

  const [data, setData] = useState<CampaignAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [stats, setStats] = useState<ZernioPostStat[]>([]);
  const [metricsConnected, setMetricsConnected] = useState(true);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "publishedAt",
    dir: "desc",
  });

  useEffect(() => {
    setCampaignId(null);
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await loadAnalytics({ data: { projectId, campaignId } });
        if (cancelled) return;
        setData(res);
        if (!campaignId && res.campaignId) setCampaignId(res.campaignId);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, campaignId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await loadStats({ data: { days: 180, limit: 100 } });
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

  const rows = useMemo(() => matchPostStats(data?.posts ?? [], stats), [data, stats]);

  // Analytics only covers posts that actually went out to a connected channel.
  // Drafts and unsent scheduled posts have nothing to measure, so they stay out.
  const liveRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.status === "published" &&
          !!r.publishedAt &&
          new Date(r.publishedAt).getTime() <= Date.now(),
      ),
    [rows],
  );
  const hiddenCount = rows.length - liveRows.length;

  const sorted = useMemo(() => {
    const list = [...liveRows];
    const dir = sort.dir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return list;
  }, [liveRows, sort]);

  // Only posts that actually went out count as published: a date alone means scheduled.
  const published = rows.filter(
    (r) => r.status === "published" && !!r.publishedAt && new Date(r.publishedAt).getTime() <= Date.now(),
  );
  const totalReach = published.reduce((t, r) => t + (r.reach ?? 0), 0);
  const rates = published
    .map((r) => r.engagementRate)
    .filter((n): n is number => typeof n === "number");
  const avgRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
  const leadCount = data?.leads.length ?? 0;

  const leadSeries = useMemo(() => {
    const pages = data?.pages ?? [];
    const byDate = new Map<string, Record<string, number>>();
    for (const lead of data?.leads ?? []) {
      const row = byDate.get(lead.date) ?? {};
      const key = pages.length > 1 ? (lead.pageId ?? "other") : "leads";
      row[key] = (row[key] ?? 0) + 1;
      byDate.set(lead.date, row);
    }
    return [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, counts]) => ({ date, ...counts }));
  }, [data]);

  const leadKeys = useMemo(() => {
    const pages = data?.pages ?? [];
    if (pages.length > 1) {
      return pages.map((p) => ({ key: p.id, label: p.title }));
    }
    return [{ key: "leads", label: "Leads" }];
  }, [data]);

  const pillarData = useMemo(() => {
    const byPillar = new Map<string, number>();
    for (const r of published) {
      const name = (r.pillar || UNASSIGNED).trim() || UNASSIGNED;
      byPillar.set(name, (byPillar.get(name) ?? 0) + (r.reach ?? 0));
    }
    return [...byPillar.entries()]
      .map(([pillar, reach]) => ({ pillar, reach }))
      .sort((a, b) => b.reach - a.reach);
  }, [published]);

  const showEmpty =
    !loading && (data?.campaigns.length ?? 0) > 0 && rows.length === 0 && leadCount === 0;
  const noCampaigns = !loading && (data?.campaigns.length ?? 0) === 0;

  const th = (key: SortKey, label: string): React.ReactNode => (
    <th
      onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }))}
      style={{
        textAlign: "left",
        padding: "10px 12px",
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: 0.4,
        opacity: 0.65,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label} {sort.key === key ? (sort.dir === "desc" ? "▼" : "▲") : ""}
    </th>
  );

  return (
    <AppShell title="Campaign Analytics">
      <style>{`@keyframes pulse{0%,100%{opacity:.5}50%{opacity:.9}}`}</style>
      <div style={{ display: "grid", gap: 20, maxWidth: 1180 }}>
        <header>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700 }}>Campaign Analytics</h1>
          <p style={{ margin: "8px 0 0", opacity: 0.72, fontSize: 15 }}>
            Track how each campaign is performing across content, leads, and reach.
          </p>
        </header>

        {loading && !data ? (
          <>
            <Skeleton height={64} />
            <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
              <Skeleton height={104} />
              <Skeleton height={104} />
              <Skeleton height={104} />
              <Skeleton height={104} />
            </div>
            <Skeleton height={280} />
          </>
        ) : noCampaigns ? (
          <div style={{ ...CARD, padding: 28, textAlign: "center" }}>
            <p style={{ margin: 0, fontSize: 16 }}>
              You don&apos;t have a campaign yet. Create one to start tracking results.
            </p>
            <Link
              to="/campaign"
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
              Go to campaigns
            </Link>
          </div>
        ) : (
          <>
            <div style={{ ...CARD, padding: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <label htmlFor="campaign-select" style={{ fontSize: 14, opacity: 0.75 }}>
                Viewing:
              </label>
              <select
                id="campaign-select"
                value={campaignId ?? ""}
                onChange={(e) => setCampaignId(e.target.value)}
                style={{
                  flex: "1 1 240px",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: `1px solid ${LINE}`,
                  background: "#FFFFFF",
                  color: NAVY,
                  fontSize: 15,
                  fontFamily: "inherit",
                }}
              >
                {(data?.campaigns ?? []).map((c) => (
                  <option key={c.id} value={c.id} style={{ color: "#111" }}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

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
                <span style={{ opacity: 0.8 }}>
                  Connect your channels to see engagement data.
                </span>
                <Link to="/connect" style={{ color: PINK, fontWeight: 600 }}>
                  Connect channels →
                </Link>
              </div>
            ) : null}

            {showEmpty ? (
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
                <div
                  style={{
                    display: "grid",
                    gap: 14,
                    gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
                  }}
                >
                  <Tile label="Posts published" value={num(published.length)} />
                  <Tile
                    label="Total reach"
                    value={metricsConnected ? num(totalReach) : "—"}
                    note={metricsConnected ? undefined : "Channels not connected"}
                  />
                  <Tile label="Leads captured" value={num(leadCount)} />
                  <Tile
                    label="Engagement rate"
                    value={avgRate != null ? `${avgRate.toFixed(1)}%` : "—"}
                    note={avgRate == null ? "No engagement data yet" : "Average across posts"}
                  />
                </div>

                <section style={{ ...CARD, padding: 18 }}>
                  <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Content performance</h2>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${LINE}` }}>
                          {th("title", "Post title")}
                          {th("platform", "Platform")}
                          {th("publishedAt", "Published")}
                          {th("impressions", "Impressions")}
                          {th("engagementRate", "Engagement")}
                          {th("clicks", "Clicks")}
                          {th("status", "Status")}
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map((r) => (
                          <tr key={r.id} style={{ borderBottom: `1px solid ${LINE}` }}>
                            <td style={{ padding: "10px 12px", maxWidth: 280 }}>{r.title}</td>
                            <td style={{ padding: "10px 12px", textTransform: "capitalize" }}>
                              {r.platform ?? "—"}
                            </td>
                            <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                              {r.publishedAt
                                ? new Date(r.publishedAt).toLocaleDateString("en-GB")
                                : "—"}
                            </td>
                            <td style={{ padding: "10px 12px" }}>
                              {r.impressions != null ? num(r.impressions) : "—"}
                            </td>
                            <td style={{ padding: "10px 12px" }}>
                              {r.engagementRate != null ? `${r.engagementRate.toFixed(1)}%` : "—"}
                            </td>
                            <td style={{ padding: "10px 12px" }}>
                              {r.clicks != null ? num(r.clicks) : "—"}
                            </td>
                            <td style={{ padding: "10px 12px", textTransform: "capitalize" }}>
                              {r.status}
                            </td>
                          </tr>
                        ))}
                        {sorted.length === 0 ? (
                          <tr>
                            <td colSpan={7} style={{ padding: 18, opacity: 0.7 }}>
                              {hiddenCount > 0
                                ? `Nothing published yet — ${hiddenCount} post${hiddenCount === 1 ? "" : "s"} still waiting to go out.`
                                : "No posts in this campaign yet."}
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section style={{ ...CARD, padding: 18 }}>
                  <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Leads captured per day</h2>
                  {leadSeries.length === 0 ? (
                    <p style={{ margin: 0, opacity: 0.7, fontSize: 14 }}>
                      No leads captured for this campaign yet.
                    </p>
                  ) : (
                    <div style={{ width: "100%", height: 280 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={leadSeries}>
                          <CartesianGrid stroke={LINE} />
                          <XAxis dataKey="date" stroke={GREY} fontSize={12} />
                          <YAxis allowDecimals={false} stroke={GREY} fontSize={12} />
                          <Tooltip
                            contentStyle={{
                              background: "#FFFFFF",
                              border: `1px solid ${LINE}`,
                              borderRadius: 10,
                              color: NAVY,
                            }}
                          />
                          {leadKeys.length > 1 ? <Legend /> : null}
                          {leadKeys.map((k, i) => (
                            <Line
                              key={k.key}
                              type="monotone"
                              dataKey={k.key}
                              name={k.label}
                              stroke={LINE_COLOURS[i % LINE_COLOURS.length]}
                              strokeWidth={2}
                              dot={false}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </section>

                <section style={{ ...CARD, padding: 18 }}>
                  <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Reach by content pillar</h2>
                  {pillarData.length === 0 || pillarData.every((p) => p.reach === 0) ? (
                    <p style={{ margin: 0, opacity: 0.7, fontSize: 14 }}>
                      {metricsConnected
                        ? "No reach data yet for these pillars."
                        : "Connect your channels to see reach by pillar."}
                    </p>
                  ) : (
                    <div style={{ width: "100%", height: Math.max(200, pillarData.length * 46) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={pillarData} layout="vertical" margin={{ left: 20 }}>
                          <CartesianGrid stroke={LINE} />
                          <XAxis type="number" stroke={GREY} fontSize={12} />
                          <YAxis
                            type="category"
                            dataKey="pillar"
                            width={150}
                            stroke={GREY}
                            fontSize={12}
                          />
                          <Tooltip
                            contentStyle={{
                              background: "#FFFFFF",
                              border: `1px solid ${LINE}`,
                              borderRadius: 10,
                              color: NAVY,
                            }}
                          />
                          <Bar dataKey="reach" fill={PINK} radius={[0, 6, 6, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
