import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { readActiveProjectId } from "@/hooks/useActiveProject";
import { toast } from "sonner";
import { AppShell, CARD } from "@/components/AppShell";
import { PlatformIcon, PLATFORMS, platformKey } from "@/components/PlatformIcon";
import { listBank, updateBankItem, deleteBankItem, duplicateBankItem, refreshBankItemWithBrain } from "@/lib/bank.functions";
import { listBankCollections, saveContentPost } from "@/lib/content.functions";
import { listProjects } from "@/lib/brain.functions";
import { generateBrandImage, uploadGeneratedImageToScheduler } from "@/lib/image.functions";
import { SURFACE, NAVY, INDIGO, PURPLE, PINK, GREY, LINE, TINT, font } from "@/lib/theme";

/** Distinct colour per content pillar, stable across renders. */
const PILLAR_COLOURS = ["#1D4ED8", "#14B8A6", "#F59E0B", "#FB7185", "#64748B", "#84CC16"];
function pillarColour(pillar?: string | null): string {
  const key = (pillar || "").trim().toLowerCase();
  if (!key) return GREY;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PILLAR_COLOURS[h % PILLAR_COLOURS.length]!;
}

type BankStatus = "draft" | "scheduled" | "published";
const STATUSES: Array<{ v: BankStatus; label: string }> = [
  { v: "draft", label: "Draft" },
  { v: "scheduled", label: "Scheduled" },
  { v: "published", label: "Published" },
];
const STATUS_STYLE: Record<BankStatus, { label: string; fg: string; bg: string; border: string }> = {
  draft: { label: "Draft", fg: GREY, bg: SURFACE, border: LINE },
  scheduled: { label: "Scheduled", fg: TINT.blueInk, bg: TINT.blue, border: TINT.blue },
  published: { label: "Published", fg: TINT.purpleInk, bg: TINT.purple, border: TINT.purple },
};


export const Route = createFileRoute("/_authenticated/snippets")({
  head: () => ({
    meta: [
      { title: "Saved Snippets — haaylo.com" },
      { name: "description", content: "Scan, filter and schedule your saved posts, hooks, captions and campaigns in one place." },
    ],
  }),
  component: BankPage,
  validateSearch: (search: Record<string, unknown>): { pillar?: string; status?: string; kind?: string } => ({
    pillar: typeof search.pillar === "string" ? String(search.pillar) : undefined,
    status: typeof search.status === "string" ? String(search.status) : undefined,
    kind: typeof search.kind === "string" ? String(search.kind) : undefined,
  }),
});

type Item = {
  id: string; project_id: string; kind: string;
  title: string | null; body: string | null;
  tags: string[]; collection: string | null;
  is_favourite: boolean; is_archived: boolean;
  meta: Record<string, unknown>;
  created_at: string; updated_at: string;
};

function metaStr(it: Item, key: string): string {
  const v = (it.meta ?? {})[key];
  return typeof v === "string" ? v.trim() : "";
}
function itemPillar(it: Item): string {
  return metaStr(it, "pillar") || (it.tags ?? []).find((t) => t.toLowerCase().startsWith("pillar:"))?.slice(7).trim() || "";
}
function itemPlatform(it: Item): string {
  const raw = metaStr(it, "platform") || (["blog", "email"].includes(it.kind) ? it.kind : "");
  return raw ? platformKey(raw) : "";
}
function itemStatus(it: Item): BankStatus {
  const s = metaStr(it, "status").toLowerCase();
  return s === "scheduled" || s === "published" ? s : "draft";
}



const KINDS = [
  { v: "", label: "All types" },
  { v: "post", label: "Social post" },
  { v: "blog", label: "Blog" },
  { v: "email", label: "Email" },
  { v: "headline", label: "Headline" },
  { v: "hook", label: "Hook" },
  { v: "cta", label: "CTA" },
  { v: "campaign", label: "Campaign" },
  { v: "idea", label: "Idea" },
  { v: "image_prompt", label: "Image prompt" },
  { v: "other", label: "Other" },
];

function BankPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/_authenticated/snippets" });
  const listFn = useServerFn(listBank);
  const updateFn = useServerFn(updateBankItem);
  const deleteFn = useServerFn(deleteBankItem);
  const duplicateFn = useServerFn(duplicateBankItem);
  const projectsFn = useServerFn(listProjects);
  const genImageFn = useServerFn(generateBrandImage);
  const uploadImageFn = useServerFn(uploadGeneratedImageToScheduler);

  const collectionsFn = useServerFn(listBankCollections);
  const refreshBrainFn = useServerFn(refreshBankItemWithBrain);

  const [projects, setProjects] = useState<Array<{ id: string; name: string; is_default: boolean }>>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [collections, setCollections] = useState<string[]>([]);
  const [collection, setCollection] = useState("");
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [kind, setKind] = useState(search.kind ?? "");
  const [q, setQ] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [archived, setArchived] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Item | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [addBusy, setAddBusy] = useState(false);

  // Scan-and-manage filters (client side, real time)
  const [pillarFilter, setPillarFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState(search.status ?? "");

  // Apply a deep-linked pillar filter (e.g. from the 90-Day Plan "View posts").
  useEffect(() => {
    const p = search.pillar;
    if (p) setPillarFilter(p);
  }, [search.pillar]);

  // Scheduling flow
  const scheduleFn = useServerFn(saveContentPost);
  const [sched, setSched] = useState<{ item: Item; date: string; time: string; platform: string } | null>(null);
  const [schedBusy, setSchedBusy] = useState(false);

  const pillarOptions = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) { const p = itemPillar(it); if (p) set.add(p); }
    const deep = search.pillar;
    if (deep && !Array.from(set).some((p) => p.toLowerCase() === deep.toLowerCase())) set.add(deep);
    return Array.from(set).sort();
  }, [items, search.pillar]);

  const visibleItems = useMemo(() => items.filter((it) => {
    if (pillarFilter && itemPillar(it).toLowerCase() !== pillarFilter.toLowerCase()) return false;
    if (platformFilter && itemPlatform(it) !== platformFilter) return false;
    if (statusFilter && itemStatus(it) !== statusFilter) return false;
    return true;
  }), [items, pillarFilter, platformFilter, statusFilter]);

  function openSchedule(it: Item) {
    const now = new Date(Date.now() + 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    setSched({
      item: it,
      date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      time: `${pad(now.getHours())}:00`,
      platform: itemPlatform(it) || "instagram",
    });
  }

  async function confirmSchedule() {
    if (!sched) return;
    const [y, mo, da] = sched.date.split("-").map(Number);
    const [h, mi] = sched.time.split(":").map(Number);
    const when = new Date(y || 2026, (mo || 1) - 1, da || 1, h || 9, mi || 0, 0, 0);
    setSchedBusy(true);
    try {
      await scheduleFn({
        data: {
          project_id: sched.item.project_id || null,
          caption: (sched.item.body ?? "").slice(0, 20000),
          title: sched.item.title || null,
          platform: sched.platform,
          pillar: itemPillar(sched.item) || null,
          status: "scheduled",
          scheduled_at: when.toISOString(),
          hashtags: [],
          meta: { bank_item_id: sched.item.id },
        },
      });
      await updateFn({
        data: {
          id: sched.item.id,
          meta: { ...(sched.item.meta ?? {}), status: "scheduled", platform: sched.platform, scheduled_at: when.toISOString() },
        },
      });
      setSched(null);
      toast.success("Scheduled — it's on your calendar");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not schedule that post");
    } finally { setSchedBusy(false); }
  }



  // Image generator state (per open modal)
  const [imgOpen, setImgOpen] = useState(false);
  const [imgPrompt, setImgPrompt] = useState("");
  const [imgSize, setImgSize] = useState<"1024x1024" | "1024x1536" | "1536x1024">("1024x1024");
  const [imgBusy, setImgBusy] = useState(false);
  const [imgB64, setImgB64] = useState<string | null>(null);
  const [imgApproved, setImgApproved] = useState(false);

  async function refresh(overrides?: Partial<{ projectId: string; kind: string; q: string; favOnly: boolean; archived: boolean; collection: string }>) {
    const p = overrides?.projectId ?? projectId;
    const rows = await listFn({
      data: {
        projectId: p || undefined,
        kind: (overrides?.kind ?? kind) || undefined,
        collection: (overrides?.collection ?? collection) || undefined,
        q: (overrides?.q ?? q) || undefined,
        favourite: overrides?.favOnly ?? favOnly,
        archived: overrides?.archived ?? archived,
      },
    });
    setItems(rows as Item[]);
  }

  useEffect(() => {
    (async () => {
      const ps = await projectsFn();
      setProjects(ps);
      const active = readActiveProjectId();
      const def = ps.find((p) => p.id === active) ?? ps.find((p) => p.is_default) ?? ps[0];
      if (def) { setProjectId(def.id); await refresh({ projectId: def.id, kind: search.kind ?? "" }); }
      else await refresh();
      try { setCollections(await collectionsFn()); } catch { /* optional */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshWithBrain(it: Item) {
    setRefreshBusy(true);
    try {
      const res = await refreshBrainFn({ data: { id: it.id } });
      toast.success("Refreshed with your current Brain — saved as a new item");
      setSelected({ ...it, id: res.id, body: res.body, title: it.title ? `${it.title} (refreshed)` : "Refreshed post" });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not refresh this item");
    } finally { setRefreshBusy(false); }
  }

  function repurpose(it: Item) {
    try { sessionStorage.setItem("haaylo:repurpose", it.body || ""); } catch { /* ignore */ }
    navigate({ to: "/repurpose" });
  }


  async function toggleFav(it: Item) {
    await updateFn({ data: { id: it.id, is_favourite: !it.is_favourite } });
    await refresh();
  }
  async function toggleArchive(it: Item) {
    await updateFn({ data: { id: it.id, is_archived: !it.is_archived } });
    setSelected(null);
    await refresh();
  }
  async function remove(it: Item) {
    if (!confirm("Delete this item?")) return;
    await deleteFn({ data: { id: it.id } });
    setSelected(null);
    toast.success("Deleted");
    await refresh();
  }
  async function duplicate(it: Item) {
    await duplicateFn({ data: { id: it.id } });
    toast.success("Duplicated");
    await refresh();
  }
  function togglePick(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  /** Send the highlighted posts into the 90-Day Plan's written posts. */
  async function addPickedToPlan() {
    const chosen = visibleItems.filter((it) => picked.includes(it.id));
    if (chosen.length === 0) return;
    setAddBusy(true);
    try {
      for (const it of chosen) {
        const pillar = itemPillar(it);
        await scheduleFn({
          data: {
            project_id: it.project_id || projectId || null,
            caption: it.body ?? "",
            title: it.title ?? null,
            platform: itemPlatform(it) || "linkedin",
            pillar: pillar || null,
            status: "draft",
            plan_slot: pillar ? `plan:${pillar}` : null,
            meta: { source: "bank", bank_item_id: it.id },
          },
        });
      }
      try { window.dispatchEvent(new Event("ie:written-updated")); } catch { /* ignore */ }
      toast.success(`${chosen.length} ${chosen.length === 1 ? "post" : "posts"} added to your 90-day plan`);
      setPicked([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add those posts");
    } finally { setAddBusy(false); }
  }

  function exportMd() {
    const md = items.map((i) =>
      `# ${i.title ?? "(untitled)"}\n_${i.kind}_ • ${new Date(i.created_at).toLocaleDateString()}\n\n${i.body ?? ""}\n\n---\n`
    ).join("\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "content-bank.md";
    a.click();
  }

  return (
    <AppShell title="Saved Snippets">
      <p style={{ color: GREY, marginTop: 0, fontFamily: font }}>
        Save your best posts, hooks and campaigns from anywhere. Search, favourite and reuse — none of this is shared with the AI unless you use it.
      </p>

      <div style={{ ...CARD, marginBottom: 12, display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={projectId} onChange={(e) => { setProjectId(e.target.value); refresh({ projectId: e.target.value }); }} style={inputStyle}>
            <option value="">All workspaces</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={kind} onChange={(e) => { setKind(e.target.value); refresh({ kind: e.target.value }); }} style={inputStyle}>
            {KINDS.map((k) => <option key={k.v} value={k.v}>{k.label}</option>)}
          </select>
          {collections.length > 0 && (
            <select value={collection} onChange={(e) => { setCollection(e.target.value); refresh({ collection: e.target.value }); }} style={inputStyle}>
              <option value="">All months</option>
              {collections.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <label style={chipStyle}>
            <input type="checkbox" checked={favOnly} onChange={(e) => { setFavOnly(e.target.checked); refresh({ favOnly: e.target.checked }); }} /> ⭐ Favourites
          </label>
          <label style={chipStyle}>
            <input type="checkbox" checked={archived} onChange={(e) => { setArchived(e.target.checked); refresh({ archived: e.target.checked }); }} /> Archived
          </label>
          <button onClick={exportMd} style={{ ...chipStyle, cursor: "pointer" }}>⤓ Export .md</button>
        </div>

        {/* Pillar | Platform | Status filters */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={pillarFilter} onChange={(e) => setPillarFilter(e.target.value)} style={inputStyle}>
            <option value="">All pillars</option>
            {pillarOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)} style={inputStyle}>
            <option value="">All platforms</option>
            {PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={inputStyle}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
        </div>

        <input
          placeholder="Search post titles…"
          value={q}
          onChange={(e) => { setQ(e.target.value); refresh({ q: e.target.value }); }}
          style={{ ...inputStyle, width: "100%" }}
        />

        {pillarOptions.length > 0 && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: GREY, fontFamily: font }}>Pillars</span>
            {pillarOptions.map((p) => (
              <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: INDIGO, fontFamily: font }}>
                <i style={{ width: 10, height: 10, borderRadius: 3, background: pillarColour(p), display: "inline-block" }} />
                {p}
              </span>
            ))}
          </div>
        )}
      </div>

      {visibleItems.length > 0 && (
        <div
          style={{
            ...CARD,
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            borderColor: picked.length ? PINK : undefined,
          }}
        >
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: INDIGO, cursor: "pointer", fontFamily: font }}>
            <input
              type="checkbox"
              checked={picked.length === visibleItems.length}
              onChange={(e) => setPicked(e.target.checked ? visibleItems.map((i) => i.id) : [])}
            />
            Highlight posts to add to your 90-day plan
          </label>
          <span style={{ fontSize: 12, color: GREY, fontFamily: font }}>
            {picked.length ? `${picked.length} selected` : "Tick the posts you want in the plan"}
          </span>
          <button
            onClick={addPickedToPlan}
            disabled={addBusy || picked.length === 0}
            style={{ ...cta, marginLeft: "auto", padding: "8px 14px", fontSize: 13, opacity: addBusy || picked.length === 0 ? 0.5 : 1, cursor: picked.length ? "pointer" : "not-allowed" }}
          >
            {addBusy ? "Adding…" : "Add to 90-day plan"}
          </button>
        </div>
      )}

      {visibleItems.length === 0 ? (
        <div style={{ ...CARD, textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⭐</div>
          <p style={{ color: GREY, margin: 0, fontFamily: font }}>
            {items.length === 0
              ? <>Your bank is empty. Generate anything in the Engine, then hit <b style={{ color: TINT.purpleInk }}>Save to Bank</b>.</>
              : search.pillar
                ? <>No posts tagged with the <b style={{ color: NAVY }}>{search.pillar}</b> pillar yet. Write some from your plan, or{" "}
                    <button
                      onClick={() => { setPillarFilter(""); navigate({ to: "/bank", search: { pillar: undefined }, replace: true }); }}
                      style={{ background: "none", border: "none", padding: 0, color: PINK, font: "inherit", cursor: "pointer", textDecoration: "underline" }}
                    >
                      clear the filter
                    </button>{" "}
                    to see everything.</>
                : "Nothing matches those filters."}
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))" }}>
          {visibleItems.map((it) => {
            const pillar = itemPillar(it);
            const platform = itemPlatform(it);
            const status = itemStatus(it);
            const badge = STATUS_STYLE[status];
            const isPicked = picked.includes(it.id);
            return (
              <div
                key={it.id}
                style={{
                  ...CARD,
                  display: "grid",
                  gap: 8,
                  borderLeft: `4px solid ${pillarColour(pillar)}`,
                  outline: isPicked ? `2px solid ${PINK}` : "none",
                  background: isPicked ? TINT.pink : (CARD as { background?: string }).background,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={isPicked} onChange={() => togglePick(it.id)} />
                    <span style={{
                      fontSize: 10, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase",
                      color: badge.fg, background: badge.bg, border: `1px solid ${badge.border}`,
                      borderRadius: 999, padding: "3px 8px",
                    }}>{badge.label}</span>
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button onClick={() => toggleFav(it)} title="Favourite" style={iconBtn}>{it.is_favourite ? "⭐" : "☆"}</button>
                    {platform && <PlatformIcon platform={platform} size={16} />}
                  </div>
                </div>

                <button onClick={() => setSelected(it)} style={{ background: "none", border: "none", color: NAVY, textAlign: "left", cursor: "pointer", padding: 0, fontFamily: font }}>
                  <div style={{ fontWeight: 700 }}>{it.title || "(untitled)"}</div>
                  <div style={{ color: GREY, fontSize: 12, marginTop: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontFamily: font }}>
                    {it.body?.slice(0, 160) || "—"}
                  </div>
                </button>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11, color: GREY, fontFamily: font }}>
                  {pillar && <span style={{ color: pillarColour(pillar), fontWeight: 700 }}>{pillar}</span>}
                  <span>{new Date(it.updated_at).toLocaleDateString()}</span>
                  {it.collection && <span>• {it.collection}</span>}
                  {it.tags?.map((t) => <span key={t} style={tagStyle}>#{t}</span>)}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setSelected(it)} style={{ ...secondary, padding: "8px 14px", fontSize: 13 }}>Edit</button>
                  <button onClick={() => openSchedule(it)} style={{ ...cta, padding: "8px 14px", fontSize: 13 }}>Schedule</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sched && (
        <div onClick={() => setSched(null)} style={{ position: "fixed", inset: 0, background: "rgba(20,20,40,0.4)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...CARD, maxWidth: 460, width: "100%", display: "grid", gap: 12 }}>
            <h2 style={{ fontFamily: font, fontWeight: 800, margin: 0, fontSize: 18, color: NAVY }}>Schedule this post</h2>
            <div style={{ color: GREY, fontSize: 13, fontFamily: font }}>{sched.item.title || "(untitled)"}</div>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Date
              <input type="date" value={sched.date} onChange={(e) => setSched({ ...sched, date: e.target.value })} style={inputStyle} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Time
              <input type="time" value={sched.time} onChange={(e) => setSched({ ...sched, time: e.target.value })} style={inputStyle} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Platform
              <select value={sched.platform} onChange={(e) => setSched({ ...sched, platform: e.target.value })} style={inputStyle}>
                {PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </label>
            <p style={{ color: GREY, fontSize: 12, margin: 0, fontFamily: font }}>
              Nothing moves until you confirm.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setSched(null)} style={secondary}>Cancel</button>
              <button onClick={confirmSchedule} disabled={schedBusy} style={cta}>
                {schedBusy ? "Scheduling…" : "Confirm schedule"}
              </button>
            </div>
          </div>
        </div>
      )}



      {selected && (
        <div onClick={() => { setSelected(null); resetImg(); }} style={{ position: "fixed", inset: 0, background: "rgba(20,20,40,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...CARD, maxWidth: 720, width: "100%", maxHeight: "85vh", overflow: "auto" }}>
            <div style={{ fontSize: 11, color: PURPLE, fontWeight: 700, textTransform: "uppercase", fontFamily: font }}>{selected.kind}</div>
            <h2 style={{ fontFamily: font, fontWeight: 800, margin: "4px 0 12px", color: NAVY }}>{selected.title || "(untitled)"}</h2>
            <pre style={{ whiteSpace: "pre-wrap", color: INDIGO, fontFamily: font, fontSize: 13, lineHeight: 1.5 }}>{selected.body || ""}</pre>
            <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => { navigator.clipboard.writeText(selected.body || ""); toast.success("Copied"); }} style={cta}>Copy</button>
              {selected.kind === "post" && selected.body && (
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  title="Image generation is coming soon."
                  onClick={(e) => e.preventDefault()}
                  style={{
                    ...cta,
                    background: SURFACE,
                    color: GREY,
                    border: `1px solid ${LINE}`,
                    cursor: "not-allowed",
                    opacity: 0.6,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  🎨 Generate image
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      letterSpacing: ".06em",
                      textTransform: "uppercase",
                      background: TINT.purple,
                      color: TINT.purpleInk,
                      padding: "2px 6px",
                      borderRadius: 999,
                      border: `1px solid ${TINT.purple}`,
                    }}
                  >
                    Coming soon
                  </span>
                </button>
              )}
              {selected.kind === "post" && selected.body && (
                <a href={`/scheduler?caption=${encodeURIComponent(selected.body.slice(0, 2800))}`} style={cta}>Schedule →</a>
              )}
              {selected.body && (
                <button onClick={() => repurpose(selected)} style={secondary}>♻️ Repurpose</button>
              )}
              {selected.body && (
                <button onClick={() => refreshWithBrain(selected)} disabled={refreshBusy} style={secondary}>
                  {refreshBusy ? "Refreshing…" : "🧠 Refresh with Brain"}
                </button>
              )}
              <button onClick={() => duplicate(selected)} style={secondary}>Duplicate</button>
              <button onClick={() => toggleArchive(selected)} style={secondary}>{selected.is_archived ? "Unarchive" : "Archive"}</button>
              <button onClick={() => remove(selected)} style={{ ...secondary, color: "#C0334B", borderColor: "#F1C6D0" }}>Delete</button>
              <button onClick={() => { setSelected(null); resetImg(); }} style={secondary}>Close</button>
            </div>

            {imgOpen && selected.kind === "post" && (
              <div style={{ marginTop: 20, padding: 14, background: TINT.purple, border: `1px solid ${TINT.purple}`, borderRadius: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", color: TINT.purpleInk, marginBottom: 8 }}>
                  🎨 IMAGE FOR THIS POST · pulls logo, colours & tone from your Brain
                </div>
                <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 4 }}>Image prompt</label>
                <textarea
                  value={imgPrompt}
                  onChange={(e) => setImgPrompt(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  style={{ ...inputStyle, width: "100%", resize: "vertical" }}
                />
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
                  <label style={{ fontSize: 12, fontWeight: 700 }}>
                    Aspect{" "}
                    <select
                      value={imgSize}
                      onChange={(e) => setImgSize(e.target.value as typeof imgSize)}
                      style={{ ...inputStyle, padding: "4px 8px", fontSize: 13, marginLeft: 6 }}
                    >
                      <option value="1024x1024">Square (1:1)</option>
                      <option value="1024x1536">Portrait (2:3)</option>
                      <option value="1536x1024">Landscape (3:2)</option>
                    </select>
                  </label>
                  <button
                    onClick={runGenerate}
                    disabled={imgBusy || !imgPrompt.trim()}
                    style={{ ...cta, marginLeft: "auto", opacity: imgBusy ? 0.6 : 1, cursor: imgBusy ? "wait" : "pointer" }}
                  >
                    {imgBusy ? "Generating…" : imgB64 ? "Regenerate" : "Generate"}
                  </button>
                </div>

                {imgBusy && <div style={{ opacity: .7, fontSize: 12, marginTop: 10, color: INDIGO, fontFamily: font }}>Rendering with Gemini · 5–15s…</div>}

                {imgB64 && (
                  <div style={{ marginTop: 12 }}>
                    <img
                      src={`data:image/png;base64,${imgB64}`}
                      alt="Generated"
                      style={{ maxWidth: "100%", borderRadius: 10, border: imgApproved ? "2px solid #22C55E" : `1px solid ${LINE}` }}
                    />
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                      {!imgApproved ? (
                        <button onClick={() => setImgApproved(true)} style={{ ...cta, background: "linear-gradient(135deg,#22C55E,#16A34A)", color: "#fff" }}>
                          ✓ Use this image
                        </button>
                      ) : (
                        <button
                          onClick={() => scheduleWithImage(selected)}
                          disabled={imgBusy}
                          style={{ ...cta, background: PURPLE }}
                        >
                          Schedule with image →
                        </button>
                      )}
                      <a
                        href={`data:image/png;base64,${imgB64}`}
                        download={`post-${selected.id.slice(0,8)}.png`}
                        style={{ ...secondary, textDecoration: "none", display: "inline-block" }}
                      >
                        Download
                      </a>
                      <button onClick={() => { setImgB64(null); setImgApproved(false); }} style={secondary}>Discard</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );

  function resetImg() {
    setImgOpen(false);
    setImgPrompt("");
    setImgB64(null);
    setImgApproved(false);
    setImgBusy(false);
  }

  function openImg(it: Item) {
    const base = (it.title ? `${it.title}. ` : "") + (it.body ?? "").slice(0, 400);
    setImgPrompt(
      `A social image to accompany this post: "${base.trim()}". Clean, on-brand, minimal text overlay if any.`,
    );
    setImgB64(null);
    setImgApproved(false);
    setImgOpen(true);
  }

  async function runGenerate() {
    if (!selected) return;
    setImgBusy(true);
    setImgB64(null);
    setImgApproved(false);
    try {
      const out = await genImageFn({
        data: {
          prompt: imgPrompt,
          projectId: selected.project_id,
          size: imgSize,
          useLogo: true,
        },
      });
      setImgB64(out.b64);
      toast.success("Image ready — pick it to schedule");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setImgBusy(false);
    }
  }

  async function scheduleWithImage(it: Item) {
    if (!imgB64) return;
    setImgBusy(true);
    try {
      const { path } = await uploadImageFn({ data: { b64: imgB64, mime: "image/png" } });
      const caption = (it.body ?? "").slice(0, 2800);
      navigate({ to: "/scheduler", search: { caption, media_path: path } as never });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't attach image");
    } finally {
      setImgBusy(false);
    }
  }
}

const inputStyle: React.CSSProperties = {
  background: "#FFFFFF", border: `1px solid ${LINE}`,
  color: NAVY, borderRadius: 10, padding: "10px 12px", fontFamily: font, fontSize: 14,
};
const chipStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  background: "#FFFFFF", border: `1px solid ${LINE}`,
  color: INDIGO, borderRadius: 10, padding: "8px 12px", fontSize: 13, fontFamily: font,
};
const iconBtn: React.CSSProperties = {
  background: "none", border: "none", color: TINT.purpleInk, fontSize: 18, cursor: "pointer",
};
const tagStyle: React.CSSProperties = {
  background: TINT.purple, color: TINT.purpleInk, borderRadius: 6, padding: "1px 6px", fontFamily: font,
};
const cta: React.CSSProperties = {
  background: PURPLE, color: "#FFFFFF",
  border: "none", padding: "10px 16px", borderRadius: 10, fontWeight: 800, textDecoration: "none", cursor: "pointer", fontFamily: font,
};
const secondary: React.CSSProperties = {
  background: "#FFFFFF", color: PURPLE, border: `1px solid ${TINT.purple}`,
  padding: "10px 16px", borderRadius: 10, fontWeight: 700, cursor: "pointer", fontFamily: font,
};
