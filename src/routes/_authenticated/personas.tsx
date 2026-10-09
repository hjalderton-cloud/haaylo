import { AppShell } from "@/components/AppShell";
import { HubTabs } from "@/components/HubTabs";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  generatePersona,
  listPersonas,
  savePersona,
  deletePersona,
  MAX_PERSONAS,
  type PersonaData,
  type PersonaRecord,
} from "@/lib/personas.functions";
import { useActiveProject } from "@/hooks/useActiveProject";
import { NAVY, SURFACE, PINK, LINE, font } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/personas")({
  head: () => ({
    meta: [
      { title: "Persona Builder — haaylo.com" },
      {
        name: "description",
        content: "Build a detailed buyer persona from your Strategy Profile audience data.",
      },
      { property: "og:title", content: "Persona Builder — haaylo.com" },
      { property: "og:description", content: "Build the audience personas your content is written for." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PersonasPage,
});

const INK = NAVY;
const LINE_STY = `1px solid ${LINE}`;

const CARD: React.CSSProperties = {
  background: SURFACE,
  border: LINE_STY,
  borderRadius: 18,
  padding: 20,
};

const label: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: ".08em",
  color: PINK,
  textTransform: "uppercase",
  margin: "0 0 8px",
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
  padding: "9px 16px",
  borderRadius: 999,
  border: `1px solid ${LINE}`,
  background: "transparent",
  color: INK,
  fontWeight: 700,
  fontSize: 13,
  fontFamily: "inherit",
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: LINE_STY,
  background: "#FFFFFF",
  color: INK,
  fontSize: 14,
  fontFamily: "inherit",
};

const EMPTY: PersonaData = {
  personaName: "",
  ageRange: "",
  role: "",
  industry: "",
  goals: ["", "", ""],
  painPoints: ["", "", ""],
  contentEngagement: "",
  platforms: [],
  quote: "",
};

const PLATFORM_CHOICES = ["LinkedIn", "Instagram", "Facebook", "YouTube", "Podcasts"];

function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z ]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

function hueFor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

function Avatar({ name, size = 76 }: { name: string; size?: number }) {
  const hue = hueFor(name || "persona");
  const bg = `hsl(${hue} 70% 62%)`;
  const bg2 = `hsl(${(hue + 40) % 360} 70% 48%)`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`Illustrated avatar for ${name}`}>
      <defs>
        <linearGradient id={`g${hue}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={bg} />
          <stop offset="100%" stopColor={bg2} />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill={`url(#g${hue})`} />
      <circle cx="50" cy="38" r="16" fill="rgba(255,255,255,0.92)" />
      <path d="M18 88c4-18 16-27 32-27s28 9 32 27z" fill="rgba(255,255,255,0.92)" />
      <text
        x="50"
        y="44"
        textAnchor="middle"
        fontSize="15"
        fontWeight="800"
        fill={NAVY}
        fontFamily={font}
      >
        {initials(name)}
      </text>
    </svg>
  );
}

function errText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/unauthor/i.test(msg)) return "Sign in again, then try that.";
  return msg.length > 180 ? "That didn't work. Try again in a moment." : msg;
}

function PersonasPage() {
  const activeProjectId = useActiveProject();
  const genFn = useServerFn(generatePersona);
  const listFn = useServerFn(listPersonas);
  const saveFn = useServerFn(savePersona);
  const deleteFn = useServerFn(deletePersona);

  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [persona, setPersona] = useState<PersonaData | null>(null);
  const [editing, setEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saved, setSaved] = useState<PersonaRecord[]>([]);

  const load = useCallback(async () => {
    try {
      const rows = await listFn({ data: activeProjectId ? { projectId: activeProjectId } : {} });
      setSaved(rows);
    } catch {
      setSaved([]);
    }
  }, [listFn, activeProjectId]);

  useEffect(() => {
    setPersona(null);
    setEditing(false);
    setEditingId(null);
    void load();
  }, [load]);

  async function generate() {
    setBusy(true);
    try {
      const p = await genFn({
        data: {
          ...(activeProjectId ? { projectId: activeProjectId } : {}),
          avoid: saved.map((s) => s.data.personaName).filter(Boolean),
        },
      });
      setPersona(p);
      setEditing(false);
      setEditingId(null);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!persona) return;
    if (!persona.personaName.trim()) {
      toast.error("Give the persona a name first.");
      return;
    }
    setSaving(true);
    try {
      const row = await saveFn({
        data: {
          ...(editingId ? { id: editingId } : {}),
          ...(activeProjectId ? { projectId: activeProjectId } : {}),
          persona,
        },
      });
      setEditingId(row.id);
      setEditing(false);
      toast.success(editingId ? "Persona updated." : "Persona saved.");
      void load();
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await deleteFn({ data: { id } });
      if (editingId === id) {
        setEditingId(null);
        setPersona(null);
      }
      toast.success("Persona deleted.");
      void load();
    } catch (e) {
      toast.error(errText(e));
    }
  }

  function edit(row: PersonaRecord) {
    setPersona(row.data);
    setEditingId(row.id);
    setEditing(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function patch(next: Partial<PersonaData>) {
    setPersona((p) => (p ? { ...p, ...next } : p));
  }

  function patchList(key: "goals" | "painPoints", index: number, value: string) {
    setPersona((p) => {
      if (!p) return p;
      const list = [...p[key]];
      list[index] = value;
      return { ...p, [key]: list };
    });
  }

  const atLimit = saved.length >= MAX_PERSONAS && !editingId;

  return (
    <AppShell title="Persona Builder" flush>
    <div style={{ minHeight: "100vh", background: "#FAFAFC", color: INK, fontFamily: font }}>
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "28px 20px 80px" }}>
        <HubTabs />
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Persona Builder</h1>
        <p style={{ margin: "6px 0 22px", fontSize: 14, opacity: 0.7, maxWidth: 720 }}>
          Build a detailed buyer persona from your Strategy Profile audience data — then use it to sharpen every piece
          of content.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <button type="button" onClick={() => void generate()} disabled={busy} style={primaryBtn(busy)}>
            {busy ? "Building…" : "Generate persona from my Strategy Profile"}
          </button>
          {persona && !busy && (
            <button
              type="button"
              onClick={() => {
                setPersona({ ...EMPTY });
                setEditing(true);
                setEditingId(null);
              }}
              style={ghostBtn}
            >
              Start a blank persona
            </button>
          )}
        </div>

        {busy && (
          <div style={{ ...CARD, marginTop: 20, display: "flex", gap: 12, alignItems: "center" }}>
            <span
              aria-hidden
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                border: `2px solid ${LINE}`,
                borderTopColor: PINK,
                animation: "haaylo-spin 0.8s linear infinite",
                display: "inline-block",
              }}
            />
            <span style={{ fontSize: 14, opacity: 0.8 }}>
              Building your persona from your audience data… usually about 20 seconds
            </span>
            <style>{"@keyframes haaylo-spin{to{transform:rotate(360deg)}}"}</style>
          </div>
        )}

        {persona && !busy && (
          <div style={{ ...CARD, marginTop: 20 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
              <Avatar name={persona.personaName || "Persona"} />
              <div style={{ flex: "1 1 240px", minWidth: 200 }}>
                {editing ? (
                  <input
                    value={persona.personaName}
                    onChange={(e) => patch({ personaName: e.target.value })}
                    placeholder="e.g. Marketing Manager Maya"
                    style={{ ...inputStyle, fontSize: 18, fontWeight: 800 }}
                  />
                ) : (
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{persona.personaName}</h2>
                )}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    marginTop: 10,
                    fontSize: 13,
                    opacity: 0.85,
                  }}
                >
                  {editing ? (
                    <>
                      <input
                        value={persona.ageRange}
                        onChange={(e) => patch({ ageRange: e.target.value })}
                        placeholder="Age range"
                        style={{ ...inputStyle, width: 140 }}
                      />
                      <input
                        value={persona.role}
                        onChange={(e) => patch({ role: e.target.value })}
                        placeholder="Job title / role"
                        style={{ ...inputStyle, width: 200 }}
                      />
                      <input
                        value={persona.industry}
                        onChange={(e) => patch({ industry: e.target.value })}
                        placeholder="Industry"
                        style={{ ...inputStyle, width: 180 }}
                      />
                    </>
                  ) : (
                    [persona.ageRange, persona.role, persona.industry]
                      .filter(Boolean)
                      .map((v, i) => (
                        <span
                          key={i}
                          style={{
                            padding: "5px 12px",
                            borderRadius: 999,
                            border: LINE_STY,
                            background: "#FFFFFF",
                          }}
                        >
                          {v}
                        </span>
                      ))
                  )}
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 18,
                marginTop: 22,
              }}
            >
              <div>
                <p style={label}>Goals</p>
                {editing ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {[0, 1, 2].map((i) => (
                      <input
                        key={i}
                        value={persona.goals[i] ?? ""}
                        onChange={(e) => patchList("goals", i, e.target.value)}
                        placeholder={`Goal ${i + 1}`}
                        style={inputStyle}
                      />
                    ))}
                  </div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                    {persona.goals.filter(Boolean).map((g, i) => (
                      <li key={i} style={{ fontSize: 14, lineHeight: 1.55 }}>
                        {g}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <p style={label}>Pain points</p>
                {editing ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {[0, 1, 2].map((i) => (
                      <input
                        key={i}
                        value={persona.painPoints[i] ?? ""}
                        onChange={(e) => patchList("painPoints", i, e.target.value)}
                        placeholder={`Pain point ${i + 1}`}
                        style={inputStyle}
                      />
                    ))}
                  </div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                    {persona.painPoints.filter(Boolean).map((p, i) => (
                      <li key={i} style={{ fontSize: 14, lineHeight: 1.55 }}>
                        {p}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              <p style={label}>Content they engage with</p>
              {editing ? (
                <textarea
                  value={persona.contentEngagement}
                  onChange={(e) => patch({ contentEngagement: e.target.value })}
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              ) : (
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, opacity: 0.9 }}>{persona.contentEngagement}</p>
              )}
            </div>

            <div style={{ marginTop: 20 }}>
              <p style={label}>Where they spend time online</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {(editing ? PLATFORM_CHOICES : persona.platforms).map((p) => {
                  const on = persona.platforms.some((x) => x.toLowerCase() === p.toLowerCase());
                  return (
                    <button
                      key={p}
                      type="button"
                      disabled={!editing}
                      onClick={() =>
                        patch({
                          platforms: on
                            ? persona.platforms.filter((x) => x.toLowerCase() !== p.toLowerCase())
                            : [...persona.platforms, p],
                        })
                      }
                      style={{
                        padding: "7px 14px",
                        borderRadius: 999,
                        fontSize: 13,
                        fontWeight: 700,
                        fontFamily: "inherit",
                        cursor: editing ? "pointer" : "default",
                        background: on ? "#FDEAF1" : "#FFFFFF",
                        color: on ? PINK : INK,
                        border: on ? `1px solid ${PINK}` : `1px solid ${LINE}`,
                      }}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              <p style={label}>In their words</p>
              {editing ? (
                <input value={persona.quote} onChange={(e) => patch({ quote: e.target.value })} style={inputStyle} />
              ) : (
                persona.quote && (
                  <blockquote
                    style={{
                      margin: 0,
                      padding: "12px 16px",
                      borderLeft: `3px solid ${PINK}`,
                      background: "#FDEAF1",
                      borderRadius: 10,
                      fontSize: 15,
                      fontStyle: "italic",
                      lineHeight: 1.55,
                    }}
                  >
                    “{persona.quote}”
                  </blockquote>
                )
              )}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 22 }}>
              <button type="button" onClick={() => void save()} disabled={saving || atLimit} style={primaryBtn(saving || atLimit)}>
                {saving ? "Saving…" : editingId ? "Save changes" : "Save persona"}
              </button>
              <button type="button" onClick={() => setEditing((v) => !v)} style={ghostBtn}>
                {editing ? "Done editing" : "Edit manually"}
              </button>
              <button
                type="button"
                onClick={() => void generate()}
                style={{ ...ghostBtn, border: "none", textDecoration: "underline", padding: "9px 4px" }}
              >
                Regenerate
              </button>
              {atLimit && (
                <span style={{ fontSize: 13, opacity: 0.7 }}>
                  You can keep {MAX_PERSONAS} personas per client. Delete one to save this.
                </span>
              )}
            </div>
          </div>
        )}

        <div style={{ marginTop: 34 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}>Saved personas</h2>
          <p style={{ margin: "0 0 14px", fontSize: 13, opacity: 0.65 }}>
            {saved.length} of {MAX_PERSONAS} for this client.
          </p>
          {saved.length === 0 ? (
            <div style={{ ...CARD, fontSize: 14, opacity: 0.75 }}>
              Nothing saved yet. Generate one above and press Save persona.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 14 }}>
              {saved.map((row) => (
                <div key={row.id} style={{ ...CARD, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <Avatar name={row.data.personaName} size={44} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>{row.data.personaName}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>{row.data.role}</div>
                    </div>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 16, display: "grid", gap: 4, flex: 1 }}>
                    {row.data.painPoints.filter(Boolean).slice(0, 2).map((p, i) => (
                      <li key={i} style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.85 }}>
                        {p}
                      </li>
                    ))}
                  </ul>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" onClick={() => edit(row)} style={{ ...ghostBtn, padding: "6px 12px" }}>
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(row.id)}
                      style={{ ...ghostBtn, padding: "6px 12px", opacity: 0.75 }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
    </AppShell>
  );
}
