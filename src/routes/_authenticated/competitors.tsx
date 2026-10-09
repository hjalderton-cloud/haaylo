import { AppShell } from "@/components/AppShell";
import { HubTabs } from "@/components/HubTabs";
import { CompetitorWatchPanel } from "@/components/CompetitorWatchPanel";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  scanCompetitor,
  listCompetitorScans,
  saveAngleToBank,
  type CompetitorScan,
  type CompetitorPlatform,
} from "@/lib/competitors.functions";
import { useActiveProject } from "@/hooks/useActiveProject";
import { BG, SURFACE, NAVY as THEME_NAVY, PINK as THEME_PINK, LINE as THEME_LINE, TINT, font } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/competitors")({
  head: () => ({
    meta: [
      { title: "Competitor Scan — haaylo.com" },
      { name: "description", content: "Point Haaylo at any competitor and surface the content gaps you can own." },
      { property: "og:title", content: "Competitor Scan — haaylo.com" },
      { property: "og:description", content: "See what competitors post and where your gaps are." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CompetitorsPage,
});

const NAVY = BG;
const INK = THEME_NAVY;
const PINK = THEME_PINK;
const LINE = `1px solid ${THEME_LINE}`;

const CARD: React.CSSProperties = {
  background: SURFACE,
  border: LINE,
  borderRadius: 16,
  padding: 18,
};

const PLATFORM_OPTIONS: { id: CompetitorPlatform; label: string }[] = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "all", label: "All platforms" },
];

const cardHeading: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: ".08em",
  color: PINK,
  textTransform: "uppercase",
  margin: "0 0 10px",
};

function primaryBtn(disabled = false): React.CSSProperties {
  return {
    padding: "12px 20px",
    borderRadius: 999,
    border: "none",
    background: PINK,
    color: "#fff",
    fontWeight: 800,
    fontSize: 14,
    fontFamily: "inherit",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

const ghostBtn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 999,
  border: `1px solid ${THEME_LINE}`,
  background: "transparent",
  color: INK,
  fontWeight: 700,
  fontSize: 13,
  fontFamily: "inherit",
  cursor: "pointer",
};

function errText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/unauthor/i.test(msg)) return "Sign in again, then run the scan.";
  return msg.length > 180 ? "The scan didn't finish. Try again in a moment." : msg;
}

function CompetitorsPage() {
  const navigate = useNavigate();
  const activeProjectId = useActiveProject();
  const scanFn = useServerFn(scanCompetitor);
  const listFn = useServerFn(listCompetitorScans);
  const saveFn = useServerFn(saveAngleToBank);

  const [competitor, setCompetitor] = useState("");
  const [platform, setPlatform] = useState<CompetitorPlatform>("all");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CompetitorScan | null>(null);
  const [history, setHistory] = useState<CompetitorScan[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const rows = await listFn({ data: activeProjectId ? { projectId: activeProjectId } : {} });
      setHistory(rows);
    } catch {
      setHistory([]);
    }
  }, [listFn, activeProjectId]);

  useEffect(() => {
    setResult(null);
    void loadHistory();
  }, [loadHistory]);

  async function runScan() {
    const value = competitor.trim();
    if (value.length < 2) {
      toast.error("Add a competitor name or website first.");
      return;
    }
    setBusy(true);
    try {
      const scan = await scanFn({
        data: { competitor: value, platform, ...(activeProjectId ? { projectId: activeProjectId } : {}) },
      });
      setResult(scan);
      void loadHistory();
      if (!scan.results.siteRead) {
        toast.message("Their site couldn't be read, so this is based on the name and your own brand.");
      }
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function useAngle(title: string, body: string) {
    if (!result) return;
    try {
      await saveFn({
        data: {
          scanId: result.id,
          competitor: result.competitor_name,
          title,
          body,
          ...(activeProjectId ? { projectId: activeProjectId } : {}),
        },
      });
      toast.success("Saved to your Content Bank.");
    } catch (e) {
      toast.error(errText(e));
    }
  }

  function writePost(brief: string) {
    try {
      sessionStorage.setItem("haaylo:post-topic", brief);
    } catch {
      /* ignore */
    }
    void navigate({ to: "/engine", hash: "m=content&t=post" });
  }

  const r = result?.results;

  return (
    <AppShell title="Competitor Radar" flush>
    <div style={{ minHeight: "100vh", background: BG, color: INK, fontFamily: font }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 20px 80px" }}>
        <HubTabs />
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Competitor Scan</h1>
        <p style={{ margin: "6px 0 24px", fontSize: 14, opacity: 0.7 }}>
          Point Haaylo at any competitor and surface the content gaps you can own.
        </p>

        <div style={{ ...CARD, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          <label style={{ flex: "1 1 320px", minWidth: 240 }}>
            <span style={{ display: "block", fontSize: 12, fontWeight: 700, opacity: 0.75, marginBottom: 6 }}>
              Competitor name or website URL
            </span>
            <input
              value={competitor}
              onChange={(e) => setCompetitor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) void runScan();
              }}
              placeholder="e.g. competitor.com or Brand Name"
              style={{
                width: "100%",
                padding: "11px 14px",
                borderRadius: 12,
                border: LINE,
                background: "#FFFFFF",
                color: INK,
                fontSize: 14,
                fontFamily: "inherit",
              }}
            />
          </label>

          <label style={{ flex: "0 1 220px", minWidth: 180 }}>
            <span style={{ display: "block", fontSize: 12, fontWeight: 700, opacity: 0.75, marginBottom: 6 }}>
              Their primary platform
            </span>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as CompetitorPlatform)}
              style={{
                width: "100%",
                padding: "11px 14px",
                borderRadius: 12,
                border: LINE,
                background: "#FFFFFF",
                color: INK,
                fontSize: 14,
                fontFamily: "inherit",
              }}
            >
              {PLATFORM_OPTIONS.map((p) => (
                <option key={p.id} value={p.id} style={{ background: "#FFFFFF" }}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <button type="button" onClick={() => void runScan()} disabled={busy} style={primaryBtn(busy)}>
            {busy ? "Scanning…" : "Scan competitor"}
          </button>
        </div>

        {history.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <button type="button" onClick={() => setHistoryOpen((v) => !v)} style={ghostBtn}>
              {historyOpen ? "Hide previous scans" : `Previous scans (${history.length})`}
            </button>
            {historyOpen && (
              <div style={{ ...CARD, marginTop: 10, padding: 10 }}>
                {history.map((h) => (
                  <div
                    key={h.id}
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 10,
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 8px",
                      borderBottom: `1px solid ${THEME_LINE}`,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{h.competitor_name}</div>
                      <div style={{ fontSize: 12, opacity: 0.6 }}>
                        {new Date(h.created_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setResult(h);
                        setCompetitor(h.competitor_url || h.competitor_name);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      style={ghostBtn}
                    >
                      View results
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <CompetitorWatchPanel
          projectId={activeProjectId ?? null}
          candidate={
            result?.competitor_url
              ? { name: result.competitor_name, url: result.competitor_url, platform: result.platform }
              : null
          }
        />

        {busy && (
          <p style={{ marginTop: 24, fontSize: 14, opacity: 0.7 }}>
            Reading what they publish and comparing it with your Strategy Profile. Usually about 20 seconds.
          </p>
        )}

        {r && !busy && (
          <div style={{ marginTop: 26, display: "grid", gap: 16 }}>
            <div style={{ fontSize: 13, opacity: 0.65 }}>
              Scan of <strong style={{ color: INK }}>{result?.competitor_name}</strong>
              {r.siteRead ? " — read from their website" : " — their site couldn't be read, so this is name-based"}
              {r.pillarsInvented ? ". Pillars suggested from your Brand DNA." : ""}
            </div>

            <section style={CARD}>
              <h2 style={cardHeading}>Topics they're missing</h2>
              <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
                {r.topics.map((t, i) => (
                  <li key={i} style={{ fontSize: 14, lineHeight: 1.55 }}>
                    <span>{t}</span>{" "}
                    <button
                      type="button"
                      onClick={() => void useAngle(t, `Topic gap spotted against ${result?.competitor_name}:\n\n${t}`)}
                      style={{ ...ghostBtn, padding: "3px 10px", fontSize: 12 }}
                    >
                      Use this angle
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section style={CARD}>
              <h2 style={cardHeading}>Content gaps by pillar</h2>
              <div style={{ display: "grid", gap: 10 }}>
                {r.pillarGaps.map((g, i) => (
                  <div
                    key={i}
                    style={{
                      border: LINE,
                      borderRadius: 12,
                      padding: 12,
                      background: g.pillar === r.strongestPillar ? "rgba(255,61,138,0.10)" : "transparent",
                    }}
                  >
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <strong style={{ fontSize: 14 }}>{g.pillar}</strong>
                      <span style={{ fontSize: 11, opacity: 0.65, textTransform: "capitalize" }}>
                        {g.strength} white space
                      </span>
                    </div>
                    <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.55, opacity: 0.85 }}>{g.gap}</p>
                  </div>
                ))}
              </div>
              {r.strongestPillar && (
                <p style={{ margin: "12px 0 0", fontSize: 13, opacity: 0.75 }}>
                  Widest opening: <strong>{r.strongestPillar}</strong>
                </p>
              )}
              {r.strongestPillar && (
                <button
                  type="button"
                  onClick={() =>
                    void useAngle(
                      `${r.strongestPillar} — open ground`,
                      r.pillarGaps.find((g) => g.pillar === r.strongestPillar)?.gap || "",
                    )
                  }
                  style={{ ...ghostBtn, marginTop: 10 }}
                >
                  Use this angle
                </button>
              )}
            </section>

            <section style={CARD}>
              <h2 style={cardHeading}>Tone &amp; positioning gap</h2>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{r.tone}</p>
              <button
                type="button"
                onClick={() => void useAngle(`Positioning against ${result?.competitor_name}`, r.tone)}
                style={{ ...ghostBtn, marginTop: 12 }}
              >
                Use this angle
              </button>
            </section>

            <section style={CARD}>
              <h2 style={cardHeading}>Recommended content angles</h2>
              <div style={{ display: "grid", gap: 12 }}>
                {r.angles.map((a, i) => (
                  <div key={i} style={{ border: LINE, borderRadius: 12, padding: 12 }}>
                    <strong style={{ fontSize: 14 }}>{a.title}</strong>
                    <p style={{ margin: "6px 0 10px", fontSize: 14, lineHeight: 1.55, opacity: 0.85 }}>{a.brief}</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => writePost(`${a.title}\n\n${a.brief}`)}
                        style={{ ...ghostBtn, borderColor: PINK, color: PINK }}
                      >
                        Create post from this angle
                      </button>
                      <button type="button" onClick={() => void useAngle(a.title, a.brief)} style={ghostBtn}>
                        Use this angle
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
    </AppShell>
  );
}
