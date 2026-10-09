import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { readActiveProjectId } from "@/hooks/useActiveProject";
import { AppShell, CARD } from "@/components/AppShell";
import { listHistory, getHistoryItem, listProjects } from "@/lib/brain.functions";
import { SURFACE, NAVY, PURPLE, GREY, LINE, font } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "History — haaylo.com" }] }),
  component: HistoryPage,
});

type Row = { id: string; module: string; title: string | null; created_at: string };
type Item = { id: string; module: string; title: string | null; output: string | null; created_at: string };

const MODULES = [
  { v: "", label: "All modules" },
  { v: "brand_voice", label: "Brand Voice" },
  { v: "strategy", label: "Strategy" },
  { v: "content", label: "Content" },
  { v: "funnel", label: "Funnel" },
  { v: "analytics", label: "Analytics" },
  { v: "director", label: "Director" },
];

function HistoryPage() {
  const listFn = useServerFn(listHistory);
  const getFn = useServerFn(getHistoryItem);
  const projectsFn = useServerFn(listProjects);

  const [projects, setProjects] = useState<Array<{ id: string; name: string; is_default: boolean }>>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [moduleFilter, setModuleFilter] = useState<string>("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Item | null>(null);

  async function refresh(pid?: string, query?: string, mod?: string) {
    const r = await listFn({
      data: {
        projectId: pid ?? projectId ?? undefined,
        q: query !== undefined ? (query || undefined) : (q || undefined),
        module: (mod !== undefined ? mod : moduleFilter) || undefined,
      },
    });
    setRows(r as Row[]);
  }

  useEffect(() => {
    (async () => {
      const ps = await projectsFn();
      setProjects(ps);
      const active = readActiveProjectId();
      const def = ps.find((p) => p.id === active) ?? ps.find((p) => p.is_default) ?? ps[0];
      if (def) { setProjectId(def.id); await refresh(def.id); }
    })();
  }, []);

  async function open(id: string) {
    const it = await getFn({ data: { id } });
    setSelected(it as Item);
  }

  return (
    <AppShell title="Marketing History">
      <div style={{ ...CARD, marginBottom: 12, display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={projectId ?? ""} onChange={(e) => { setProjectId(e.target.value); refresh(e.target.value); }} style={inputStyle}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={moduleFilter} onChange={(e) => { setModuleFilter(e.target.value); refresh(undefined, undefined, e.target.value); }} style={inputStyle}>
            {MODULES.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
          </select>
        </div>
        <input
          placeholder="Search prompt or output…"
          value={q}
          onChange={(e) => { setQ(e.target.value); refresh(undefined, e.target.value); }}
          style={{ ...inputStyle, width: "100%" }}
        />
      </div>

      {rows.length === 0 ? (
        <p style={{ color: GREY }}>Nothing matches. Use the Engine or Planner — generations save here automatically.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {rows.map((r) => (
            <button key={r.id} onClick={() => open(r.id)} style={{ ...CARD, textAlign: "left", cursor: "pointer", color: NAVY }}>
              <div style={{ fontSize: 11, color: PURPLE, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" }}>{r.module}</div>
              <div style={{ fontWeight: 700, marginTop: 4 }}>{r.title || "(untitled)"}</div>
              <div style={{ color: GREY, fontSize: 11, marginTop: 4 }}>{new Date(r.created_at).toLocaleString()}</div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div onClick={() => setSelected(null)} style={{ position: "fixed", inset: 0, background: "rgba(23,29,65,.45)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...CARD, maxWidth: 720, width: "100%", maxHeight: "80vh", overflow: "auto" }}>
            <div style={{ fontSize: 11, color: PURPLE, fontWeight: 700, textTransform: "uppercase" }}>{selected.module}</div>
            <h2 style={{ fontFamily: font, margin: "4px 0 12px" }}>{selected.title || "(untitled)"}</h2>
            <pre style={{ whiteSpace: "pre-wrap", color: NAVY, fontFamily: font, fontSize: 13, lineHeight: 1.5 }}>{selected.output || ""}</pre>
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              {selected.module === "content" && selected.output && (
                <a href={`/scheduler?caption=${encodeURIComponent(selected.output.slice(0, 2800))}`} style={cta}>Schedule this →</a>
              )}
              <button onClick={() => setSelected(null)} style={{ ...cta, background: "transparent", color: PURPLE, border: `1px solid ${LINE}` }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

const inputStyle: React.CSSProperties = {
  background: SURFACE,
  border: `1px solid ${LINE}`,
  color: NAVY,
  borderRadius: 10,
  padding: "10px 12px",
  fontFamily: font,
  fontSize: 14,
};
const cta: React.CSSProperties = {
  background: `linear-gradient(135deg, ${PURPLE}, #3A6FD6)`,
  color: "#fff",
  border: "none",
  padding: "10px 16px",
  borderRadius: 10,
  fontWeight: 800,
  textDecoration: "none",
  cursor: "pointer",
};
