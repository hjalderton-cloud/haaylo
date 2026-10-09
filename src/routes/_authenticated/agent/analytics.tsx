import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CARD } from "@/components/AppShell";
import { PINK, MUTED } from "@/components/WorkflowNav";
import { LINE } from "@/lib/theme";
import { useActiveProject } from "@/hooks/useActiveProject";
import { listAgentPosts, type AgentPostRow } from "@/lib/agent-queue.functions";
import { getZernioAnalytics, type ZernioPostStat } from "@/lib/zernio.functions";
import { matchPostStats } from "@/lib/match-post-stats";

export const Route = createFileRoute("/_authenticated/agent/analytics")({
  head: () => ({
    meta: [
      { title: "Agent analytics — haaylo.com" },
      { name: "description", content: "How the agent's approved posts performed: reach, engagement, best pillar and best day." },
      { property: "og:title", content: "Agent analytics — haaylo" },
      { property: "og:description", content: "Performance of AI-agent posts only, kept separate from your wider insights." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgentAnalytics,
});

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function AgentAnalytics() {
  const projectId = useActiveProject();
  const listFn = useServerFn(listAgentPosts);
  const statsFn = useServerFn(getZernioAnalytics);
  const [posts, setPosts] = useState<AgentPostRow[] | null>(null);
  const [stats, setStats] = useState<ZernioPostStat[]>([]);
  const [statsError, setStatsError] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    setPosts(null);
    void (async () => {
      try {
        const [p, s] = await Promise.all([
          listFn({ data: { projectId: projectId ?? null, status: "all" } }),
          statsFn({ data: { days: 90, limit: 100 } }).catch(() => null),
        ]);
        if (off) return;
        setPosts(p.posts);
        if (s && s.ok) setStats(s.analytics.posts);
        else setStatsError(s?.error ?? "Connect an account to see live numbers.");
      } catch {
        if (!off) setPosts([]);
      }
    })();
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const rows = useMemo(() => {
    const live = (posts ?? []).filter((p) => p.status === "scheduled" || p.status === "published");
    return matchPostStats(
      live.map((p) => ({
        id: p.id,
        title: p.title ?? "",
        caption: p.caption,
        platform: p.platform,
        externalId: p.external_post_id,
        pillar: p.pillar,
        when: p.published_at ?? p.scheduled_at,
      })),
      stats,
    );
  }, [posts, stats]);

  const byPlatform = useMemo(() => {
    const map = new Map<string, { platform: string; posts: number; impressions: number; clicks: number; er: number[] }>();
    for (const r of rows) {
      const k = (r.platform || "other").toLowerCase();
      const e = map.get(k) ?? { platform: k, posts: 0, impressions: 0, clicks: 0, er: [] };
      e.posts += 1;
      e.impressions += r.impressions ?? 0;
      e.clicks += r.clicks ?? 0;
      if (r.engagementRate !== null) e.er.push(r.engagementRate);
      map.set(k, e);
    }
    return [...map.values()];
  }, [rows]);

  const bestPillar = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const r of rows) {
      if (!r.pillar || r.engagementRate === null) continue;
      map.set(r.pillar, [...(map.get(r.pillar) ?? []), r.engagementRate]);
    }
    const scored = [...map.entries()].map(([pillar, v]) => ({ pillar, avg: v.reduce((a, b) => a + b, 0) / v.length }));
    return scored.sort((a, b) => b.avg - a.avg)[0] ?? null;
  }, [rows]);

  const bestDay = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const r of rows) {
      if (!r.when || r.engagementRate === null) continue;
      const d = new Date(r.when).getDay();
      map.set(d, [...(map.get(d) ?? []), r.engagementRate]);
    }
    const scored = [...map.entries()].map(([d, v]) => ({ day: DAYS[d]!, avg: v.reduce((a, b) => a + b, 0) / v.length }));
    return scored.sort((a, b) => b.avg - a.avg)[0] ?? null;
  }, [rows]);

  const n1 = (v: number) => Math.round(v * 10) / 10;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24 }}>Agent analytics</h1>
        <p style={{ color: MUTED, margin: "4px 0 0" }}>Agent posts only — nothing here counts your own content.</p>
      </div>

      {posts === null ? (
        <div style={{ ...CARD, padding: 24, color: MUTED }}>Loading the numbers…</div>
      ) : !rows.length ? (
        <div style={{ ...CARD, padding: 24, color: MUTED }}>
          No approved agent posts yet, so there's nothing to measure.
        </div>
      ) : (
        <>
          {statsError ? (
            <div style={{ ...CARD, padding: 14, color: MUTED, fontSize: 13 }}>{statsError}</div>
          ) : null}

          <div style={{ ...CARD, padding: 18 }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>By platform</h2>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ color: MUTED, textAlign: "left" }}>
                  <th style={{ padding: 6 }}>Platform</th>
                  <th style={{ padding: 6 }}>Posts</th>
                  <th style={{ padding: 6 }}>Impressions</th>
                  <th style={{ padding: 6 }}>Clicks</th>
                  <th style={{ padding: 6 }}>Engagement</th>
                </tr>
              </thead>
              <tbody>
                {byPlatform.map((p) => (
                  <tr key={p.platform} style={{ borderTop: `1px solid ${LINE}` }}>
                    <td style={{ padding: 6, textTransform: "capitalize" }}>{p.platform}</td>
                    <td style={{ padding: 6 }}>{p.posts}</td>
                    <td style={{ padding: 6 }}>{p.impressions || "—"}</td>
                    <td style={{ padding: 6 }}>{p.clicks || "—"}</td>
                    <td style={{ padding: 6 }}>
                      {p.er.length ? `${n1(p.er.reduce((a, b) => a + b, 0) / p.er.length)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ ...CARD, padding: 18 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>What the agent notices</h2>
            <p style={{ margin: 0, lineHeight: 1.6 }}>
              {bestPillar
                ? `Your ${bestPillar.pillar} posts average ${n1(bestPillar.avg)}% engagement — the strongest pillar so far.`
                : "There aren't enough live numbers yet to call a strongest pillar."}
              {" "}
              {bestDay
                ? `${bestDay.day} is the best day the agent has landed on. Worth putting more of the queue there.`
                : "Once a few posts have gone out, the agent will suggest a day and time."}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
