import { ContentArchiveGroups } from "@/components/ContentArchiveGroups";
import { isContentArchived } from "@/lib/content-organisation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useWorkspace } from "@/hooks/useActiveProject";
import { toast } from "sonner";
import { AppShell, CARD } from "@/components/AppShell";
import { PlatformIcon, platformKey, platformLabel } from "@/components/PlatformIcon";
import {
  listContentPosts,
  saveContentPost,
  setContentStatus,
  deleteContentPost,
  duplicateContentPost,
  moveContentPostToCampaign,
  type ContentPost,
} from "@/lib/content.functions";
import { listCampaigns } from "@/lib/campaigns.functions";
import { listLandingPages } from "@/lib/landing.functions";
import { getWorkPackage } from "@/lib/packages.functions";
import { PackageShelf, type PackageWithCounts } from "@/components/PackageShelf";
import { LinkInjector, appendLink, shortLabel, type InjectableLink } from "@/components/content/LinkInjector";
import { PostImageZone } from "@/components/content/PostImageZone";
import { PostEditorDrawer } from "@/components/content/PostEditorDrawer";
import { Calendar } from "@/components/ui/calendar";
import { SURFACE, NAVY, INDIGO, PURPLE, PINK, GREY, LINE, TINT, font } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/bank")({
  head: () => ({
    meta: [
      { title: "Content Bank — haaylo.com" },
      {
        name: "description",
        content:
          "The permanent vault for every post you generate or write: filter by campaign, pillar, platform and status, then edit or schedule.",
      },
      { property: "og:title", content: "Content Bank — haaylo" },
      { property: "og:description", content: "Every generated and hand-written post, kept until you delete it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ScopedBankPage,
  validateSearch: (search: Record<string, unknown>): { pillar?: string; status?: string; campaign?: string } => ({
    pillar: typeof search.pillar === "string" ? search.pillar : undefined,
    status: typeof search.status === "string" ? search.status : undefined,
    campaign: typeof search.campaign === "string" ? search.campaign : undefined,
  }),
});

const PILLAR_COLOURS = ["#7C8CFF", "#2DD4BF", "#F59E0B", "#FB7185", "#A855F7", "#84CC16"];
function pillarColour(pillar?: string | null): string {
  const key = (pillar || "").trim().toLowerCase();
  if (!key) return GREY;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PILLAR_COLOURS[h % PILLAR_COLOURS.length]!;
}

type Status = "draft" | "scheduled" | "published";
const STATUS_STYLE: Record<Status, { label: string; fg: string; bg: string; border: string }> = {
  draft: { label: "Draft", fg: GREY, bg: SURFACE, border: LINE },
  scheduled: { label: "Scheduled", fg: TINT.blueInk, bg: TINT.blue, border: TINT.blue },
  published: { label: "Published", fg: TINT.purpleInk, bg: TINT.purple, border: TINT.purple },
};
function statusOf(p: ContentPost): Status {
  return p.status === "scheduled" || p.status === "published" ? p.status : "draft";
}

const PLATFORM_FILTERS = [
  { v: "", label: "All" },
  { v: "linkedin", label: "LinkedIn" },
  { v: "instagram", label: "Instagram" },
  { v: "facebook", label: "Facebook" },
];
const STATUS_FILTERS = [
  { v: "", label: "All" },
  { v: "draft", label: "Draft" },
  { v: "scheduled", label: "Scheduled" },
  { v: "published", label: "Published" },
];

function ScopedBankPage() {
  const { projectId } = useWorkspace();
  return projectId ? <BankPage key={projectId} /> : <AppShell title="Content Bank">Pick a workspace first.</AppShell>;
}

function BankPage() {
  const search = useSearch({ from: "/_authenticated/bank" });
  const navigate = useNavigate();
  const { projectId: activeProjectId } = useWorkspace();
  const listFn = useServerFn(listContentPosts);
  const campaignsFn = useServerFn(listCampaigns);
  const saveFn = useServerFn(saveContentPost);
  const statusFn = useServerFn(setContentStatus);
  const deleteFn = useServerFn(deleteContentPost);
  const duplicateFn = useServerFn(duplicateContentPost);
  const moveFn = useServerFn(moveContentPostToCampaign);
  const pagesFn = useServerFn(listLandingPages);

  const [view, setView] = useState("packages");
  const [openPackage, setOpenPackage] = useState<{ id: string; title: string; postIds: string[] } | null>(null);
  const packageFn = useServerFn(getWorkPackage);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const applyImage = useCallback(
    (
      postId: string,
      next: { media_url: string | null; media_path: string | null; meta?: Record<string, unknown> | null },
    ) => {
      const patch = next as unknown as Partial<ContentPost>;
      setPosts((prev) => prev.map((x) => (x.id === postId ? { ...x, ...patch } : x)));
      setEditing((cur) => (cur && cur.id === postId ? { ...cur, ...patch } : cur));
    },
    [],
  );
  const [campaigns, setCampaigns] = useState<{ id: string; title: string }[]>([]);
  const [pages, setPages] = useState<InjectableLink[]>([]);
  const [pending, setPending] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [campaignId, setCampaignId] = useState(search.campaign ?? "");
  const [pillar, setPillar] = useState(search.pillar ?? "");
  const [platform, setPlatform] = useState("");
  const [status, setStatus] = useState(search.status ?? "");
  const [q, setQ] = useState("");
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<ContentPost | null>(null);
  const [scheduling, setScheduling] = useState<ContentPost | null>(null);
  const [moving, setMoving] = useState<ContentPost | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    if (!activeProjectId) return;
    setLoading(true);
    try {
      const [rows, camps, landing] = await Promise.all([
        listFn({ data: { projectId: activeProjectId } }),
        campaignsFn({ data: { projectId: activeProjectId } }),
        pagesFn({ data: { projectId: activeProjectId } }).catch(() => []),
      ]);
      setPosts(rows);
      setPending({});
      setCampaigns((camps ?? []).map((c) => ({ id: c.id, title: c.campaign_title ?? "Untitled campaign" })));
      setPages(
        (landing ?? [])
          .filter((pg) => pg.status === "live")
          .map((pg) => ({
            id: pg.id,
            title: pg.title,
            slug: pg.slug,
            status: pg.status,
            url: `https://haaylo.com/p/${pg.slug}`,
          })),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open your content vault.");
    } finally {
      setLoading(false);
    }
  }, [listFn, campaignsFn, pagesFn, activeProjectId]);


  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(null);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const campaignName = useCallback(
    (p: ContentPost) => {
      const id = p.campaign_id ?? (typeof p.meta?.["campaign_id"] === "string" ? String(p.meta["campaign_id"]) : null);
      if (!id) return typeof p.meta?.["campaign_title"] === "string" ? String(p.meta["campaign_title"]) : "";
      return campaigns.find((c) => c.id === id)?.title ?? String(p.meta?.["campaign_title"] ?? "");
    },
    [campaigns],
  );

  const pillars = useMemo(
    () => Array.from(new Set(posts.map((p) => (p.pillar || "").trim()).filter(Boolean))).sort(),
    [posts],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return posts.filter((p) => {
      const pid = p.campaign_id ?? (typeof p.meta?.["campaign_id"] === "string" ? p.meta["campaign_id"] : null);
      if (campaignId && pid !== campaignId) return false;
      if (pillar && (p.pillar || "").trim().toLowerCase() !== pillar.toLowerCase()) return false;
      if (platform && platformKey(p.platform) !== platform) return false;
      if (status && statusOf(p) !== status) return false;
      if (term && !`${p.title ?? ""} ${p.caption ?? ""}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [posts, campaignId, pillar, platform, status, q]);

  const archived = useMemo(() => filtered.filter(p => isContentArchived(p, now)), [filtered, now]);
  const active = useMemo(() => filtered.filter(p => !isContentArchived(p, now)), [filtered, now]);
  const packagePosts = useMemo(() => {
    if (!openPackage) return [];
    const byId = new Map(filtered.map((p) => [p.id, p]));
    return openPackage.postIds.map((id) => byId.get(id)).filter((p): p is ContentPost => Boolean(p));
  }, [filtered, openPackage]);
  const visible = view === "archive" ? archived : view === "package" ? packagePosts : active;

  async function openPkg(pkg: PackageWithCounts) {
    try {
      const full = await packageFn({ data: { id: pkg.id } });
      const find = (t: string) => full.items.find((i) => i.asset_type === t);
      const campaign = find("campaign");
      if (pkg.package_type === "campaign" && campaign) {
        navigate({ to: "/campaign/$id", params: { id: campaign.asset_id } });
        return;
      }
      const postIds = full.items.filter((i) => i.asset_type === "content_post").map((i) => i.asset_id);
      if (postIds.length > 0) {
        setOpenPackage({ id: pkg.id, title: pkg.title, postIds });
        setView("package");
        return;
      }
      const page = find("landing_page");
      if (pkg.package_type === "landing_page" && page) {
        navigate({ to: "/landing/$id", params: { id: page.asset_id } });
      } else if (pkg.package_type === "strategy") {
        navigate({ to: "/plan" });
      } else if (pkg.package_type === "content_plan") {
        navigate({ to: "/content-plan" });
      } else if (pkg.package_type === "email_sequence") {
        navigate({ to: "/email" });
      } else if (pkg.package_type === "lead_magnet") {
        navigate({ to: "/funnel" });
      } else if (pkg.package_type === "image_pack") {
        navigate({ to: "/image" });
      } else {
        toast.message("That package has nothing to show here yet.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open that package.");
    }
  }

  // Collapsible groups: by campaign (when showing all) then by phase.
  const groups = useMemo(() => {
    const phaseOf = (p: ContentPost) =>
      typeof p.meta?.["phase"] === "number" ? Number(p.meta["phase"]) : null;

    const batchOf = (p: ContentPost) =>
      typeof p.meta?.["batch_title"] === "string" ? String(p.meta["batch_title"]).trim() : "";

    const bucket = new Map<string, { key: string; label: string; sort: number; posts: ContentPost[] }>();
    for (const p of visible) {
      const ph = phaseOf(p);
      const camp = campaignId ? "" : campaignName(p);
      const batch = camp ? "" : batchOf(p);
      const heading = camp || batch || (campaignId ? "" : "Standalone posts");
      const label = [heading, ph === null ? "" : `Phase ${ph}`].filter(Boolean).join(" · ");
      const key = `${camp || batch || "none"}::${ph ?? "none"}`;
      const sort = (camp ? 0 : batch ? 1 : 2) * 1000 + (ph ?? 99);
      const found = bucket.get(key);
      if (found) found.posts.push(p);
      else bucket.set(key, { key, label, sort, posts: [p] });
    }
    return Array.from(bucket.values()).sort(
      (a, b) => a.sort - b.sort || a.label.localeCompare(b.label),
    );
  }, [visible, campaignId, campaignName]);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const isOpen = (key: string, i: number) => openGroups[key] ?? i === 0;

  async function remove(p: ContentPost) {
    setMenuOpen(null);
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    setBusy(p.id);
    try {
      await deleteFn({ data: { id: p.id } });
      setPosts((prev) => prev.filter((x) => x.id !== p.id));
      toast.success("Post deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete that post.");
    } finally {
      setBusy(null);
    }
  }

  async function duplicate(p: ContentPost) {
    setMenuOpen(null);
    setBusy(p.id);
    try {
      const copy = await duplicateFn({ data: { id: p.id } });
      setPosts((prev) => [copy, ...prev]);
      toast.success("Duplicated as a new draft.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not duplicate that post.");
    } finally {
      setBusy(null);
    }
  }

  function injectInto(p: ContentPost, link: InjectableLink) {
    const current = pending[p.id] ?? p.caption ?? "";
    const next = appendLink(current, link.url);
    if (next === current) {
      toast.message(`That link is already on this post — ${shortLabel(link.url)}`);
      return;
    }
    setPending((prev) => ({ ...prev, [p.id]: next }));
    toast.success(`Link added — ${shortLabel(link.url)}`);
  }

  async function savePending(p: ContentPost) {
    const caption = pending[p.id];
    if (caption === undefined) return;
    setBusy(p.id);
    try {
      const saved = await saveFn({
        data: {
          id: p.id,
          project_id: p.project_id,
          caption,
          title: p.title,
          platform: p.platform,
          pillar: p.pillar,
          status: p.status,
          scheduled_at: p.scheduled_at,
          media_url: p.media_url,
          media_path: p.media_path,
          plan_slot: p.plan_slot,
          hashtags: p.hashtags,
          meta: p.meta,
          campaign_id: p.campaign_id,
          paired_landing_page_id: p.paired_landing_page_id,
          paired_guide_campaign_id: p.paired_guide_campaign_id,
        },
      });
      setPosts((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
      setPending((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
      toast.success("Post saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that post.");
    } finally {
      setBusy(null);
    }
  }


  async function moveTo(p: ContentPost, id: string | null) {
    setBusy(p.id);
    try {
      await moveFn({ data: { id: p.id, campaignId: id } });
      setPosts((prev) => prev.map((x) => (x.id === p.id ? { ...x, campaign_id: id } : x)));
      setMoving(null);
      toast.success(id ? "Moved to campaign." : "Removed from its campaign.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not move that post.");
    } finally {
      setBusy(null);
    }
  }

  const renderPosts = (rows: ContentPost[]) => (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))",
                  gap: 12,
                  alignItems: "start",
                }}
              >
            {rows.map((p) => {
              const st = STATUS_STYLE[statusOf(p)];
              const colour = pillarColour(p.pillar);
              const camp = campaignName(p);
              return (
                <div
                  key={p.id}
                  style={{
                    ...CARD,
                    padding: 14,
                    borderLeft: `4px solid ${colour}`,
                    position: "relative",
                    opacity: busy === p.id ? 0.55 : 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "3px 9px",
                        borderRadius: 999,
                        color: st.fg,
                        background: st.bg,
                        border: `1px solid ${st.border}`,
                      }}
                    >
                      {st.label}
                    </span>
                    <span title={platformLabel(p.platform)} style={{ display: "inline-flex" }}>
                      <PlatformIcon platform={p.platform} size={16} />
                    </span>
                  </div>

                  <strong style={{ fontSize: 15, lineHeight: 1.3, ...clamp(2) }}>
                    {p.title || (p.caption || "").slice(0, 70) || "Untitled post"}
                  </strong>
                  <p style={{ margin: 0, fontSize: 13, opacity: 0.7, lineHeight: 1.45, ...clamp(3) }}>
                    {pending[p.id] ?? p.caption}
                  </p>


                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {p.pillar && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "3px 9px",
                          borderRadius: 999,
                          color: colour,
                          background: `${colour}22`,
                          border: `1px solid ${colour}55`,
                        }}
                      >
                        {p.pillar}
                      </span>
                    )}
                    {typeof p.meta?.["phase"] === "number" && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "3px 9px",
                          borderRadius: 999,
                          color: TINT.pinkInk,
                          background: TINT.pink,
                          border: `1px solid ${TINT.pink}`,
                        }}
                      >
                        Phase {String(p.meta["phase"])}
                      </span>
                    )}
                    {camp && <span style={{ fontSize: 11, opacity: 0.6 }}>{camp}</span>}

                  </div>

                  <div style={{ display: "flex", gap: 10, alignItems: "center", opacity: 0.85 }}>
                    <Paired on={Boolean(p.media_url)} title={p.media_url ? "Image paired" : "No image paired"} glyph="image" />
                    <Paired
                      on={Boolean(p.paired_landing_page_id)}
                      title={p.paired_landing_page_id ? "Landing page attached" : "No landing page attached"}
                      glyph="link"
                    />
                    <Paired
                      on={Boolean(p.paired_guide_campaign_id)}
                      title={p.paired_guide_campaign_id ? "Lead magnet linked" : "No lead magnet linked"}
                      glyph="guide"
                    />
                  </div>

                  <PostImageZone
                    postId={p.id}
                    caption={pending[p.id] ?? p.caption}
                    title={p.title}
                    platform={p.platform}
                    projectId={p.project_id}
                    mediaUrl={p.media_url}
                    mediaPath={p.media_path}
                    meta={p.meta as Record<string, unknown> | null}
                    onChange={(next) => applyImage(p.id, next)}
                  />



                  {pending[p.id] !== undefined && (
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        flexWrap: "wrap",
                        fontSize: 12,
                        color: "#FBBF24",
                      }}
                    >
                      <span>Unsaved link</span>
                      <button style={ghostSm} disabled={busy === p.id} onClick={() => void savePending(p)}>
                        {busy === p.id ? "Saving…" : "Save"}
                      </button>
                      <button
                        style={ghostSm}
                        onClick={() =>
                          setPending((prev) => {
                            const next = { ...prev };
                            delete next[p.id];
                            return next;
                          })
                        }
                      >
                        Discard
                      </button>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 6, marginTop: "auto", alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      style={ghostSm}
                      onClick={() => setEditing({ ...p, caption: pending[p.id] ?? p.caption })}
                    >

                      Edit
                    </button>
                    <button style={ghostSm} onClick={() => setScheduling(p)}>
                      Schedule
                    </button>
                    <LinkInjector links={pages} buttonStyle={ghostSm} onInject={(l) => injectInto(p, l)} />

                    <button
                      aria-label="More actions"
                      style={{ ...ghostSm, marginLeft: "auto", fontWeight: 800 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(menuOpen === p.id ? null : p.id);
                      }}
                    >
                      ⋯
                    </button>
                    {menuOpen === p.id && (
                      <div
                        style={{
                          position: "absolute",
                          right: 12,
                          bottom: 48,
                          zIndex: 30,
                          background: "#FFFFFF",
                          border: `1px solid ${LINE}`,
                          borderRadius: 12,
                          minWidth: 190,
                          overflow: "hidden",
                          boxShadow: "0 18px 40px rgba(20,20,40,0.16)",
                        }}
                      >
                        <MenuItem label="Duplicate" onClick={() => void duplicate(p)} />
                        <MenuItem
                          label="Move to campaign"
                          onClick={() => {
                            setMenuOpen(null);
                            setMoving(p);
                          }}
                        />
                        <MenuItem label="Delete" danger onClick={() => void remove(p)} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
              </div>
  );

  return (
    <AppShell title="Content Bank">
      <div ref={wrapRef}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 16,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 26 }}>Content Bank</h1>
            <p style={{ margin: "6px 0 0", opacity: 0.72, fontSize: 14 }}>
              Your permanent vault. Everything you generate or write stays here until you delete it.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link to="/snippets" style={{ ...ghost, textDecoration: "none" }}>
              Saved snippets
            </Link>
            <Link to="/tools" style={{ ...primary, textDecoration: "none" }}>
              Write a post
            </Link>
          </div>
        </div>

        <Tabs
          value={view}
          onValueChange={(v) => {
            setView(v);
            if (v !== "package") setOpenPackage(null);
          }}
          className="mb-4"
        >
          <TabsList aria-label="Content Bank views">
            <TabsTrigger value="packages">Packages</TabsTrigger>
            <TabsTrigger value="active">Active content ({active.length})</TabsTrigger>
            <TabsTrigger value="archive">Archive ({archived.length})</TabsTrigger>
            {openPackage && <TabsTrigger value="package">{openPackage.title} ({packagePosts.length})</TabsTrigger>}
          </TabsList>
        </Tabs>

        {view === "packages" && activeProjectId && (
          <PackageShelf projectId={activeProjectId} onOpen={(pkg) => void openPkg(pkg)} />
        )}

        {view === "package" && openPackage && (
          <div style={{ ...CARD, padding: "10px 14px", marginBottom: 12, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: NAVY }}>
              Viewing package <strong>{openPackage.title}</strong>. Edits and scheduling here change the same posts you see everywhere else.
            </span>
            <button style={ghostSm} onClick={() => { setOpenPackage(null); setView("packages"); }}>
              Back to packages
            </button>
          </div>
        )}
        {view !== "packages" && (<>
        {/* Filter bar */}
        <div style={{ ...CARD, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 16 }}>
          <select style={field} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            <option value="">All campaigns</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <select style={field} value={pillar} onChange={(e) => setPillar(e.target.value)}>
            <option value="">All pillars</option>
            {pillars.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PLATFORM_FILTERS.map((f) => (
              <button key={f.label} onClick={() => setPlatform(f.v)} style={chip(platform === f.v)}>
                {f.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {STATUS_FILTERS.map((f) => (
              <button key={f.label} onClick={() => setStatus(f.v)} style={chip(status === f.v)}>
                {f.label}
              </button>
            ))}
          </div>
          <input
            style={{ ...field, flex: "1 1 200px" }}
            placeholder="Search title or body"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {loading ? (
          <div style={{ ...CARD, opacity: 0.75 }}>Loading your vault…</div>
        ) : posts.length === 0 ? (
          <div style={{ ...CARD, padding: 32, textAlign: "center" }}>
            <p style={{ margin: 0, fontWeight: 600 }}>
              Your content vault is empty — launch a campaign to generate your first posts, or write one from scratch.
            </p>
            <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <Link to="/campaign" style={{ ...primary, textDecoration: "none" }}>
                New Campaign
              </Link>
              <Link to="/tools" style={{ ...ghost, textDecoration: "none" }}>
                Write a post
              </Link>
            </div>
          </div>
        ) : visible.length === 0 ? (
          <div style={{ ...CARD, opacity: 0.75 }}>{view === "archive" ? "No archived posts match these filters." : "No active posts match these filters."}</div>
        ) : view === "archive" ? (
          <ContentArchiveGroups key={activeProjectId} posts={archived} campaignName={campaignName} renderPosts={renderPosts} />
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {groups.map((g, gi) => (
            <section key={g.key} style={{ display: "grid", gap: 10 }}>
              <button
                onClick={() => setOpenGroups((prev) => ({ ...prev, [g.key]: !isOpen(g.key, gi) }))}
                style={{
                  ...CARD,
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  cursor: "pointer",
                  textAlign: "left",
                  fontWeight: 700,
                  color: NAVY,
                }}
              >
                <span>
                  {g.label} <span style={{ opacity: 0.55, fontWeight: 600 }}>({g.posts.length})</span>
                </span>
                <span style={{ opacity: 0.6 }}>{isOpen(g.key, gi) ? "▾" : "▸"}</span>
              </button>
              {isOpen(g.key, gi) && renderPosts(g.posts)}
            </section>
            ))}
          </div>
        )}
        </>)}
      </div>

      <PostEditorDrawer
        post={editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          setPosts((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
          setPending((prev) => {
            if (!(saved.id in prev)) return prev;
            const next = { ...prev };
            delete next[saved.id];
            return next;
          });
        }}
        onDuplicated={(copy) => setPosts((prev) => [copy, ...prev])}
      />

      {scheduling && (
        <Modal title="Schedule post" onClose={() => setScheduling(null)}>
          <ScheduleForm
            post={scheduling}
            onSave={async (whenIso) => {
              const target = scheduling;
              setBusy(target.id);
              try {
                const saved = await statusFn({
                  data: { id: target.id, status: "scheduled", scheduled_at: whenIso },
                });
                setPosts((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
                setScheduling(null);
                toast.success("Scheduled.");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not schedule that post.");
              } finally {
                setBusy(null);
              }
            }}
          />
        </Modal>
      )}

      {moving && (
        <Modal title="Move to campaign" onClose={() => setMoving(null)}>
          <div style={{ display: "grid", gap: 8 }}>
            <button style={ghost} onClick={() => void moveTo(moving, null)}>
              No campaign
            </button>
            {campaigns.map((c) => (
              <button key={c.id} style={ghost} onClick={() => void moveTo(moving, c.id)}>
                {c.title}
              </button>
            ))}
            {campaigns.length === 0 && <p style={{ margin: 0, opacity: 0.7, fontSize: 13 }}>No campaigns yet.</p>}
          </div>
        </Modal>
      )}
    </AppShell>
  );
}

function EditForm({
  post,
  links,
  busy,
  imageSlot,
  onSave,
}: {
  post: ContentPost;
  links: InjectableLink[];
  busy: boolean;
  imageSlot?: React.ReactNode;
  onSave: (patch: { title: string; caption: string; platform: string; pillar: string }) => void;
}) {
  const [title, setTitle] = useState(post.title ?? "");
  const [caption, setCaption] = useState(post.caption ?? "");
  const [platform, setPlatform] = useState(post.platform ?? "linkedin");
  const [pillar, setPillar] = useState(post.pillar ?? "");
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <input style={field} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea
        style={{ ...field, minHeight: 200, resize: "vertical", lineHeight: 1.5 }}
        placeholder="Post body"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
      />
      {imageSlot}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <LinkInjector
          links={links}
          buttonStyle={ghostSm}
          onInject={(l) => {
            setCaption((c) => {
              const next = appendLink(c, l.url);
              if (next === c) toast.message(`That link is already on this post — ${shortLabel(l.url)}`);
              else toast.success(`Link added — ${shortLabel(l.url)}`);
              return next;
            });
          }}
        />
        <span style={{ fontSize: 12, opacity: 0.6 }}>Nothing saves until you press Save post.</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>

        <select style={field} value={platformKey(platform)} onChange={(e) => setPlatform(e.target.value)}>
          <option value="linkedin">LinkedIn</option>
          <option value="instagram">Instagram</option>
          <option value="facebook">Facebook</option>
        </select>
        <input
          style={{ ...field, flex: "1 1 160px" }}
          placeholder="Pillar"
          value={pillar}
          onChange={(e) => setPillar(e.target.value)}
        />
      </div>
      <button style={primary} disabled={busy} onClick={() => onSave({ title, caption, platform, pillar })}>
        {busy ? "Saving…" : "Save post"}
      </button>
    </div>
  );
}

function ScheduleForm({ post, onSave }: { post: ContentPost; onSave: (iso: string) => void }) {
  const initial = post.scheduled_at ? new Date(post.scheduled_at) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const [date, setDate] = useState<Date | undefined>(initial);
  const [time, setTime] = useState(`${pad(initial.getHours())}:${pad(initial.getMinutes())}`);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const shift = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setDate(d);
  };

  const combined = () => {
    if (!date) return null;
    const [h, m] = time.split(":").map((n) => Number(n) || 0);
    const d = new Date(date);
    d.setHours(h, m, 0, 0);
    return d;
  };

  const chosen = combined();
  const inPast = chosen ? chosen.getTime() < Date.now() : false;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <p style={{ margin: 0, fontSize: 13, opacity: 0.75 }}>Pick the day and time this post should go out.</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={ghostSm} onClick={() => shift(1)}>Tomorrow</button>
        <button style={ghostSm} onClick={() => shift(7)}>Next week</button>
      </div>

      <div style={{ background: SURFACE, borderRadius: 12, padding: 4 }}>
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          weekStartsOn={1}
          disabled={{ before: today }}
          initialFocus
          className="p-3 pointer-events-auto"
        />
      </div>

      <label style={{ display: "grid", gap: 6, fontSize: 13, opacity: 0.85 }}>
        Time
        <input type="time" style={field} value={time} onChange={(e) => setTime(e.target.value)} />
      </label>

      <p style={{ margin: 0, fontSize: 13, opacity: inPast ? 1 : 0.75, color: inPast ? "#C0334B" : undefined }}>
        {chosen
          ? inPast
            ? "That time has already passed — pick a later slot."
            : `Going out ${chosen.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} at ${time}.`
          : "Choose a date to continue."}
      </p>

      <button
        style={{ ...primary, opacity: !chosen || inPast ? 0.5 : 1 }}
        disabled={!chosen || inPast}
        onClick={() => chosen && onSave(chosen.toISOString())}
      >
        Schedule post
      </button>
    </div>
  );
}


function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,20,40,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 60,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ ...CARD, width: "min(560px, 100%)", maxHeight: "86vh", overflowY: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <strong style={{ fontSize: 16 }}>{title}</strong>
          <button style={ghostSm} onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "10px 12px",
        fontSize: 13,
        fontWeight: 600,
        background: "transparent",
        border: "none",
        borderTop: `1px solid ${LINE}`,
        cursor: "pointer",
        color: danger ? "#C0334B" : "inherit",
      }}
    >
      {label}
    </button>
  );
}

/** Asset pairing indicator: filled when the asset is attached, outline when not. */
function Paired({ on, title, glyph }: { on: boolean; title: string; glyph: "image" | "link" | "guide" }) {
  const colour = on ? TINT.blueInk : GREY;
  const fill = on ? colour : "none";
  return (
    <span title={title} style={{ display: "inline-flex" }} aria-label={title}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill={fill} stroke={colour} strokeWidth="1.7">
        {glyph === "image" && (
          <>
            <rect x="3" y="4" width="18" height="16" rx="3" />
            <circle cx="9" cy="10" r="1.6" fill={on ? NAVY : "none"} />
            <path d="M4 18l5-5 4 4 3-3 4 4" fill="none" stroke={on ? NAVY : colour} />
          </>
        )}
        {glyph === "link" && (
          <>
            <path d="M10 13a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 1 0-5.7-5.7L11 6.3" fill="none" />
            <path d="M14 11a4 4 0 0 0-5.7 0L6 13.3a4 4 0 1 0 5.7 5.7L13 17.7" fill="none" />
          </>
        )}
        {glyph === "guide" && (
          <>
            <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v16H6.5A2.5 2.5 0 0 0 4 21.5z" />
            <path d="M9 8h6M9 12h6" fill="none" stroke={on ? NAVY : colour} />
          </>
        )}
      </svg>
    </span>
  );
}

function clamp(lines: number): React.CSSProperties {
  return {
    display: "-webkit-box",
    WebkitLineClamp: lines,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  };
}

const field: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 10,
  border: `1px solid ${LINE}`,
  background: "#FFFFFF",
  color: NAVY,
  fontSize: 13,
  fontFamily: font,
};

const primary: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 10,
  border: "none",
  background: PINK,
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-block",
  fontFamily: font,
};

const ghost: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 10,
  border: `1px solid ${LINE}`,
  background: "#FFFFFF",
  color: INDIGO,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-block",
  textAlign: "left",
  fontFamily: font,
};

const ghostSm: React.CSSProperties = { ...ghost, padding: "6px 10px", fontSize: 12, textAlign: "center" };

function chip(active: boolean): React.CSSProperties {
  return {
    padding: "7px 12px",
    borderRadius: 999,
    border: `1px solid ${active ? PINK : LINE}`,
    background: active ? TINT.pink : "#FFFFFF",
    color: "inherit",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  };
}
