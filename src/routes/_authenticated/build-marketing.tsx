import { useImageRenderQueue } from "@/hooks/useImageRenderQueue";
import { ImageStatusTile } from "@/components/campaign/ImageStatusTile";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useWorkspace } from "@/hooks/useActiveProject";
import { getOrchestratorDefaults, startOrchestration, stepOrchestration, getRunReview, approveAllCompliant, approveOnePost, regenerateOnePost, approveOneVisual, editOnePost } from "@/lib/orchestrator.functions";
import { SURFACE, NAVY, LINE, PURPLE, PINK, TINT, font, primaryButton } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/build-marketing")({
  head: () => ({
    meta: [
      { title: "Build My Marketing | Haaylo" },
      { name: "description", content: "Tell Haaylo your goal and it prepares a month of on-brand marketing as drafts for you to review." },
      { property: "og:title", content: "Build My Marketing | Haaylo" },
      { property: "og:description", content: "A month of marketing, planned, written and placed on your calendar for review." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BuildMarketingPage,
});

const GOALS: Array<[string, string]> = [
  ["leads", "Generate leads"],
  ["bookings", "Drive bookings"],
  ["launch", "Launch a product or service"],
  ["sell", "Sell a specific offer"],
  ["event", "Promote an event"],
  ["visibility", "Increase visibility"],
  ["nurture", "Nurture my existing audience"],
];
const PLATFORMS = ["linkedin", "instagram", "facebook", "email"];

type Action = { key: string; label: string; stage: string; status: string; detail?: string; error?: string };
type Placement = { date: string; channel: string; pillar: string; reason: string; campaign: boolean; postId: string; ctaType: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Run = any;

const card: React.CSSProperties = { border: `1px solid ${LINE}`, background: SURFACE, borderRadius: 16, padding: 18 };
const chip = (on: boolean): React.CSSProperties => ({
  padding: "8px 14px", borderRadius: 999, border: `1px solid ${on ? PURPLE : LINE}`,
  background: on ? TINT.purple : "#fff", color: on ? TINT.purpleInk : NAVY, fontSize: 13, cursor: "pointer", fontFamily: font,
});
const STATUS: Record<string, [string, string, string]> = {
  pending: ["Waiting", TINT.blue, TINT.blueInk],
  running: ["Working", TINT.purple, TINT.purpleInk],
  done: ["Done", TINT.green, TINT.greenInk],
  needs_review: ["Needs review", TINT.pink, TINT.pinkInk],
  failed: ["Failed", TINT.pink, TINT.pinkInk],
  skipped: ["Skipped", TINT.blue, TINT.blueInk],
};

function BuildMarketingPage() {
  const { projectId, projectName } = useWorkspace();
  const loadDefaults = useServerFn(getOrchestratorDefaults);
  const start = useServerFn(startOrchestration);
  const step = useServerFn(stepOrchestration);

  const [goal, setGoal] = useState("leads");
  const [offer, setOffer] = useState("");
  const [offerChosen, setOfferChosen] = useState(false);
  const [launchDate, setLaunchDate] = useState("");
  const [platforms, setPlatforms] = useState<string[]>(["linkedin"]);
  const [perWeek, setPerWeek] = useState(3);
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const stopRef = useRef(false);

  const defaults = useQuery({
    queryKey: ["orchestrator-defaults", projectId],
    queryFn: () => loadDefaults({ data: { workspaceId: projectId } }),
  });

  useEffect(() => {
    const d = defaults.data?.defaults;
    if (!d) return;
    setGoal(d.goal);
    setPlatforms(d.platforms.filter((p: string) => PLATFORMS.includes(p)).length ? d.platforms.filter((p: string) => PLATFORMS.includes(p)) : ["linkedin"]);
    setPerWeek(d.postsPerWeek);
    setRun(defaults.data?.run ?? null);
  }, [defaults.data]);

  useEffect(() => () => { stopRef.current = true; }, []);

  // Offers that fit the chosen goal. One clear fit is preselected; several are shown to pick from.
  const offers: Array<{ label: string; score: number }> = defaults.data?.defaults?.offersByGoal?.[goal as never] ?? [];
  const relevant = offers.filter((o) => o.score > 0);
  useEffect(() => {
    if (!defaults.data) return;
    if (relevant.length === 1) { setOffer(relevant[0]!.label); setOfferChosen(true); }
    else if (offers.length === 1) { setOffer(offers[0]!.label); setOfferChosen(true); }
    else { setOffer(""); setOfferChosen(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal, defaults.data]);
  const needsOfferPick = !offerChosen && !offer.trim() && offers.length > 1 && !["visibility", "nurture"].includes(goal);

  async function drive(runId: string) {
    setBusy(true);
    stopRef.current = false;
    try {
      for (let i = 0; i < 20 && !stopRef.current; i += 1) {
        const next = await step({ data: { runId } });
        setRun(next);
        if (!next || next.status !== "running") break;
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something stopped the run. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function build() {
    setBusy(true);
    try {
      const { runId } = await start({
        data: { workspaceId: projectId, goal: goal as never, offer, launchDate: launchDate || null, platforms, postsPerWeek: perWeek },
      });
      setRun({ id: runId, status: "running", stage: "Planning your month", actions: [] });
      await drive(runId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't start. Try again.");
      setBusy(false);
    }
  }

  const actions: Action[] = run?.actions ?? [];
  const placements: Placement[] = run?.placements ?? [];
  const analysis = run?.analysis ?? {};
  const running = run?.status === "running";

  return (
    <AppShell title="Build My Marketing">
      <div style={{ display: "grid", gap: 16, maxWidth: 940, fontFamily: font, color: NAVY }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>Build My Marketing</h1>
          <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.6 }}>
            Tell Haaylo what you want this month to achieve for {projectName}. It checks your Brand DNA, strategy and calendar,
            then writes everything as drafts. Nothing is scheduled or published until you approve it.
          </p>
        </div>

        <section style={card}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>What's the goal?</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {GOALS.map(([k, label]) => (
              <button key={k} type="button" style={chip(goal === k)} onClick={() => setGoal(k)} disabled={busy}>{label}</button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginTop: 16 }}>
            <label style={{ fontSize: 13 }}>
              Offer or service
              <input value={offer} onChange={(e) => { setOffer(e.target.value); setOfferChosen(true); }} disabled={busy} maxLength={200} placeholder="Pick one below or type your own"
                style={{ display: "block", width: "100%", marginTop: 6, padding: 10, borderRadius: 10, border: `1px solid ${LINE}`, fontFamily: font }} />
            </label>
            <label style={{ fontSize: 13 }}>
              Launch or event date (optional)
              <input type="date" value={launchDate} onChange={(e) => setLaunchDate(e.target.value)} disabled={busy}
                style={{ display: "block", width: "100%", marginTop: 6, padding: 10, borderRadius: 10, border: `1px solid ${LINE}`, fontFamily: font }} />
            </label>
            <label style={{ fontSize: 13 }}>
              Posts per week
              <input type="number" min={1} max={7} value={perWeek} onChange={(e) => setPerWeek(Math.min(7, Math.max(1, Number(e.target.value) || 3)))} disabled={busy}
                style={{ display: "block", width: "100%", marginTop: 6, padding: 10, borderRadius: 10, border: `1px solid ${LINE}`, fontFamily: font }} />
            </label>
          </div>
          {offers.length > 1 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13 }}>{needsOfferPick ? "Which offer is this month about? Pick one so Haaylo doesn't guess." : "Offers from your Brand DNA"}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                {offers.map((o) => (
                  <button key={o.label} type="button" disabled={busy} style={chip(offer === o.label)} onClick={() => { setOffer(o.label); setOfferChosen(true); }}>{o.label}</button>
                ))}
                <button type="button" disabled={busy} style={chip(offerChosen && !offer)} onClick={() => { setOffer(""); setOfferChosen(true); }}>No specific offer</button>
              </div>
            </div>
          )}
          <div style={{ fontSize: 13, marginTop: 14 }}>Channels</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            {PLATFORMS.map((p) => (
              <button key={p} type="button" disabled={busy} style={chip(platforms.includes(p))}
                onClick={() => setPlatforms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]))}>
                {p === "linkedin" ? "LinkedIn" : p[0]!.toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          <button type="button" onClick={build} disabled={busy || platforms.length === 0 || needsOfferPick} style={{ ...primaryButton, marginTop: 18, opacity: busy ? 0.6 : 1 }}>
            {busy ? "Building…" : "Build My Marketing"}
          </button>
        </section>

        {run && (
          <section style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 600 }}>{running ? run.stage : run.status === "review_ready" ? "Ready for review" : run.stage}</div>
              {run.status === "running" && !busy && (
                <button type="button" style={chip(true)} onClick={() => drive(run.id)}>Carry on</button>
              )}
            </div>
            {analysis.strategy?.note && <p style={{ fontSize: 13, margin: "8px 0 0" }}>{analysis.strategy.note}</p>}
            {analysis.campaign?.why && <p style={{ fontSize: 13, margin: "6px 0 0" }}>{analysis.campaign.why}</p>}
            <ul style={{ listStyle: "none", padding: 0, margin: "14px 0 0", display: "grid", gap: 8 }}>
              {actions.map((a) => {
                const [label, bg, ink] = STATUS[a.status] ?? STATUS["pending"]!;
                return (
                  <li key={a.key} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: "10px 12px" }}>
                    <span style={{ background: bg, color: ink, fontSize: 11, fontWeight: 600, borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap" }}>{label}</span>
                    <div style={{ fontSize: 13 }}>
                      <div style={{ fontWeight: 600 }}>{a.label}</div>
                      {a.detail && <div>{a.detail}</div>}
                      {a.error && <div style={{ color: PINK }}>{a.error}</div>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {run?.status === "review_ready" && <Review runId={run.id} campaignId={run.campaign_id} placements={placements} />}
      </div>
    </AppShell>
  );
}

const COMPLIANCE: Record<string, [string, string, string]> = {
  pass: ["Passed", TINT.green, TINT.greenInk],
  repaired: ["Repaired", TINT.blue, TINT.blueInk],
  needs_review: ["Needs your attention", TINT.pink, TINT.pinkInk],
  unchecked: ["Not checked", TINT.blue, TINT.blueInk],
};
const channelName = (c: string) => (c === "linkedin" ? "LinkedIn" : c ? c[0]!.toUpperCase() + c.slice(1) : "");

function Review({ runId, campaignId, placements }: { runId: string; campaignId: string | null; placements: Placement[] }) {
  const qc = useQueryClient();
  const load = useServerFn(getRunReview);
  const approveAll = useServerFn(approveAllCompliant);
  const approveOne = useServerFn(approveOnePost);
  const regen = useServerFn(regenerateOnePost);
  const approveImg = useServerFn(approveOneVisual);
  const edit = useServerFn(editOnePost);
  const [working, setWorking] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const review = useQuery({ queryKey: ["run-review", runId], queryFn: () => load({ data: { runId } }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["run-review", runId] });
  async function act(key: string, fn: () => Promise<unknown>, done?: string) {
    setWorking(key);
    try { await fn(); if (done) toast.success(done); await refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "That didn't work. Try again."); }
    finally { setWorking(null); }
  }
  if (review.isLoading) return <section style={card}>Loading your month…</section>;
  const r = review.data;
  if (!r) return null;
  const s = r.summary;
  const eligible = r.posts.filter((p) => p.status === "draft" && (p.compliance === "pass" || p.compliance === "repaired")).length;
  const reasons = new Map(placements.map((p) => [p.postId, p.reason]));
  const lines = [
    `${s.socialDrafts} social drafts created`,
    s.campaigns ? `${s.campaigns} campaign created` : "",
    s.landingPages ? `${s.landingPages} landing page${s.landingPages > 1 ? "s" : ""} created` : "",
    s.guides ? `${s.guides} guide created` : "",
    s.emails ? `${s.emails} emails drafted` : "",
    s.blogs ? `${s.blogs} blog article written` : "",
    r.images.length ? `${s.imagesAwaiting} image${s.imagesAwaiting === 1 ? "" : "s"} awaiting visual approval` : "",
    `${s.passed} passed Brand Compliance`,
    `${s.repaired} automatically repaired`,
    `${s.needsReview} need${s.needsReview === 1 ? "s" : ""} your attention`,
  ].filter(Boolean);
  return (
    <section style={card}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Your month, ready for review</div>
      <ul style={{ margin: "0 0 12px", paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
        {lines.map((l) => <li key={l}>{l}</li>)}
      </ul>
      <p style={{ fontSize: 13, margin: "0 0 12px" }}>
        Approving marks a draft as ready. Nothing is scheduled or published until you schedule it.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        <button type="button" disabled={!eligible || !!working} style={{ ...primaryButton, opacity: eligible ? 1 : 0.5 }}
          onClick={() => act("all", async () => {
            const res = await approveAll({ data: { runId } });
            toast.success(`${res.approved} approved. ${res.skipped} left for you to check.`);
          })}>
          {working === "all" ? "Approving…" : `Approve all compliant (${eligible})`}
        </button>
        <Link to="/scheduler" style={chip(false)}>Calendar</Link>
        <Link to="/plan" style={chip(false)}>90-day strategy</Link>
        {campaignId && <Link to="/campaign/$id" params={{ id: campaignId }} style={chip(false)}>Open the campaign</Link>}
      </div>

      {r.images.length > 0 && <ReviewImages images={r.images} working={working} onApprove={(id) => act(id, () => approveImg({ data: { itemId: id } }), "Image approved")} onDone={refresh} />}

      <div style={{ display: "grid", gap: 8 }}>
        {r.posts.map((p) => {
          const [label, bg, ink] = COMPLIANCE[p.compliance] ?? COMPLIANCE["unchecked"]!;
          const isEditing = editing?.id === p.id;
          return (
            <div key={p.id} style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: "10px 12px", fontSize: 13 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ background: bg, color: ink, fontSize: 11, fontWeight: 600, borderRadius: 999, padding: "3px 9px" }}>{label}</span>
                <span style={{ fontWeight: 600 }}>
                  {p.date ? new Date(`${p.date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "Not dated"}
                  {" · "}{channelName(p.platform)}{p.pillar ? ` · ${p.pillar}` : ""}{p.campaign ? " · Campaign" : ""} · {p.status === "approved" ? "Approved" : "Draft"}
                </span>
              </div>
              {p.title && <div style={{ fontWeight: 600, marginTop: 6 }}>{p.title}</div>}
              {isEditing ? (
                <textarea value={editing?.text ?? ""} onChange={(e) => setEditing({ id: p.id, text: e.target.value })} rows={6}
                  style={{ width: "100%", marginTop: 6, padding: 8, borderRadius: 8, border: `1px solid ${LINE}`, fontFamily: font, fontSize: 13 }} />
              ) : (
                <div style={{ marginTop: 4, whiteSpace: "pre-wrap", maxHeight: 96, overflow: "hidden" }}>{p.caption}</div>
              )}
              {p.compliance === "needs_review" && p.violations.length > 0 && (
                <div style={{ color: PINK, marginTop: 4 }}>{p.violations.join(" · ")}</div>
              )}
              {(reasons.get(p.id) ?? p.reason) && <div style={{ marginTop: 4 }}><span style={{ fontWeight: 600 }}>Why Haaylo chose this:</span> {reasons.get(p.id) ?? p.reason}</div>}
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {isEditing ? (
                  <>
                    <button type="button" style={chip(true)} disabled={!!working} onClick={() => act(p.id, async () => {
                      const res = await edit({ data: { postId: p.id, caption: editing?.text ?? "" } });
                      setEditing(null);
                      toast[res.compliance === "needs_review" ? "error" : "success"](res.compliance === "needs_review" ? `Saved, but still flagged: ${res.violations.join(", ")}` : "Saved and checked");
                    })}>Save</button>
                    <button type="button" style={chip(false)} onClick={() => setEditing(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    {p.status === "draft" && <button type="button" style={chip(false)} disabled={!!working} onClick={() => act(p.id, () => approveOne({ data: { postId: p.id } }), "Approved")}>Approve</button>}
                    <button type="button" style={chip(false)} disabled={!!working} onClick={() => setEditing({ id: p.id, text: p.caption })}>Edit</button>
                    <button type="button" style={chip(false)} disabled={!!working} onClick={() => act(p.id, () => regen({ data: { postId: p.id } }), "Replaced with a fresh draft")}>
                      {working === p.id ? "Working…" : "Reject and rewrite"}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

type ReviewImage = { id: string; title: string | null; url: string | null; visual: string; imageStatus?: string; imageError?: string | null };
function ReviewImages({ images, working, onApprove, onDone }: { images: ReviewImage[]; working: string | null; onApprove: (id: string) => void; onDone: () => void }) {
  const { view, retry } = useImageRenderQueue(images, onDone);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Images (each needs your sign-off)</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {images.map((img) => {
          const v = view(img);
          return (
            <div key={img.id} style={{ width: 170, border: `1px solid ${LINE}`, borderRadius: 12, padding: 8, background: "#fff", fontSize: 12 }}>
              <ImageStatusTile view={v} alt={img.title ?? "Campaign image"} onRetry={() => retry(img.id)} />
              <div style={{ margin: "4px 0" }}>{img.title}</div>
              {img.visual === "approved" ? <span style={{ color: TINT.greenInk }}>Approved</span> : v.url ? (
                <>
                  <div style={{ color: TINT.pinkInk, marginBottom: 4 }}>Awaiting visual approval</div>
                  <button type="button" style={chip(false)} disabled={!!working} onClick={() => onApprove(img.id)}>Approve image</button>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
