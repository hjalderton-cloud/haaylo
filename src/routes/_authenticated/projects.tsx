import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell, CARD } from "@/components/AppShell";
import { listProjects, createProject, renameProject, setDefaultProject, deleteProject } from "@/lib/brain.functions";
import { SURFACE, NAVY, PURPLE, GREY, LINE, font } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({ meta: [{ title: "Projects — haaylo.com" }] }),
  component: ProjectsPage,
});

type P = { id: string; name: string; is_default: boolean };

function ProjectsPage() {
  const listFn = useServerFn(listProjects);
  const createFn = useServerFn(createProject);
  const renameFn = useServerFn(renameProject);
  const defaultFn = useServerFn(setDefaultProject);
  const deleteFn = useServerFn(deleteProject);

  const [items, setItems] = useState<P[]>([]);
  const [name, setName] = useState("");

  async function refresh() {
    setItems((await listFn()) as P[]);
  }
  useEffect(() => { refresh(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try { await createFn({ data: { name: name.trim() } }); setName(""); await refresh(); toast.success("Workspace created"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <AppShell title="Workspaces">
      <p style={{ color: GREY, marginTop: 0 }}>
        Separate workspace per client or business. Each has its own Brain and Marketing History.
      </p>

      <form onSubmit={add} style={{ ...CARD, marginBottom: 16, display: "flex", gap: 8 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New workspace name"
          style={{ flex: 1, background: SURFACE, border: `1px solid ${LINE}`, color: NAVY, borderRadius: 10, padding: "10px 12px", fontFamily: font, fontSize: 14 }}
        />
        <button type="submit" style={{ background: PURPLE, color: "#fff", border: "none", padding: "10px 16px", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}>
          Add
        </button>
      </form>

      <div style={{ display: "grid", gap: 10 }}>
        {items.map((p) => (
          <div key={p.id} style={{ ...CARD, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <input
              defaultValue={p.name}
              onBlur={async (e) => {
                if (e.target.value !== p.name) {
                  await renameFn({ data: { id: p.id, name: e.target.value } });
                  await refresh();
                }
              }}
              style={{ background: "transparent", color: NAVY, border: "none", fontWeight: 700, fontSize: 16, flex: 1, minWidth: 140, fontFamily: font }}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {p.is_default ? (
                <span style={{ fontSize: 11, color: "#FACC15", fontWeight: 700, letterSpacing: ".05em" }}>DEFAULT</span>
              ) : (
                <button onClick={async () => { await defaultFn({ data: { id: p.id } }); await refresh(); }} style={ghost}>
                  Set default
                </button>
              )}
              {!p.is_default && (
                <button
                  onClick={async () => {
                    if (!confirm(`Delete "${p.name}"? Its Brain and history will be removed.`)) return;
                    try { await deleteFn({ data: { id: p.id } }); await refresh(); }
                    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                  }}
                  style={{ ...ghost, color: "#DC2626", borderColor: "rgba(220,38,38,.3)" }}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

const ghost: React.CSSProperties = {
  background: "transparent",
  color: PURPLE,
  border: `1px solid ${LINE}`,
  borderRadius: 8,
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};
