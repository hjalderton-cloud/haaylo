import { StrategyTimeline } from "@/components/StrategyTimeline";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useWorkspace } from "@/hooks/useActiveProject";
import { toast } from "sonner";
import {
  generateStrategyPlan,
  getStrategyPlan,
  saveStrategyPlan,
} from "@/lib/strategy.functions";
import type { StrategyPlan } from "@/lib/strategy.server";
import { listCampaigns } from "@/lib/campaigns.functions";
import { AppShell } from "@/components/AppShell";
import { NAVY as THEME_NAVY, GREY, LINE, SURFACE, font } from "@/lib/theme";
import { GenLoading } from "@/components/GenLoading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowRight,
  CalendarDays,
  Layers,
  Pencil,
  Sparkles,
  Target,
} from "lucide-react";

const NAVY = THEME_NAVY;
const MUTED = GREY;
const PILLAR_COLOURS = ["#3b82f6", "#14b8a6", "#f59e0b", "#f97362", "#64748b", "#84a98c"];

export const Route = createFileRoute("/_authenticated/plan")({
  head: () => ({
    meta: [
      { title: "90-Day Plan — Haaylo" },
      { property: "og:title", content: "90-Day Plan — Haaylo" },
      { property: "og:description", content: "Your monthly strategy, weekly focus and linked campaigns." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "description", content: "Your 90-day content plan — pillars, weekly themes and a timeline, built from your Strategy Profile." },
    ],
  }),
  component: ScopedPlanPage,
});

function defaultPlanName(): string {
  return `90-Day Plan — ${new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`;
}

function pillarColour(pillars: StrategyPlan["pillars"], name: string): string {
  const idx = pillars.findIndex((p) => p.name === name);
  return PILLAR_COLOURS[(idx === -1 ? 0 : idx) % PILLAR_COLOURS.length]!;
}

function ScopedPlanPage() {
  const { projectId } = useWorkspace();
  return projectId ? <PlanPage key={projectId} /> : <AppShell title="90-Day Plan">Pick a workspace first.</AppShell>;
}

function PlanPage() {
  const navigate = useNavigate();
  const { projectId: activeProjectId } = useWorkspace();
  const queryClient = useQueryClient();
  const fetchPlan = useServerFn(getStrategyPlan);
  const runGenerate = useServerFn(generateStrategyPlan);
  const runSave = useServerFn(saveStrategyPlan);

  const scope = { projectId: activeProjectId };
  const fetchCampaigns = useServerFn(listCampaigns);
  const campaignsQuery = useQuery({
    queryKey: ["campaigns", activeProjectId ?? "default"],
    queryFn: () => fetchCampaigns({ data: scope }),
  });
  const campaignForWeek = (week: number) =>
    (campaignsQuery.data ?? []).find(
      (c) => c.plan_week_start != null && c.plan_week_end != null && week >= c.plan_week_start && week <= c.plan_week_end,
    ) ?? null;
  const planQuery = useQuery({
    queryKey: ["strategy-plan", activeProjectId ?? "default"],
    queryFn: () => fetchPlan({ data: scope }),
  });
  const saved = planQuery.data?.plan ?? null;
  const [draft, setDraft] = useState<StrategyPlan | null>(null);
  const [editing, setEditing] = useState(false);
  const [goal, setGoal] = useState("");
  const [name, setName] = useState("");
  const [postsPerWeek, setPostsPerWeek] = useState(3);
  const plan = draft ?? saved;
  const planName = plan?.name ?? "";

  const generateMutation = useMutation({
    mutationFn: () =>
      runGenerate({ data: { goal, name: name.trim() || defaultPlanName(), postsPerWeek, ...scope } }),
    onSuccess: async (r) => {
      toast.success("Your 90-day plan is ready");
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["strategy-plan"] });
      void r;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "That didn't work — try again"),
  });
  const saveMutation = useMutation({
    mutationFn: () => {
      const current = draft ?? saved;
      if (!current) throw new Error("There's no plan to save yet.");
      const named: StrategyPlan = { ...current, name: (current.name ?? "").trim() || defaultPlanName() };
      return runSave({ data: { plan: named, ...scope } });
    },
    onSuccess: async () => {
      toast.success("Plan saved");
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: ["strategy-plan"] });
    },
    onError: () => toast.error("Couldn't save — try again"),
  });

  const updatePillar = (idx: number, patch: Partial<StrategyPlan["pillars"][number]>) => {
    if (!plan) return;
    const next = structuredClone(plan);
    next.pillars[idx] = { ...next.pillars[idx]!, ...patch };
    setDraft(next);
  };
  const updateWeek = (idx: number, patch: Partial<StrategyPlan["weeks"][number]>) => {
    if (!plan) return;
    const next = structuredClone(plan);
    next.weeks[idx] = { ...next.weeks[idx]!, ...patch };
    setDraft(next);
  };

  return (
    <AppShell title="90-Day Plan">
      <div className="mx-auto max-w-4xl space-y-8 pb-20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight" style={{ color: NAVY, fontFamily: font }}>
              90-Day Plan
            </h1>
            {planName && !editing && (
              <p className="mt-1 text-sm font-medium" style={{ color: NAVY }}>
                {planName}
              </p>
            )}
            <p className="mt-1 text-sm" style={{ color: GREY }}>
              Your content pillars, weekly themes and timeline — built from your Strategy Profile.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {plan && (
              <Button
                variant="outline"
                onClick={() => {
                  if (editing) {
                    setDraft(null);
                    setEditing(false);
                  } else {
                    setDraft(saved ? structuredClone(saved) : null);
                    setEditing(true);
                  }
                }}
              >
                <Pencil className="mr-1.5 h-4 w-4" />
                {editing ? "Discard edits" : "Edit plan"}
              </Button>
            )}
            {editing ? (
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : "Save plan"}
              </Button>
            ) : (
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
              >
                <Sparkles className="mr-1.5 h-4 w-4" />
                {generateMutation.isPending ? "Building your plan…" : plan ? "Regenerate plan" : "Build my 90-day plan"}
              </Button>
            )}
          </div>
        </div>

        {/* Generation options */}
        <section
          className="grid gap-4 rounded-2xl border p-5 sm:grid-cols-[1fr_1fr_160px]"
          style={{ borderColor: LINE, background: SURFACE }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="plan-name">Strategy name</Label>
            <Input
              id="plan-name"
              value={editing ? (draft?.name ?? "") : name}
              onChange={(e) =>
                editing && plan
                  ? setDraft({ ...plan, name: e.target.value })
                  : setName(e.target.value)
              }
              placeholder={defaultPlanName()}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-goal">Goal for the 90 days (optional)</Label>
            <Input
              id="plan-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. 30 qualified enquiries a month by Christmas"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-cadence">Posts per week</Label>
            <Input
              id="plan-cadence"
              type="number"
              min={1}
              max={14}
              value={postsPerWeek}
              onChange={(e) => setPostsPerWeek(Math.max(1, Math.min(14, Number(e.target.value) || 3)))}
            />
          </div>
        </section>

        {generateMutation.isPending && (
          <section
            className="rounded-2xl border px-6"
            style={{ borderColor: LINE, background: SURFACE }}
          >
            <GenLoading
              label="Building your 90-day plan…"
              estimate="Usually takes about 45–60 seconds"
            />
          </section>
        )}

        {!plan && !planQuery.isLoading && (
          <section
            className="rounded-2xl border p-8 text-center"
            style={{ borderColor: LINE, background: SURFACE }}
          >
            <Target className="mx-auto h-8 w-8" style={{ color: MUTED }} />
            <p className="mt-3 font-semibold" style={{ color: NAVY }}>
              No plan yet
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm" style={{ color: MUTED }}>
              Press Build my 90-day plan. It reads your Strategy Profile and maps the next twelve
              weeks: what to talk about, in what order, and why.
            </p>
          </section>
        )}

        {plan && (
          <>
            {plan.goal && (
              <section
                className="rounded-2xl border p-5"
                style={{ borderColor: LINE, background: SURFACE }}
              >
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                  The goal
                </p>
                {editing ? (
                  <Input
                    className="mt-2"
                    value={draft?.goal ?? ""}
                    onChange={(e) => setDraft({ ...plan, goal: e.target.value })}
                  />
                ) : (
                  <p className="mt-1.5 text-base font-medium" style={{ color: NAVY }}>
                    {plan.goal}
                  </p>
                )}
              </section>
            )}

            {/* Pillars — full-width stacked cards */}
            <details className="space-y-3" open={editing || undefined}>
              <summary className="cursor-pointer font-semibold text-foreground">Content pillars ({plan.pillars.length})</summary>
              <div className="hidden">
                <Layers className="h-4 w-4" style={{ color: GREY }} />
                <h2 className="font-semibold" style={{ color: NAVY, fontFamily: font }}>
                  Content pillars
                </h2>
              </div>
              <div className="space-y-4">
                {plan.pillars.map((pillar, i) => {
                  const colour = PILLAR_COLOURS[i % PILLAR_COLOURS.length]!;
                  const topicCount = pillar.topics.length;
                  return (
                    <div
                      key={i}
                      className="rounded-2xl border p-6"
                      style={{ borderColor: LINE, background: SURFACE, borderLeft: `6px solid ${colour}` }}
                    >
                      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
                        <div className="min-w-0">
                          <div className="flex items-center gap-3">
                            <span
                              className="h-4 w-4 shrink-0 rounded-full"
                              style={{ background: colour }}
                              aria-hidden
                            />
                            {editing ? (
                              <Input
                                value={draft?.pillars[i]?.name ?? ""}
                                onChange={(e) => updatePillar(i, { name: e.target.value })}
                                className="text-lg font-semibold"
                              />
                            ) : (
                              <h3 className="text-lg font-semibold leading-tight" style={{ color: NAVY }}>
                                {pillar.name}
                              </h3>
                            )}
                          </div>
                          {editing ? (
                            <Input
                              value={draft?.pillars[i]?.description ?? ""}
                              onChange={(e) => updatePillar(i, { description: e.target.value })}
                              className="mt-3 text-sm"
                            />
                          ) : (
                            <p className="mt-2 text-sm leading-relaxed" style={{ color: NAVY }}>
                              {pillar.description}
                            </p>
                          )}
                          {pillar.topics.length > 0 && (
                            <ul className="mt-3 flex flex-wrap gap-2">
                              {pillar.topics.map((topic, t) => (
                                <li
                                  key={t}
                                  className="rounded-full px-2.5 py-1 text-xs font-medium"
                                  style={{ color: NAVY, background: `${colour}22` }}
                                >
                                  {topic}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                          <span
                            className="text-xs font-semibold uppercase tracking-wide"
                            style={{ color: MUTED }}
                          >
                            {topicCount} {topicCount === 1 ? "topic" : "topics"}
                          </span>
                          {!editing && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                navigate({
                                  to: "/engine",
                                  hash: `m=content&t=plan&pillar=${encodeURIComponent(pillar.name)}`,
                                })
                              }
                            >
                              View posts
                              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>

            <StrategyTimeline plan={plan} workspaceId={activeProjectId ?? ""} editing={editing} updateWeek={updateWeek} campaignForWeek={campaignForWeek} />

            {/* Next step */}
            <Link
              to="/engine"
              hash="m=content"
              className="group flex items-center justify-between rounded-2xl border p-5 transition-colors hover:border-[#E4656E]"
              style={{ borderColor: LINE, background: SURFACE }}
            >
              <div>
                <p className="font-semibold" style={{ color: NAVY }}>
                  Start writing from this plan
                </p>
                <p className="mt-0.5 text-xs" style={{ color: MUTED }}>
                  Open Content Hub and turn week one's theme into your first posts.
                </p>
              </div>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" style={{ color: "#E4656E" }} />
            </Link>
          </>
        )}
      </div>
    </AppShell>
  );
}
