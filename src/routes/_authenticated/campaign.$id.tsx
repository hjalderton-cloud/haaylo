import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { CampaignSwitcher } from "@/components/CampaignSwitcher";
import {
  getCampaign,
  setCampaignAssetStatus,
  setCampaignPhase,
  updateCampaignLaunchSettings,
  type AssetKey,
  type CampaignRecord,
} from "@/lib/campaigns.functions";
import { generateCampaignAsset, generatePhaseAssets } from "@/lib/campaign-generate.functions";
import { LAUNCH_PHASES, currentPhase, daysRemainingInPhase, phaseDef } from "@/lib/phases";
import { CampaignAssetPanels, type CampaignTab } from "@/components/campaign/CampaignAssetPanels";
import { CampaignAssetGrid } from "@/components/campaign/CampaignAssetGrid";
import { CampaignLaunchGuide } from "@/components/campaign/CampaignLaunchGuide";
import { getStrategyPlan } from "@/lib/strategy.functions";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "@/hooks/useActiveProject";

/** The stretch of 90-day plan weeks this campaign is a chapter of. */
function PlanWeeksStrip({ from, to }: { from: number; to: number }) {
  const { projectId: activeProjectId } = useWorkspace();
  const fetchPlan = useServerFn(getStrategyPlan);
  const planQuery = useQuery({
    queryKey: ["strategy-plan", activeProjectId ?? "default"],
    queryFn: () => fetchPlan({ data: { projectId: activeProjectId } }),
  });
  const weeks = (planQuery.data?.plan?.weeks ?? []).filter((w) => w.week >= from && w.week <= to);
  if (weeks.length === 0) return null;
  return (
    <div
      style={{
        border: `1px solid ${LINE}`,
        background: SURFACE,
        borderRadius: 16,
        padding: 16,
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: GREY, fontFamily: font }}>
          Weeks {from}–{to} of your 90-day plan
        </span>
        <Link to="/plan" style={{ fontSize: 12, color: PINK, fontWeight: 700, fontFamily: font }}>
          Open the plan
        </Link>
      </div>
      <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
        {weeks.map((w) => (
          <li key={w.week} style={{ fontSize: 13, color: MUTED, fontFamily: font }}>
            <strong style={{ color: NAVY }}>Week {w.week}</strong> — {w.theme}
          </li>
        ))}
      </ul>
    </div>
  );
}




/** What Haaylo recommended, shown on campaigns it built from a brief. */
function AgentBriefPanel({ row }: { row: CampaignRecord }) {
  const b = row.agent_brief;
  if (!b) return null;
  const facts: { label: string; value: string }[] = [
    { label: "You asked for", value: b.brief ?? "" },
    { label: "Goal", value: b.goal ?? "" },
    { label: "Audience", value: b.audience ?? "" },
    { label: "Channels", value: (b.channels ?? []).join(", ") },
  ].filter((f) => f.value.trim().length > 0);
  if (facts.length === 0) return null;

  return (
    <div
      style={{
        border: `1px solid ${LINE}`,
        background: SURFACE,
        borderRadius: 16,
        padding: 16,
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: PURPLE, fontFamily: font }}>
          Built by Haaylo
        </span>
        <Link to="/home" style={{ fontSize: 12, color: PINK, fontWeight: 700, fontFamily: font }}>
          Back to the Briefing Room
        </Link>
      </div>
      <dl style={{ margin: "10px 0 0", display: "grid", gap: 8 }}>
        {facts.map((f) => (
          <div key={f.label}>
            <dt style={{ fontSize: 11.5, fontWeight: 800, color: NAVY, fontFamily: font }}>{f.label}</dt>
            <dd style={{ margin: 0, fontSize: 13, color: MUTED, fontFamily: font }}>{f.value}</dd>
          </div>
        ))}
      </dl>
      {b.grounding ? (
        <p style={{ margin: "10px 0 0", fontSize: 12.5, color: MUTED, fontFamily: font }}>{b.grounding}</p>
      ) : null}
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/campaign/$id")({
  head: () => ({
    meta: [
      { title: "Campaign hub — haaylo.com" },
      { name: "description", content: "Everything this campaign is building: posts, landing page, lead magnet, emails and images." },
      { property: "og:title", content: "Campaign hub — haaylo.com" },
      { property: "og:description", content: "Everything this campaign is building, in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CampaignHub,
});

import {
  SURFACE,
  NAVY,
  INDIGO,
  PURPLE as THEME_PURPLE,
  PINK as THEME_PINK,
  GREY,
  LINE,
  TINT,
  font,
} from "@/lib/theme";

const PINK = THEME_PINK;
const MUTED = GREY;
const BLUE = TINT.blueInk;
const PURPLE = THEME_PURPLE;



const TABS: { key: CampaignTab; label: string }[] = [
  { key: "overview", label: "Overview & asset gallery" },
  { key: "leads", label: "Lead generation" },
  { key: "studio", label: "Content studio" },
];

const quietLink: React.CSSProperties = {
  padding: "9px 13px",
  borderRadius: 11,
  border: `1px solid ${LINE}`,
  color: INDIGO,
  fontSize: 12.5,
  fontWeight: 700,
  textDecoration: "none",
  fontFamily: font,
};

type Tile = { key: AssetKey; flag: keyof CampaignRecord; label: string; to: string };

const TILES: Tile[] = [
  { key: "landing_page", flag: "has_landing_page", label: "Landing Page", to: "/landing" },
  { key: "lead_magnet", flag: "has_lead_magnet", label: "Lead Magnet Guide", to: "/funnel" },
  { key: "email_sequence", flag: "has_email_sequence", label: "Email Sequence", to: "/funnel" },
  { key: "image_pack", flag: "has_image_pack", label: "Image Pack", to: "/image" },
  { key: "blog", flag: "has_blog", label: "Blog Article", to: "/bank" },
];

const card: React.CSSProperties = {
  borderRadius: 16,
  border: `1px solid ${LINE}`,
  background: SURFACE,
  padding: 16,
  minWidth: 0,
};

function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 14,
        height: 14,
        borderRadius: "50%",
        border: `2px solid ${LINE}`,
        borderTopColor: PINK,
        animation: "haaylo-spin 0.8s linear infinite",
      }}
    />
  );
}

function StatusBadge({ state }: { state: string }) {
  const map: Record<string, { text: string; colour: string; bg: string }> = {
    generating: { text: "Generating…", colour: TINT.pinkInk, bg: TINT.pink },
    ready: { text: "Ready to review", colour: TINT.blueInk, bg: TINT.blue },
    complete: { text: "Complete", colour: TINT.greenInk, bg: TINT.green },
  };
  const s = map[state] ?? map.ready;
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: ".06em",
        textTransform: "uppercase",
        padding: "3px 8px",
        borderRadius: 999,
        background: s.bg,
        color: s.colour,
        whiteSpace: "nowrap",
      }}
    >
      {s.text}
    </span>
  );
}

function CampaignHub() {
  const { projectId, projectName } = useWorkspace();
  const { id } = useParams({ from: "/_authenticated/campaign/$id" });
  const getFn = useServerFn(getCampaign);
  const setStatusFn = useServerFn(setCampaignAssetStatus);
  const generateFn = useServerFn(generateCampaignAsset);
  const [row, setRow] = useState<CampaignRecord | null | undefined>(undefined);
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState<CampaignTab>("overview");

  const settling = useRef(false);


  useEffect(() => {
    let cancelled = false;
    setRow(undefined);
    (async () => {
      try {
        const data = await getFn({ data: { id, projectId } });
        if (!cancelled) setRow(data);
      } catch {
        if (!cancelled) setRow(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, projectId]);

  const settle = useCallback(
    async (campaign: CampaignRecord) => {
      const pending = Object.entries(campaign.asset_status ?? {})
        .filter(([, v]) => v === "generating")
        .map(([k]) => k as AssetKey);
      if (pending.length === 0 || settling.current) return;
      settling.current = true;
      try {
        // Each asset only depends on the campaign itself, so they all run at
        // once: the wait is the slowest single piece, not the sum of them all.
        await Promise.all(
          pending.map(async (key) => {
            try {
              await generateFn({ data: { campaignId: campaign.id, key } });
            } catch (e) {
              setFailures((f) => ({
                ...f,
                [key]: e instanceof Error ? e.message : "That didn't generate. Try again.",
              }));
              await setStatusFn({ data: { id: campaign.id, key, state: "ready" } });
            } finally {
              setReloadKey((k) => k + 1);
            }
          }),
        );
        // One authoritative read once everything has settled.
        try {
          setRow(await getFn({ data: { id: campaign.id, projectId } }));
        } catch {
          /* the page still shows what it already has */
        }
        setReloadKey((k) => k + 1);
      } finally {
        settling.current = false;
      }
    },
    [generateFn, setStatusFn, getFn, projectId],
  );

  useEffect(() => {
    if (!row) return;
    const hasPending = Object.values(row.asset_status ?? {}).some((v) => v === "generating");
    if (!hasPending || settling.current) return;
    void settle(row);
  }, [row, settle]);


  if (row === undefined) {
    return (
      <AppShell title="Campaign">
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ ...card, height: 76, background: SURFACE }} />
          <div style={{ ...card, height: 96 }} />
          <div style={{ ...card, height: 96 }} />
        </div>
      </AppShell>
    );
  }

  if (!row) {
    return (
      <AppShell title="Campaign">
        <p style={{ fontSize: 14, color: MUTED, fontFamily: font }}>That campaign isn't here any more.</p>
        <Link to="/campaign" style={{ color: PINK, fontWeight: 700, fontFamily: font }}>Back to campaigns</Link>
      </AppShell>
    );
  }

  const is30 = row.campaign_duration === "30-day";
  const campaignPhase = is30 ? currentPhase(row as never) : null;
  const status = (row.asset_status ?? {}) as Record<string, string>;
  const tiles = TILES.filter((t) => row[t.flag] === true).map((t) => ({
    ...t,
    state: status[t.key] ?? "ready",
  }));

  return (
    <AppShell title={row.campaign_title}>
      <style>{"@keyframes haaylo-spin{to{transform:rotate(360deg)}}"}</style>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "flex-start",
          justifyContent: "space-between",
          borderRadius: 18,
          border: `1px solid ${LINE}`,
          background: SURFACE,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ minWidth: 0, flex: "1 1 260px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            <h1
              style={{
                margin: 0,
                fontFamily: font,
                fontSize: "clamp(20px, 3.4vw, 28px)",
                color: NAVY,
                overflowWrap: "anywhere",
                fontWeight: 700,
              }}
            >
              {row.campaign_title}
            </h1>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                padding: "4px 9px",
                borderRadius: 999,
                whiteSpace: "nowrap",
                background: is30 ? TINT.purple : TINT.blue,
                color: is30 ? TINT.purpleInk : TINT.blueInk,
                fontFamily: font,
              }}
            >
              {is30 ? "30-Day Launch" : "90-Day"}
            </span>
          </div>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 13.5,
              color: MUTED,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontFamily: font,
            }}
            title={row.campaign_theme}
          >
            {row.campaign_theme}
          </p>
        </div>
        <div style={{ flex: "0 0 auto" }}>
          <CampaignSwitcher currentId={row.id} />
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Campaign sections"
        style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}
      >
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              style={{
                padding: "8px 13px",
                borderRadius: 999,
                border: `1px solid ${active ? "transparent" : LINE}`,
                background: active ? PINK : "transparent",
                color: active ? "#FFFFFF" : INDIGO,
                fontSize: 12.5,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: font,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "overview" && Object.values(status).some((v) => v === "generating") && (
        <div style={{ ...card, marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <Spinner />
          <span style={{ fontSize: 13.5, color: MUTED, fontFamily: font }}>
            Haaylo is writing the rest of this campaign. Everything appears here as it lands.
          </span>
        </div>
      )}

      {tab === "overview" && (
        <CampaignLaunchGuide
          campaignId={row.id}
          projectId={projectId}
          reloadKey={reloadKey}
          onChanged={() => setReloadKey((k) => k + 1)}
        />
      )}

      {tab === "overview" && (
        <CampaignAssetGrid
          campaignId={row.id}
          reloadKey={reloadKey}
          brandName={projectName || row.campaign_title}
          headline={row.landing_page_headline ?? row.campaign_title}
          currentPhase={campaignPhase}
          onOpenTab={setTab}
        />
      )}

      {tab === "overview" && <AgentBriefPanel row={row} />}

      {tab === "overview" &&
        row.plan_week_start != null &&
        row.plan_week_end != null && <PlanWeeksStrip from={row.plan_week_start} to={row.plan_week_end} />}

      {is30 && (tab === "overview" || tab === "studio") && (
        <PhaseControl row={row} onChange={setRow} onGenerated={() => setReloadKey((k) => k + 1)} />
      )}

      {tab === "leads" && (
        <div style={{ ...card, marginBottom: 14, display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Link to="/landing" search={{ campaign: row.id } as never} style={quietLink}>Landing page builder</Link>
          <Link to="/snippets" search={{ campaign: row.id } as never} style={quietLink}>Pop-up &amp; embed code</Link>
          <Link to="/funnel" search={{ campaign: row.id } as never} style={quietLink}>Gojiberry &amp; capture settings</Link>
          <Link to="/leads" search={{ campaign: row.id } as never} style={quietLink}>Lead tracker</Link>
        </div>
      )}

      {tab === "studio" && (
        <div style={{ ...card, marginBottom: 14, display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Link to="/bank" search={{ campaign: row.id } as never} style={quietLink}>Content Bank</Link>
          <Link to="/tools" style={quietLink}>Content Hub</Link>
          <Link to="/ideas" style={quietLink}>Idea generator</Link>
          <Link to="/repurpose" style={quietLink}>Repurposing suite</Link>
          <Link to="/engine" hash="m=chat" style={quietLink}>Brainstorm</Link>
        </div>
      )}

      {tab === "overview" && (
      <div

        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
          gap: 12,
        }}
      >
        {tiles.map((t) => (
          <div key={t.key} style={card}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 800, fontSize: 15, color: NAVY, overflowWrap: "anywhere", fontFamily: font }}>{t.label}</span>
              <StatusBadge state={t.state} />
            </div>

            {failures[t.key] && (
              <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "#C0334B", overflowWrap: "anywhere", fontFamily: font }}>
                {failures[t.key]}
              </p>
            )}



            {t.state === "generating" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                <Spinner />
                <span style={{ fontSize: 12.5, color: MUTED, fontFamily: font }}>Usually takes about 30–45 seconds</span>
              </div>
            ) : (
              <Link
                to={t.to}
                search={{ campaign: row.id } as never}
                style={{
                  display: "inline-block",
                  marginTop: 12,
                  padding: "9px 13px",
                  borderRadius: 11,
                  background: PINK,
                  color: "#FFFFFF",
                  fontSize: 12.5,
                  fontWeight: 800,
                  textDecoration: "none",
                  fontFamily: font,
                }}
              >
                Open {t.label}
              </Link>
            )}
          </div>
        ))}
      </div>
      )}

      <CampaignAssetPanels
        campaignId={row.id}
        reloadKey={reloadKey}
        tab={tab}
        projectId={projectId}
        currentPhase={campaignPhase}
        show={{
          posts: row.has_social_posts === true,
          landing: row.has_landing_page === true,
          guide: row.has_lead_magnet === true,
          emails: row.has_email_sequence === true,
          images: row.has_image_pack === true,
          blog: row.has_blog === true,
        }}
      />

      <p style={{ marginTop: 20 }}>
        <Link to="/campaign" style={{ color: MUTED, fontSize: 13, fontWeight: 700, fontFamily: font }}>All campaigns</Link>
      </p>

    </AppShell>
  );
}

/** 30-day launch phase: progress bar, days remaining, and advancing by hand. */
function PhaseControl({
  row,
  onChange,
  onGenerated,
}: {
  row: CampaignRecord;
  onChange: (r: CampaignRecord) => void;
  onGenerated: () => void;
}) {
  const setPhaseFn = useServerFn(setCampaignPhase);
  const settingsFn = useServerFn(updateCampaignLaunchSettings);
  const generateFn = useServerFn(generatePhaseAssets);

  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [offer, setOffer] = useState<number | null>(null);
  const [genState, setGenState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [genMessage, setGenMessage] = useState("");

  const [checkout, setCheckout] = useState(row.checkout_url ?? "");
  const [closes, setCloses] = useState(
    row.cart_closes_at ? new Date(row.cart_closes_at).toISOString().slice(0, 16) : "",
  );
  const [settingsState, setSettingsState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [settingsMessage, setSettingsMessage] = useState("");

  const manual = row.phase_override === true;
  const current = currentPhase(row as never);
  const remaining = daysRemainingInPhase(row as never);
  const def = phaseDef(current);
  const nextPhase = current < 4 ? current + 1 : null;

  async function advance(phase: number) {
    setBusy(true);
    setConfirming(null);
    try {
      const updated = await setPhaseFn({ data: { id: row.id, phase, override: true } });
      onChange(updated);
      setOffer(phase);
      setGenState("idle");
      setGenMessage("");
    } catch {
      /* leave the current state showing */
    } finally {
      setBusy(false);
    }
  }

  async function followCalendar() {
    setBusy(true);
    try {
      const updated = await setPhaseFn({ data: { id: row.id, phase: current, override: false } });
      onChange(updated);
    } catch {
      /* leave the current state showing */
    } finally {
      setBusy(false);
    }
  }

  async function generate(phase: number) {
    setGenState("working");
    try {
      const res = await generateFn({ data: { campaignId: row.id, phase, what: "both" } });
      setGenState("done");
      setGenMessage(
        `Written: ${res.posts} post${res.posts === 1 ? "" : "s"} and ${res.emails} email${res.emails === 1 ? "" : "s"} for phase ${phase}.`,
      );
      onGenerated();
    } catch (e) {
      setGenState("error");
      setGenMessage(e instanceof Error ? e.message : "That didn't work — try again.");
    }
  }

  async function saveSettings() {
    setSettingsState("saving");
    try {
      const updated = await settingsFn({
        data: {
          id: row.id,
          checkoutUrl: checkout.trim() || null,
          cartClosesAt: closes ? new Date(closes).toISOString() : null,
        },
      });
      onChange(updated);
      setSettingsState("saved");
      setSettingsMessage("");
      setTimeout(() => setSettingsState("idle"), 1800);
    } catch (e) {
      setSettingsState("error");
      setSettingsMessage(e instanceof Error ? e.message : "That didn't save. Try again.");
    }
  }

  return (
    <div style={{ ...card, marginBottom: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 800, fontSize: 15, color: NAVY, fontFamily: font }}>
          Phase {current} · {def.label}
          <span style={{ color: MUTED, fontWeight: 600 }}>
            {" · "}
            {manual ? "set by hand" : `${remaining} day${remaining === 1 ? "" : "s"} remaining`}
          </span>
        </span>
        <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {manual && (
            <button type="button" disabled={busy} onClick={() => void followCalendar()} style={ghostBtn}>
              Follow the calendar
            </button>
          )}
          {nextPhase && (
            <button type="button" disabled={busy} onClick={() => setConfirming(nextPhase)} style={ghostBtn}>
              Advance to Phase {nextPhase}
            </button>
          )}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, margin: "14px 0 4px" }}>
        {LAUNCH_PHASES.map((p) => {
          const on = p.n === current;
          const past = p.n < current;
          return (
            <div key={p.n} style={{ minWidth: 0 }}>
              <div
                style={{
                  height: 6,
                  borderRadius: 999,
                  background: on ? PINK : past ? TINT.pink : LINE,
                }}
              />
              <span style={{ display: "block", marginTop: 6, fontSize: 12, fontWeight: 800, color: on ? NAVY : MUTED, overflowWrap: "anywhere", fontFamily: font }}>
                Phase {p.n}
              </span>
              <span style={{ display: "block", fontSize: 11, color: MUTED, overflowWrap: "anywhere", fontFamily: font }}>
                {p.label} · {p.days}
              </span>
            </div>
          );
        })}
      </div>

      {confirming !== null && (
        <div style={noticeBox}>
          <p style={{ margin: 0, fontSize: 13, color: NAVY, fontFamily: font }}>
            Advance to Phase {confirming}? This will update your landing page and content tone.
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button type="button" style={solidBtn} disabled={busy} onClick={() => void advance(confirming)}>
              Yes, advance
            </button>
            <button type="button" style={ghostBtn} onClick={() => setConfirming(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {offer !== null && (
        <div style={noticeBox}>
          <p style={{ margin: 0, fontSize: 13, color: NAVY, fontFamily: font }}>
            Write the posts and emails for Phase {offer}? Your existing content stays as it is.
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" style={solidBtn} disabled={genState === "working"} onClick={() => void generate(offer)}>
              {genState === "working" ? "Writing…" : `Write Phase ${offer} content`}
            </button>
            <button type="button" style={ghostBtn} onClick={() => setOffer(null)}>
              Not now
            </button>
            {genMessage && (
              <span style={{ fontSize: 12.5, color: genState === "error" ? "#C0334B" : TINT.greenInk, fontFamily: font }}>{genMessage}</span>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
        <label style={{ fontSize: 12.5, fontWeight: 700, color: MUTED, fontFamily: font }}>
          Checkout or booking link (used by the Phase 3 button)
          <input
            style={inputStyle}
            value={checkout}
            placeholder="https://…"
            onChange={(e) => setCheckout(e.target.value)}
          />
        </label>
        <label style={{ fontSize: 12.5, fontWeight: 700, color: MUTED, fontFamily: font }}>
          Cart closes (used by the Phase 4 countdown)
          <input
            style={inputStyle}
            type="datetime-local"
            value={closes}
            onChange={(e) => setCloses(e.target.value)}
          />
        </label>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" style={solidBtn} disabled={settingsState === "saving"} onClick={() => void saveSettings()}>
            {settingsState === "saving" ? "Saving…" : "Save launch settings"}
          </button>
          {settingsState === "saved" && <span style={{ fontSize: 12.5, color: TINT.greenInk, fontFamily: font }}>Saved</span>}
          {settingsState === "error" && <span style={{ fontSize: 12.5, color: "#C0334B", fontFamily: font }}>{settingsMessage}</span>}
        </div>
      </div>
    </div>
  );
}

const ghostBtn: React.CSSProperties = {
  border: `1px solid ${LINE}`,
  background: "#FFFFFF",
  color: INDIGO,
  borderRadius: 999,
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: font,
};

const solidBtn: React.CSSProperties = {
  border: "none",
  background: PINK,
  color: "#FFFFFF",
  borderRadius: 999,
  padding: "7px 13px",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: font,
};

const noticeBox: React.CSSProperties = {
  marginTop: 12,
  borderRadius: 12,
  border: `1px solid ${TINT.pink}`,
  background: TINT.pink,
  padding: 12,
};

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  marginTop: 5,
  borderRadius: 10,
  border: `1px solid ${LINE}`,
  background: "#FFFFFF",
  color: NAVY,
  fontSize: 13.5,
  padding: "9px 11px",
  fontFamily: font,
};

