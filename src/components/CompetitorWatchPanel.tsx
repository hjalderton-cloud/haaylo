import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listWatches,
  listSignals,
  runWatchCheck,
  setWatch,
  dismissSignal,
  saveSignalToBank,
  type CompetitorWatch,
  type CompetitorSignal,
} from "@/lib/competitor-watch.functions";
import { SURFACE, NAVY, PINK, PURPLE, LINE, font } from "@/lib/theme";

const CARD: React.CSSProperties = {
  background: SURFACE,
  border: `1px solid ${LINE}`,
  borderRadius: 16,
  padding: 18,
  fontFamily: font,
  color: NAVY,
};

const heading: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: ".08em",
  color: PINK,
  textTransform: "uppercase",
  margin: "0 0 10px",
};

const ghost: React.CSSProperties = {
  padding: "7px 13px",
  borderRadius: 999,
  border: `1px solid ${LINE}`,
  background: "transparent",
  color: NAVY,
  fontWeight: 700,
  fontSize: 12.5,
  fontFamily: "inherit",
  cursor: "pointer",
};

const solid: React.CSSProperties = {
  ...ghost,
  border: "none",
  background: PURPLE,
  color: "#fff",
};

function when(value: string | null): string {
  if (!value) return "not checked yet";
  const d = new Date(value);
  return `checked ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

export function CompetitorWatchPanel({
  projectId,
  candidate,
}: {
  projectId: string | null;
  candidate?: { name: string; url: string | null; platform: string } | null;
}) {
  const listWatchesFn = useServerFn(listWatches);
  const listSignalsFn = useServerFn(listSignals);
  const checkFn = useServerFn(runWatchCheck);
  const setWatchFn = useServerFn(setWatch);
  const dismissFn = useServerFn(dismissSignal);
  const saveFn = useServerFn(saveSignalToBank);

  const [watches, setWatches] = useState<CompetitorWatch[]>([]);
  const [signals, setSignals] = useState<CompetitorSignal[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    try {
      const [w, s] = await Promise.all([
        listWatchesFn({ data: { projectId } }),
        listSignalsFn({ data: { projectId, limit: 10 } }),
      ]);
      setWatches(w);
      setSignals(s);
    } catch {
      /* quiet — the panel is a side surface */
    }
  }, [projectId, listWatchesFn, listSignalsFn]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Weekly check: once per session, only for watches that are a week stale.
  useEffect(() => {
    if (!projectId) return;
    const key = `haaylo:watch-swept:${projectId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
    void (async () => {
      try {
        const res = await checkFn({ data: { projectId, staleOnly: true } });
        if (res.checked > 0) await refresh();
      } catch {
        /* quiet */
      }
    })();
  }, [projectId, checkFn, refresh]);

  const watchedUrls = new Set(watches.map((w) => w.competitor_url.replace(/^https?:\/\//i, "").replace(/\/+$/, "")));
  const candidateKey = candidate?.url ? candidate.url.replace(/^https?:\/\//i, "").replace(/\/+$/, "") : null;
  const candidateWatched = candidateKey ? watchedUrls.has(candidateKey) : false;

  async function toggleCandidate() {
    if (!projectId || !candidate?.url) return;
    setBusy(true);
    try {
      await setWatchFn({
        data: {
          projectId,
          competitorName: candidate.name,
          competitorUrl: candidate.url,
          platform: candidate.platform || "all",
          enabled: !candidateWatched,
        },
      });
      toast.success(candidateWatched ? "Stopped watching them." : "Watching them weekly now.");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  async function checkNow(watchId?: string) {
    if (!projectId) return;
    setBusy(true);
    try {
      const res = await checkFn({ data: { projectId, staleOnly: false, ...(watchId ? { watchId } : {}) } });
      await refresh();
      if (res.signals.length === 0) toast.message("Nothing has moved since the last look.");
      else toast.success(`${res.signals.length} thing${res.signals.length === 1 ? "" : "s"} to respond to.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The check didn't finish.");
    } finally {
      setBusy(false);
    }
  }

  async function stopWatching(w: CompetitorWatch) {
    if (!projectId) return;
    try {
      await setWatchFn({
        data: {
          projectId,
          competitorName: w.competitor_name,
          competitorUrl: w.competitor_url,
          platform: w.platform,
          enabled: false,
        },
      });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't save.");
    }
  }

  async function save(signalId: string) {
    if (!projectId) return;
    try {
      await saveFn({ data: { projectId, signalId } });
      setSignals((s) => s.filter((x) => x.id !== signalId));
      toast.success("Saved to your Content Bank.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't save.");
    }
  }

  async function dismiss(signalId: string) {
    if (!projectId) return;
    setSignals((s) => s.filter((x) => x.id !== signalId));
    try {
      await dismissFn({ data: { projectId, signalId } });
    } catch {
      /* quiet */
    }
  }

  if (!projectId) return null;

  return (
    <div style={{ display: "grid", gap: 16, marginTop: 20 }}>
      <section style={CARD}>
        <h2 style={heading}>Weekly watch</h2>
        <p style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.55 }}>
          Keep an eye on a competitor and Haaylo re-reads their site once a week. If something moves, you get a
          suggested response post here. It writes nothing on its own.
        </p>

        {candidate?.url && (
          <button type="button" onClick={() => void toggleCandidate()} disabled={busy} style={candidateWatched ? ghost : solid}>
            {candidateWatched ? `✓ Watching ${candidate.name}` : `Watch ${candidate.name} weekly`}
          </button>
        )}

        {watches.length === 0 ? (
          <p style={{ margin: "12px 0 0", fontSize: 12.5, opacity: 0.7 }}>
            Nothing watched yet. Scan a competitor by website address, then turn the weekly watch on.
          </p>
        ) : (
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            {watches.map((w) => (
              <div
                key={w.id}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "#FFFFFF",
                  border: `1px solid ${LINE}`,
                  borderRadius: 12,
                  padding: "10px 12px",
                }}
              >
                <div style={{ minWidth: 0, flex: "1 1 200px" }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, overflowWrap: "anywhere" }}>{w.competitor_name}</div>
                  <div style={{ fontSize: 12, opacity: 0.65 }}>{when(w.last_checked_at)}</div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => void checkNow(w.id)} disabled={busy} style={ghost}>
                    {busy ? "Checking…" : "Check now"}
                  </button>
                  <button type="button" onClick={() => void stopWatching(w)} style={ghost}>
                    Stop
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {signals.length > 0 && (
        <section style={CARD}>
          <h2 style={heading}>Competitors have moved</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {signals.map((s) => (
              <div
                key={s.id}
                style={{ background: "#FFFFFF", border: `1px solid ${LINE}`, borderRadius: 12, padding: "12px 14px" }}
              >
                <div style={{ fontSize: 12, fontWeight: 800, color: PURPLE, letterSpacing: ".04em" }}>
                  {s.competitor_name}
                  {s.pillar ? ` · ${s.pillar}` : ""}
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 13.5, lineHeight: 1.55 }}>{s.summary}</p>
                {s.angle_title && (
                  <p style={{ margin: "10px 0 0", fontSize: 13.5, lineHeight: 1.55 }}>
                    <strong>{s.angle_title}</strong>
                    {s.angle_brief ? ` — ${s.angle_brief}` : ""}
                  </p>
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                  {s.angle_title && (
                    <button type="button" onClick={() => void save(s.id)} style={solid}>
                      Save as an idea
                    </button>
                  )}
                  <button type="button" onClick={() => void dismiss(s.id)} style={ghost}>
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function CompetitorSignalsCard({ projectId }: { projectId: string | null }) {
  const listSignalsFn = useServerFn(listSignals);
  const [signals, setSignals] = useState<CompetitorSignal[]>([]);

  useEffect(() => {
    if (!projectId) return;
    let live = true;
    void (async () => {
      try {
        const s = await listSignalsFn({ data: { projectId, limit: 3 } });
        if (live) setSignals(s);
      } catch {
        /* quiet */
      }
    })();
    return () => {
      live = false;
    };
  }, [projectId, listSignalsFn]);

  if (!projectId || signals.length === 0) return null;

  return (
    <section style={{ ...CARD, marginBottom: 16 }}>
      <h2 style={heading}>Competitors have moved</h2>
      <div style={{ display: "grid", gap: 8, fontSize: 13.5, lineHeight: 1.55 }}>
        {signals.map((s) => (
          <div key={s.id}>
            <strong>{s.competitor_name}</strong> — {s.summary}
          </div>
        ))}
        <a href="/competitors" style={{ color: PURPLE, fontWeight: 600, textDecoration: "none", marginTop: 4 }}>
          See the suggested responses
        </a>
      </div>
    </section>
  );
}
