import { createFileRoute, Link } from "@tanstack/react-router";
import { NAVY, INDIGO, PINK, PURPLE, LINE, GREY, SURFACE, TINT } from "@/lib/theme";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import { AppShell, CARD } from "@/components/AppShell";
import { useActiveProject } from "@/hooks/useActiveProject";
import { getLeadAnalytics, type AnalyticsLead } from "@/lib/lead-analytics.functions";

export const Route = createFileRoute("/_authenticated/analytics/leads")({
  head: () => ({
    meta: [
      { title: "Lead Analytics — haaylo.com" },
      {
        name: "description",
        content: "Where your leads come from and how they move through your funnel.",
      },
      { property: "og:title", content: "Lead Analytics — haaylo.com" },
      {
        property: "og:description",
        content: "Track where your leads come from and how they move through your funnel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LeadAnalyticsPage,
});

const COLOURS = [PINK, "#22D3EE", "#FACC15", "#4ADE80", PURPLE, "#FB923C"];

function colourFor(key: string): string {
  const k = (key || "").trim().toLowerCase();
  if (!k) return "#7C3AED";
  let h = 0;
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return COLOURS[h % COLOURS.length]!;
}

const RANGES = [
  { id: "7", label: "Last 7 days", days: 7 },
  { id: "30", label: "Last 30 days", days: 30 },
  { id: "90", label: "Last 90 days", days: 90 },
  { id: "all", label: "All time", days: null as number | null },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

const DAY = 86_400_000;
const num = (n: number) => n.toLocaleString("en-GB");
const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);
const shortDate = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

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

function LeadAnalyticsPage() {
  const projectId = useActiveProject();
  const load = useServerFn(getLeadAnalytics);

  const [leads, setLeads] = useState<AnalyticsLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeId>("30");
  const [hidden, setHidden] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await load({ data: { projectId } });
        if (!cancelled) setLeads(res.leads);
      } catch {
        if (!cancelled) setLeads([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const rangeDays = RANGES.find((r) => r.id === range)?.days ?? null;

  const current = useMemo(() => {
    if (rangeDays == null) return leads;
    const start = Date.now() - rangeDays * DAY;
    return leads.filter((l) => new Date(l.created_at).getTime() >= start);
  }, [leads, rangeDays]);

  // One entry per landing page, ordered by lead count.
  const byPage = useMemo(() => {
    const map = new Map<string, { id: string; title: string; slug: string | null; count: number; colour: string }>();
    for (const l of current) {
      const row =
        map.get(l.page_id) ??
        {
          id: l.page_id,
          title: l.page_title,
          slug: l.page_slug,
          count: 0,
          colour: colourFor(l.campaign_title || l.page_title),
        };
      row.count += 1;
      map.set(l.page_id, row);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [current]);

  const visiblePages = byPage.filter((p) => !hidden[p.id]);

  // Leads per day, one series per landing page.
  const overTime = useMemo(() => {
    if (current.length === 0) return [] as Array<Record<string, string | number>>;
    const times = current.map((l) => new Date(l.created_at).getTime());
    const first = new Date(Math.min(...times));
    const last = new Date(Math.max(...times));
    const days: string[] = [];
    for (let t = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate()); t <= last.getTime(); t += DAY) {
      days.push(new Date(t).toISOString().slice(0, 10));
    }
    const tally = new Map<string, number>();
    for (const l of current) tally.set(`${dayKey(l.created_at)}|${l.page_id}`, (tally.get(`${dayKey(l.created_at)}|${l.page_id}`) ?? 0) + 1);
    return days.map((d) => {
      const row: Record<string, string | number> = { day: shortDate(d) };
      for (const p of visiblePages) row[p.id] = tally.get(`${d}|${p.id}`) ?? 0;
      return row;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, visiblePages.map((p) => p.id).join(",")]);

  const statuses = useMemo(() => {
    const count = (s: string) => current.filter((l) => l.status === s).length;
    const contacted = count("contacted") + count("converted");
    return { neu: current.length, contacted, converted: count("converted") };
  }, [current]);

  const weekChange = useMemo(() => {
    const now = Date.now();
    const at = (l: AnalyticsLead) => new Date(l.created_at).getTime();
    const thisWeek = leads.filter((l) => at(l) >= now - 7 * DAY).length;
    const lastWeek = leads.filter((l) => at(l) >= now - 14 * DAY && at(l) < now - 7 * DAY).length;
    const change = lastWeek === 0 ? null : ((thisWeek - lastWeek) / lastWeek) * 100;
    return { thisWeek, lastWeek, change };
  }, [leads]);

  const campaignRows = useMemo(() => {
    const map = new Map<
      string,
      { campaign: string; pages: Set<string>; count: number; first: number; last: number }
    >();
    for (const l of current) {
      const key = l.campaign_id ?? "none";
      const name = l.campaign_title || "No campaign";
      const t = new Date(l.created_at).getTime();
      const row = map.get(key) ?? { campaign: name, pages: new Set<string>(), count: 0, first: t, last: t };
      row.count += 1;
      row.pages.add(l.page_title);
      row.first = Math.min(row.first, t);
      row.last = Math.max(row.last, t);
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [current]);

  const bestPage = byPage[0] ?? null;
  const nothing = !loading && leads.length === 0;

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
  const axis = { stroke: GREY, fontSize: 12 };
  const tooltip = {
    contentStyle: {
      background: "#FFFFFF",
      border: `1px solid ${LINE}`,
      borderRadius: 10,
      color: NAVY,
      fontSize: 13,
    },
  };

  const stepRate = (a: number, b: number) => (b === 0 ? "—" : `${((a / b) * 100).toFixed(0)}%`);

  return (
    <AppShell title="Lead Analytics">
      <style>{`@keyframes pulse{0%,100%{opacity:.5}50%{opacity:.9}}`}</style>
      <div style={{ display: "grid", gap: 20, maxWidth: 1180 }}>
        <header>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700 }}>Lead Analytics</h1>
          <p style={{ margin: "8px 0 0", opacity: 0.72, fontSize: 15 }}>
            Track where your leads come from and how they move through your funnel.
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
            <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
              <Skeleton height={116} />
              <Skeleton height={116} />
              <Skeleton height={116} />
              <Skeleton height={116} />
            </div>
            <Skeleton height={240} />
            <Skeleton height={260} />
          </>
        ) : nothing ? (
          <div style={{ ...CARD, padding: 28, textAlign: "center" }}>
            <p style={{ margin: 0, fontSize: 16 }}>
              No leads captured yet — publish a landing page and share it to start collecting.
            </p>
            <Link
              to="/landing"
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
              Landing Pages
            </Link>
          </div>
        ) : (
          <>
            {/* Top stats */}
            <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
              <Card>
                <div style={{ fontSize: 13, opacity: 0.7 }}>Total leads</div>
                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>{num(current.length)}</div>
              </Card>
              <Card>
                <div style={{ fontSize: 13, opacity: 0.7 }}>Conversion rate</div>
                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6, opacity: 0.5 }}>—</div>
                <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
                  Visitor tracking isn&apos;t switched on yet
                </div>
              </Card>
              <Card>
                <div style={{ fontSize: 13, opacity: 0.7 }}>Best converting page</div>
                <div style={{ fontSize: 17, fontWeight: 700, marginTop: 6, overflowWrap: "anywhere" }}>
                  {bestPage ? bestPage.title : "—"}
                </div>
                {bestPage ? (
                  <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4 }}>
                    {num(bestPage.count)} lead{bestPage.count === 1 ? "" : "s"} — most in this period
                  </div>
                ) : null}
              </Card>
              <Card>
                <div style={{ fontSize: 13, opacity: 0.7 }}>This week vs last</div>
                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>{num(weekChange.thisWeek)}</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  {weekChange.change == null ? (
                    <span style={{ opacity: 0.55 }}>No leads last week to compare</span>
                  ) : (
                    <span
                      style={{
                        color:
                          Math.abs(weekChange.change) < 1
                            ? "rgba(238,240,250,0.6)"
                            : weekChange.change > 0
                              ? "#4ADE80"
                              : "#FB7185",
                        fontWeight: 600,
                      }}
                    >
                      {Math.abs(weekChange.change) < 1 ? "→" : weekChange.change > 0 ? "↑" : "↓"}{" "}
                      {Math.abs(weekChange.change).toFixed(0)}% vs last week
                    </span>
                  )}
                </div>
              </Card>
            </div>

            {/* Leads by source */}
            <Card>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Leads by source</h2>
              <p style={{ margin: "6px 0 14px", fontSize: 13, opacity: 0.7 }}>One bar per landing page.</p>
              {byPage.length === 0 ? (
                <p style={{ margin: 0, opacity: 0.65, fontSize: 14 }}>No leads in this period.</p>
              ) : (
                <div style={{ width: "100%", height: Math.max(160, byPage.length * 44 + 40) }}>
                  <ResponsiveContainer>
                    <BarChart data={byPage} layout="vertical" margin={{ left: 8, right: 20, top: 4, bottom: 4 }}>
                      <CartesianGrid stroke={LINE} horizontal={false} />
                      <XAxis type="number" allowDecimals={false} {...axis} />
                      <YAxis type="category" dataKey="title" width={150} {...axis} />
                      <Tooltip {...tooltip} cursor={{ fill: TINT.purple }} />
                      <Bar dataKey="count" name="Leads" radius={[0, 6, 6, 0]}>
                        {byPage.map((p) => (
                          <Cell key={p.id} fill={p.colour} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            {/* Leads over time */}
            <Card>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Leads over time</h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0 14px" }}>
                {byPage.map((p) => {
                  const on = !hidden[p.id];
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setHidden((h) => ({ ...h, [p.id]: on }))}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 12px",
                        borderRadius: 999,
                        border: `1px solid ${LINE}`,
                        background: "#FFFFFF",
                        color: INDIGO,
                        opacity: on ? 1 : 0.45,
                        fontSize: 13,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      <span
                        style={{ width: 10, height: 10, borderRadius: 999, background: p.colour, display: "inline-block" }}
                      />
                      {p.title}
                    </button>
                  );
                })}
              </div>
              {overTime.length === 0 || visiblePages.length === 0 ? (
                <p style={{ margin: 0, opacity: 0.65, fontSize: 14 }}>Nothing to chart for this selection.</p>
              ) : (
                <div style={{ width: "100%", height: 280 }}>
                  <ResponsiveContainer>
                    <LineChart data={overTime} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
                      <CartesianGrid stroke={LINE} />
                      <XAxis dataKey="day" {...axis} />
                      <YAxis allowDecimals={false} {...axis} />
                      <Tooltip {...tooltip} />
                      {visiblePages.map((p) => (
                        <Line
                          key={p.id}
                          type="monotone"
                          dataKey={p.id}
                          name={p.title}
                          stroke={p.colour}
                          strokeWidth={2}
                          dot={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            {/* Status funnel */}
            <Card>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Lead status</h2>
              <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                {[
                  { label: "New", count: statuses.neu, rate: null as string | null },
                  { label: "Contacted", count: statuses.contacted, rate: stepRate(statuses.contacted, statuses.neu) },
                  {
                    label: "Converted",
                    count: statuses.converted,
                    rate: stepRate(statuses.converted, statuses.contacted),
                  },
                ].map((s, i) => {
                  const width = statuses.neu === 0 ? 0 : Math.max(8, (s.count / statuses.neu) * 100);
                  return (
                    <div key={s.label} style={{ display: "grid", gap: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                        <span style={{ fontWeight: 600 }}>
                          {s.label} — {num(s.count)}
                        </span>
                        {s.rate ? <span style={{ opacity: 0.65 }}>{s.rate} of previous stage</span> : null}
                      </div>
                      <div style={{ height: 16, borderRadius: 8, background: SURFACE }}>
                        <div
                          style={{
                            width: `${width}%`,
                            height: "100%",
                            borderRadius: 8,
                            background: COLOURS[i]!,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p style={{ margin: "12px 0 0", fontSize: 12, opacity: 0.6 }}>
                Statuses come from the Lead Tracker — mark leads as contacted or converted there to fill these stages.
              </p>
            </Card>

            {/* Campaign comparison */}
            <Card>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Campaign comparison</h2>
              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${LINE}` }}>
                      <th style={head}>Campaign</th>
                      <th style={head}>Landing page</th>
                      <th style={head}>Leads captured</th>
                      <th style={head}>Conversion rate</th>
                      <th style={head}>Date range</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaignRows.map((row) => (
                      <tr key={row.campaign} style={{ borderBottom: `1px solid ${LINE}` }}>
                        <td style={{ ...cell, fontWeight: 600 }}>{row.campaign}</td>
                        <td style={cell}>{[...row.pages].join(", ")}</td>
                        <td style={cell}>{num(row.count)}</td>
                        <td style={{ ...cell, opacity: 0.5 }}>—</td>
                        <td style={{ ...cell, whiteSpace: "nowrap" }}>
                          {shortDate(new Date(row.first).toISOString().slice(0, 10))} –{" "}
                          {shortDate(new Date(row.last).toISOString().slice(0, 10))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ margin: "12px 0 0", fontSize: 12, opacity: 0.6 }}>
                Conversion rate needs page visits, and visitor tracking isn&apos;t switched on yet.
              </p>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
