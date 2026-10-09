import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useWorkspace } from "@/hooks/useActiveProject";
import { getStrategyPlan } from "@/lib/strategy.functions";
import { generatePostBatch } from "@/lib/post-batch.functions";
import { GenLoading } from "@/components/GenLoading";
import { SURFACE, NAVY, GREY, LINE, PINK, font } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/content-plan")({
  head: () => ({
    meta: [
      { title: "30-Day Content Plan — Haaylo" },
      {
        name: "description",
        content: "This month's content, week by week — themes, post counts and one-click generation into your Content Bank.",
      },
      { property: "og:title", content: "30-Day Content Plan — Haaylo" },
      { property: "og:description", content: "Your month of content, planned week by week." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContentPlanPage,
});

const MONTHS: Array<{ label: string; from: number; to: number }> = [
  { label: "Month 1 — weeks 1–4", from: 1, to: 4 },
  { label: "Month 2 — weeks 5–8", from: 5, to: 8 },
  { label: "Month 3 — weeks 9–13", from: 9, to: 13 },
];

const card: React.CSSProperties = {
  border: `1px solid ${LINE}`,
  background: SURFACE,
  borderRadius: 16,
  padding: 18,
};

function ContentPlanPage() {
  const { projectId } = useWorkspace();
  const fetchPlan = useServerFn(getStrategyPlan);
  const runBatch = useServerFn(generatePostBatch);

  const [monthIdx, setMonthIdx] = useState(0);
  const [count, setCount] = useState(12);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<number | null>(null);

  const planQuery = useQuery({
    queryKey: ["strategy-plan", projectId ?? "default"],
    queryFn: () => fetchPlan({ data: { projectId } }),
    enabled: Boolean(projectId),
  });

  const plan = planQuery.data?.plan ?? null;
  const month = MONTHS[monthIdx]!;
  const weeks = useMemo(
    () => (plan?.weeks ?? []).filter((w) => w.week >= month.from && w.week <= month.to),
    [plan, month.from, month.to],
  );

  /** "September 2026 — 30-day content plan", counting forward from today for later months. */
  const collectionName = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthIdx);
    const label = d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    return `${label} — 30-day content plan`;
  }, [monthIdx]);

  async function generate() {
    if (!projectId) return;
    setBusy(true);
    setMade(null);
    try {
      const themes = weeks.map((w) => `Week ${w.week}: ${w.theme}`).join("; ");
      const res = await runBatch({
        data: {
          workspaceId: projectId,
          topic: themes
            ? `This month's content plan — ${themes}`
            : "A month of social content for this business",
          count,
          platforms: [],
          weekFrom: month.from,
          weekTo: month.to,
          collection: collectionName,
        },
      });
      setMade(res.created);
      toast.success(`${res.created} posts written into your Content Bank.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't generate. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!projectId) return <AppShell title="30-Day Content Plan">Pick a workspace first.</AppShell>;

  return (
    <AppShell title="30-Day Content Plan">
      <div style={{ display: "grid", gap: 16, maxWidth: 940, fontFamily: font, color: NAVY }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>30-Day Content Plan</h1>
          <p style={{ margin: "6px 0 0", color: GREY, fontSize: 14, lineHeight: 1.6 }}>
            A month of your 90-day strategy, week by week. Generate the whole month in one go — the posts land in
            your Content Bank as drafts, written in your own voice with your saved calls to action.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {MONTHS.map((m, i) => (
            <button
              key={m.label}
              type="button"
              onClick={() => setMonthIdx(i)}
              style={{
                padding: "9px 14px",
                borderRadius: 999,
                border: `1px solid ${i === monthIdx ? PINK : LINE}`,
                background: i === monthIdx ? PINK : "transparent",
                color: i === monthIdx ? "#FFFFFF" : NAVY,
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
                fontFamily: font,
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {planQuery.isLoading && <div style={{ ...card, color: GREY }}>Loading your plan…</div>}

        {!planQuery.isLoading && !plan && (
          <div style={{ ...card, display: "grid", gap: 10 }}>
            <strong style={{ fontSize: 15 }}>No 90-day strategy yet</strong>
            <span style={{ color: GREY, fontSize: 13.5, lineHeight: 1.6 }}>
              Build the 90-day strategy first and this month's weekly themes fill in automatically. You can still
              generate a month of posts without it.
            </span>
            <Link to="/plan" style={{ color: PINK, fontWeight: 700, fontSize: 13.5 }}>
              Open the 90-day strategy
            </Link>
          </div>
        )}

        {weeks.length > 0 && (
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            {weeks.map((w) => (
              <div key={w.week} style={card}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: ".08em",
                    textTransform: "uppercase",
                    color: GREY,
                  }}
                >
                  Week {w.week}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, margin: "6px 0" }}>{w.theme}</div>
                <div style={{ fontSize: 13, color: GREY, lineHeight: 1.6 }}>{w.focus}</div>
                {w.pillar && (
                  <div style={{ marginTop: 8, fontSize: 12, color: NAVY, fontWeight: 600 }}>{w.pillar}</div>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ ...card, display: "grid", gap: 12 }}>
          <strong style={{ fontSize: 15 }}>Generate this month's posts</strong>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, color: GREY }}>
            How many posts
            <input
              type="number"
              min={1}
              max={30}
              value={count}
              onChange={(e) => setCount(Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
              style={{
                width: 80,
                padding: "8px 10px",
                borderRadius: 9,
                border: `1px solid ${LINE}`,
                background: SURFACE,
                color: NAVY,
                fontFamily: font,
              }}
            />
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              onClick={generate}
              disabled={busy}
              style={{
                padding: "12px 20px",
                borderRadius: 12,
                border: "none",
                background: PINK,
                color: "#FFFFFF",
                fontWeight: 700,
                fontSize: 14,
                cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.6 : 1,
                fontFamily: font,
              }}
            >
              {busy ? "Writing your posts…" : `Generate ${count} posts`}
            </button>
            {made !== null && (
              <Link to="/bank" style={{ color: PINK, fontWeight: 700, fontSize: 13.5 }}>
                Open the Content Bank
              </Link>
            )}
          </div>
          {busy && <GenLoading label="Writing this month's posts" />}
        </div>
      </div>
    </AppShell>
  );
}
