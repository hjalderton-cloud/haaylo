import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { PlatformIcon, platformLabel } from "@/components/PlatformIcon";
import { PlatformPreview, PREVIEW_PLATFORMS, type PreviewPlatform } from "@/components/schedule/PlatformPreview";
import { PostImageZone } from "@/components/content/PostImageZone";
import { saveContentPost, deleteContentPost, type ContentPost } from "@/lib/content.functions";
import {
  getScheduleWorkspace,
  setPostSchedule,
  setPostQueueNote,
  type ScheduleLink,
} from "@/lib/schedule.functions";
import { scheduleWithZernio } from "@/lib/zernio.functions";
import { CLIENT_CHANGED_EVENT } from "@/components/WorkflowNav";
import { LinkInjector, appendLink, shortLabel, type InjectableLink } from "@/components/content/LinkInjector";
import { SURFACE, NAVY, INDIGO, PURPLE, PINK, GREY, LINE, TINT, font } from "@/lib/theme";


export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({
    meta: [
      { title: "Schedule & Publish — haaylo.com" },
      {
        name: "description",
        content:
          "Drag posts from your content bank onto a monthly or weekly calendar, set the time slot, and queue them to your connected accounts.",
      },
      { property: "og:title", content: "Schedule & Publish — haaylo.com" },
      { property: "og:description", content: "Plan, drag, edit and queue your social posts in one workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SchedulePage,
  validateSearch: (search: Record<string, unknown>): { view?: "week"; campaign?: string } => ({
    view: search['view'] === "week" ? ("week" as const) : undefined,
    campaign: typeof search['campaign'] === "string" ? search['campaign'] : undefined,
  }),
});

// ── helpers ──────────────────────────────────────────────────────────────

const PILLAR_COLOURS = [PINK, "#22D3EE", "#FACC15", "#4ADE80", PURPLE, "#FB923C"];
function pillarColour(pillar?: string | null): string {
  const key = (pillar || "").trim().toLowerCase();
  if (!key) return "#7C3AED";
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PILLAR_COLOURS[h % PILLAR_COLOURS.length]!;
}

const SLOTS = [
  { id: "morning", label: "Morning", time: "09:00" },
  { id: "afternoon", label: "Afternoon", time: "13:00" },
  { id: "evening", label: "Evening", time: "18:00" },
] as const;
type SlotId = (typeof SLOTS)[number]["id"];

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const mondayOf = (d: Date) => {
  const x = startOfDay(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
};
const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

function slotOf(date: Date): SlotId {
  const h = date.getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

function localIso(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, hh ?? 9, mm ?? 0, 0, 0).toISOString();
}

const CARD = SURFACE;
const BORDER = `1px solid ${LINE}`;
const MUTED = GREY;

type PendingDrop = {
  postId: string;
  dateStr: string;
  time: string;
  error: string | null;
  clash: boolean;
  clashAccepted: boolean;
  saving: boolean;
};


const statusColour = (s: string) =>
  s === "published" ? "#22C55E" : s === "scheduled" ? "#6366F1" : "#8A93A5";

// ── page ─────────────────────────────────────────────────────────────────

function SchedulePage() {
  const search = Route.useSearch();
  const loadFn = useServerFn(getScheduleWorkspace);
  const scheduleFn = useServerFn(setPostSchedule);
  const noteFn = useServerFn(setPostQueueNote);
  const saveFn = useServerFn(saveContentPost);
  const deleteFn = useServerFn(deleteContentPost);
  const zernioFn = useServerFn(scheduleWithZernio);

  const [projectId, setProjectId] = useState<string | null>(null);
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [campaigns, setCampaigns] = useState<Array<{ id: string; title: string }>>([]);
  const [links, setLinks] = useState<ScheduleLink[]>([]);
  const [brand, setBrand] = useState<{ name: string; logoUrl: string | null }>({ name: "Your business", logoUrl: null });
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  const [view, setView] = useState<"month" | "week">(search.view === "week" ? "week" : "month");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [campaignFilter, setCampaignFilter] = useState<string>(search.campaign ?? "");
  const [platformFilter, setPlatformFilter] = useState<string>("");
  const [query, setQuery] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [isMobile, setIsMobile] = useState(false);
  const [pending, setPending] = useState<PendingDrop | null>(null);

  // Drag-and-drop is desktop only; phones keep the click-to-schedule flow.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const read = () => setIsMobile(mq.matches);
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);


  useEffect(() => {
    const read = () => setProjectId(localStorage.getItem("ie-active-project"));
    read();
    window.addEventListener(CLIENT_CHANGED_EVENT, read);
    return () => window.removeEventListener(CLIENT_CHANGED_EVENT, read);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await loadFn({ data: { projectId } });
      setPosts(res.posts);
      setCampaigns(res.campaigns);
      setLinks(res.links);
      setBrand(res.brand);
    } catch {
      toast.error("Could not load your posts. Try again shortly.");
    } finally {
      setLoading(false);
    }
  }, [loadFn, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Brief skeleton when the visible period changes, so the switch reads as deliberate.
  useEffect(() => {
    setSwitching(true);
    const t = setTimeout(() => setSwitching(false), 220);
    return () => clearTimeout(t);
  }, [cursor, view]);

  const patchPost = useCallback((next: ContentPost) => {
    setPosts((prev) => prev.map((p) => (p.id === next.id ? next : p)));
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts.filter((p) => {
      if (campaignFilter && p.campaign_id !== campaignFilter) return false;
      if (platformFilter && p.platform !== platformFilter) return false;
      if (q && !`${p.title ?? ""} ${p.caption}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [posts, campaignFilter, platformFilter, query]);

  const unscheduled = useMemo(() => visible.filter((p) => !p.scheduled_at), [visible]);
  const scheduled = useMemo(() => visible.filter((p) => p.scheduled_at), [visible]);

  const byPillar = useMemo(() => {
    const groups = new Map<string, ContentPost[]>();
    for (const p of unscheduled) {
      const key = (p.pillar || "Unsorted").trim() || "Unsorted";
      const list = groups.get(key) ?? [];
      list.push(p);
      groups.set(key, list);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [unscheduled]);

  const days = useMemo(() => {
    if (view === "week") {
      const start = mondayOf(cursor);
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        return d;
      });
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = mondayOf(first);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [cursor, view]);

  const cellPosts = useCallback(
    (day: Date, slot: SlotId) =>
      scheduled.filter((p) => {
        const at = new Date(p.scheduled_at as string);
        return isoDate(at) === isoDate(day) && slotOf(at) === slot;
      }),
    [scheduled],
  );

  const linkForPost = useCallback(
    (post: ContentPost | null): ScheduleLink | null => {
      if (!post) return null;
      return (
        links.find((l) => l.id === post.paired_landing_page_id) ??
        links.find((l) => post.campaign_id && l.campaign_id === post.campaign_id) ??
        null
      );
    },
    [links],
  );

  const queueLive = useCallback(
    async (post: ContentPost, iso: string) => {
      try {
        const res = await zernioFn({
          data: {
            caption: post.caption.slice(0, 5000),
            scheduled_at: iso,
            media_url: post.media_url || null,
            platforms: [{ name: post.platform }],
          },
        });
        const saved = await noteFn({
          data: {
            id: post.id,
            queued: res.ok,
            note: res.ok ? null : res.error ?? "Not queued.",
            externalId: res.ok ? res.id ?? null : null,
          },
        });

        patchPost(saved);
        if (res.ok) toast.success("Scheduled and queued to your connected account.");
        else toast.warning(`Scheduled, but not queued live: ${res.error}`);
      } catch {
        const saved = await noteFn({
          data: { id: post.id, queued: false, note: "Could not reach the publishing service." },
        }).catch(() => null);
        if (saved) patchPost(saved);
        toast.warning("Scheduled, but the live queue could not be reached.");
      }
    },
    [zernioFn, noteFn, patchPost],
  );

  const applySchedule = useCallback(
    async (postId: string, iso: string | null) => {
      const before = posts.find((p) => p.id === postId);
      if (!before) return;
      // Optimistic move, rolled back if the save fails.
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, scheduled_at: iso, status: p.status === "published" ? p.status : iso ? "scheduled" : "draft" }
            : p,
        ),
      );
      try {
        const saved = await scheduleFn({ data: { id: postId, scheduled_at: iso } });
        patchPost(saved);
        if (iso) void queueLive(saved, iso);
        else toast.success("Moved back to the content bank.");
      } catch {
        setPosts((prev) => prev.map((p) => (p.id === postId ? before : p)));
        toast.error("That did not save. Try again.");
      }
    },
    [posts, scheduleFn, patchPost, queueLive],
  );

  const clashAt = useCallback(
    (iso: string, ignoreId: string) =>
      scheduled.some((p) => p.id !== ignoreId && p.scheduled_at && new Date(p.scheduled_at).getTime() === new Date(iso).getTime()),
    [scheduled],
  );

  const evaluatePending = (dateStr: string, time: string, postId: string) => {
    const iso = localIso(dateStr, time);
    if (new Date(iso).getTime() < Date.now()) {
      return { error: "You can't schedule to a past date — try a future date", clash: false };
    }
    return { error: null, clash: clashAt(iso, postId) };
  };


  const onDropCell = (day: Date, slot: (typeof SLOTS)[number]) => (e: React.DragEvent) => {
    e.preventDefault();
    if (isMobile) return;
    setHover(null);
    const id = e.dataTransfer.getData("text/plain") || dragId;
    setDragId(null);
    if (!id) return;
    const dateStr = isoDate(day);
    const time = slot.time;
    const check = evaluatePending(dateStr, time, id);
    setPending({ postId: id, dateStr, time, error: check.error, clash: check.clash, clashAccepted: false, saving: false });
  };

  const changePendingTime = (time: string) => {
    setPending((p) => {
      if (!p) return p;
      const check = evaluatePending(p.dateStr, time, p.postId);
      return { ...p, time, error: check.error, clash: check.clash, clashAccepted: false };
    });
  };

  const confirmPending = async (force = false) => {
    if (!pending) return;
    const check = evaluatePending(pending.dateStr, pending.time, pending.postId);
    if (check.error) {
      setPending({ ...pending, error: check.error, clash: false });
      return;
    }
    if (check.clash && !pending.clashAccepted && !force) {
      setPending({ ...pending, clash: true, error: null });
      return;
    }

    setPending({ ...pending, saving: true });
    await applySchedule(pending.postId, localIso(pending.dateStr, pending.time));
    setPending(null);
  };


  const openPost = posts.find((p) => p.id === openId) ?? null;

  const monthLabel = cursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const weekLabel = `${mondayOf(cursor).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${new Date(
    mondayOf(cursor).getTime() + 6 * 864e5,
  ).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;

  const step = (dir: number) => {
    setCursor((c) => {
      const next = new Date(c);
      if (view === "week") next.setDate(next.getDate() + dir * 7);
      else next.setMonth(next.getMonth() + dir);
      return startOfDay(next);
    });
  };

  return (
    <AppShell title="Schedule & Publish" flush>
      <div style={{ display: "grid", gap: 16, padding: "0 18px 24px" }}>
        <header
          className="schedule-header"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 14,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ minWidth: 240, flex: "1 1 260px" }}>
            <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: NAVY, fontFamily: font }}>Schedule &amp; Publish</h2>
            <p style={{ margin: "4px 0 0", color: MUTED, fontSize: 14 }}>
              Drag a post onto a day and time slot. It saves the schedule and queues it to your connected accounts.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button onClick={() => setPanelOpen(true)} className="schedule-panel-toggle" style={btn(false)}>
              Content bank
            </button>
            <Link to="/connect" style={{ ...btn(false), textDecoration: "none" }}>
              Connect accounts
            </Link>
          </div>
        </header>

        <div className="schedule-shell">
          {/* ── Asset repository ─────────────────────────────────────── */}
          <aside className={`schedule-panel${panelOpen ? " is-open" : ""}`}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <strong style={{ color: NAVY, fontSize: 15 }}>Content bank</strong>
              <button onClick={() => setPanelOpen(false)} className="schedule-panel-close" style={btn(false)}>
                Close
              </button>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search captions"
                style={input}
              />
              <select value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)} style={input}>
                <option value="">All campaigns</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
              <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)} style={input}>
                <option value="">All platforms</option>
                <option value="linkedin">LinkedIn</option>
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
              </select>
            </div>

            <div style={{ overflowY: "auto", display: "grid", gap: 14, alignContent: "start", paddingRight: 2 }}>
              {loading ? (
                <>
                  <Skeleton h={92} />
                  <Skeleton h={92} />
                  <Skeleton h={92} />
                </>
              ) : byPillar.length === 0 ? (
                <p style={{ color: MUTED, fontSize: 13.5, margin: 0 }}>
                  Nothing waiting to be scheduled. Generate posts from a campaign or write one in the{" "}
                  <Link to="/bank" style={{ color: PINK }}>
                    Content Bank
                  </Link>
                  .
                </p>
              ) : (
                byPillar.map(([pillar, list]) => {
                  const shut = collapsed[pillar];
                  return (
                    <section key={pillar} style={{ display: "grid", gap: 8 }}>
                      <button
                        onClick={() => setCollapsed((c) => ({ ...c, [pillar]: !c[pillar] }))}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                          color: NAVY,
                          fontSize: 13,
                          fontWeight: 700,
                        }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: 99, background: pillarColour(pillar) }} />
                        {pillar}
                        <span style={{ color: MUTED, fontWeight: 500 }}>({list.length})</span>
                        <span style={{ marginLeft: "auto", color: MUTED }}>{shut ? "+" : "−"}</span>
                      </button>
                      {!shut &&
                        list.map((p) => (
                          <AssetCard
                            key={p.id}
                            post={p}
                            link={linkForPost(p)}
                            onOpen={() => setOpenId(p.id)}
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/plain", p.id);
                              setDragId(p.id);
                            }}
                            onDragEnd={() => setDragId(null)}
                            canDrag={!isMobile}
                          />

                        ))}
                    </section>
                  );
                })
              )}
            </div>
          </aside>

          {/* ── Calendar ─────────────────────────────────────────────── */}
          <section style={{ minWidth: 0, display: "grid", gap: 12, alignContent: "start" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1fr) auto",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <button onClick={() => step(-1)} style={btn(false)} aria-label="Previous">
                  ←
                </button>
                <button onClick={() => step(1)} style={btn(false)} aria-label="Next">
                  →
                </button>
                <button onClick={() => setCursor(startOfDay(new Date()))} style={btn(false)}>
                  Today
                </button>
                <strong style={{ color: NAVY, fontSize: 16, marginLeft: 6 }}>
                  {view === "week" ? weekLabel : monthLabel}
                </strong>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setView("month")} style={btn(view === "month")}>
                  Month
                </button>
                <button onClick={() => setView("week")} style={btn(view === "week")}>
                  Week
                </button>
              </div>
            </div>

            {/* Desktop grid */}
            <div className="schedule-grid-wrap">
              <div className="schedule-weekhead">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <div key={d} style={{ color: MUTED, fontSize: 12, fontWeight: 700, textAlign: "center" }}>
                    {d}
                  </div>
                ))}
              </div>
              {loading || switching ? (
                <div className="schedule-grid">
                  {Array.from({ length: view === "week" ? 7 : 42 }).map((_, i) => (
                    <Skeleton key={i} h={view === "week" ? 260 : 130} />
                  ))}
                </div>
              ) : (
                <div className="schedule-grid">
                  {days.map((day) => {
                    const outside = view === "month" && day.getMonth() !== cursor.getMonth();
                    const today = isoDate(day) === isoDate(new Date());
                    return (
                      <div
                        key={day.toISOString()}
                        style={{
                          position: "relative",
                          background: outside ? `${SURFACE}` : CARD,
                          border: today ? `1px solid ${PINK}` : BORDER,
                          borderRadius: 12,
                          padding: 8,
                          display: "grid",
                          gap: 6,
                          alignContent: "start",
                          minHeight: view === "week" ? 260 : 130,
                          opacity: outside ? 0.55 : 1,
                          transition: "border-color .15s ease, background .15s ease",
                        }}
                      >
                        {pending && pending.dateStr === isoDate(day) && (
                          <TimeDropPopover
                            pending={pending}
                            postTitle={
                              posts.find((p) => p.id === pending.postId)?.title ||
                              posts.find((p) => p.id === pending.postId)?.caption ||
                              "this post"
                            }
                            onTime={changePendingTime}
                            onConfirm={() => void confirmPending()}
                            onAcceptClash={() => void confirmPending(true)}
                            onCancel={() => setPending(null)}
                          />
                        )}

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ color: today ? PINK : "#fff", fontSize: 12.5, fontWeight: 700 }}>
                            {day.getDate()}
                          </span>
                          <span style={{ color: MUTED, fontSize: 11 }}>
                            {day.toLocaleDateString("en-GB", { month: "short" })}
                          </span>
                        </div>
                        {SLOTS.map((slot) => {
                          const key = `${isoDate(day)}-${slot.id}`;
                          const items = cellPosts(day, slot.id);
                          return (
                            <div
                              key={slot.id}
                              onDragOver={(e) => {
                                e.preventDefault();
                                setHover(key);
                              }}
                              onDragLeave={() => setHover((h) => (h === key ? null : h))}
                              onDrop={onDropCell(day, slot)}
                              style={{
                                border: hover === key ? `1px dashed ${PINK}` : `1px dashed ${LINE}`,
                                background: hover === key ? "rgba(255,92,147,0.08)" : "transparent",
                                borderRadius: 8,
                                padding: 5,
                                display: "grid",
                                gap: 4,
                                minHeight: 30,
                              }}
                            >
                              <span style={{ color: MUTED, fontSize: 10, letterSpacing: 0.3 }}>
                                {slot.label}
                              </span>
                              {items.map((p) => (
                                <Chip
                                  key={p.id}
                                  post={p}
                                  onOpen={() => setOpenId(p.id)}
                                  onDragStart={(e) => {
                                    e.dataTransfer.setData("text/plain", p.id);
                                    setDragId(p.id);
                                  }}
                                  onDragEnd={() => setDragId(null)}
                                  canDrag={!isMobile}
                                />

                              ))}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Mobile feed list */}
            <div className="schedule-feed">
              {loading ? (
                <>
                  <Skeleton h={70} />
                  <Skeleton h={70} />
                </>
              ) : scheduled.length === 0 ? (
                <p style={{ color: MUTED, fontSize: 13.5 }}>Nothing scheduled yet. Open a post to set its date and time.</p>
              ) : (
                [...scheduled]
                  .sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)))
                  .map((p) => {
                    const at = new Date(p.scheduled_at as string);
                    return (
                      <button
                        key={p.id}
                        onClick={() => setOpenId(p.id)}
                        style={{
                          textAlign: "left",
                          background: CARD,
                          border: BORDER,
                          borderLeft: `3px solid ${pillarColour(p.pillar)}`,
                          borderRadius: 12,
                          padding: 12,
                          color: NAVY,
                          display: "grid",
                          gap: 4,
                          cursor: "pointer",
                        }}
                      >
                        <span style={{ fontSize: 12, color: MUTED }}>
                          {at.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} ·{" "}
                          {hhmm(at)} · {platformLabel(p.platform)}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>
                          {(p.title || p.caption).slice(0, 90)}
                        </span>
                        <span style={{ fontSize: 11.5, color: statusColour(p.status) }}>{p.status}</span>
                      </button>
                    );
                  })
              )}
            </div>
          </section>
        </div>
      </div>

      {openPost && (
        <EditorDrawer
          key={openPost.id}
          post={openPost}
          link={linkForPost(openPost)}
          links={links}

          brand={brand}
          onClose={() => setOpenId(null)}
          onSaved={patchPost}
          onSchedule={applySchedule}
          saveFn={saveFn}
          deleteFn={deleteFn}
          onDeleted={(id) => {
            setPosts((prev) => prev.filter((p) => p.id !== id));
            setOpenId(null);
          }}
        />
      )}

      <style>{`
        .schedule-shell { display: grid; grid-template-columns: 320px minmax(0,1fr); gap: 16px; align-items: start; }
        .schedule-panel {
          position: sticky; top: 12px; max-height: calc(100vh - 120px);
          display: grid; gap: 12px; grid-template-rows: auto auto minmax(0,1fr);
          background: ${LINE}; border: 1px solid ${LINE};
          border-radius: 14px; padding: 12px;
        }
        .schedule-panel-close, .schedule-panel-toggle { display: none; }
        .schedule-weekhead { display: grid; grid-template-columns: repeat(7, minmax(0,1fr)); gap: 8px; margin-bottom: 4px; }
        .schedule-grid { display: grid; grid-template-columns: repeat(7, minmax(0,1fr)); gap: 8px; }
        .schedule-feed { display: none; gap: 10px; }
        @media (max-width: 1100px) { .schedule-shell { grid-template-columns: 260px minmax(0,1fr); } }
        @media (max-width: 900px) {
          .schedule-shell { grid-template-columns: minmax(0,1fr); }
          .schedule-panel {
            position: fixed; inset: 0 auto 0 0; width: min(340px, 88vw); z-index: 60;
            max-height: none; border-radius: 0; transform: translateX(-105%); transition: transform .22s ease;
            background: #FFFFFF; overflow: hidden;
          }
          .schedule-panel.is-open { transform: none; }
          .schedule-panel-close, .schedule-panel-toggle { display: inline-flex; }
        }
        @media (max-width: 768px) {
          .schedule-grid-wrap, .schedule-weekhead { display: none; }
          .schedule-feed { display: grid; }
        }
      `}</style>
    </AppShell>
  );
}

// ── pieces ───────────────────────────────────────────────────────────────

function Skeleton({ h }: { h: number }) {
  return (
    <div
      style={{
        height: h,
        borderRadius: 12,
        background: `linear-gradient(90deg,${SURFACE},#FFFFFF,${SURFACE})`,
        backgroundSize: "200% 100%",
        animation: "haayloShimmer 1.2s linear infinite",
      }}
    />
  );
}

function AssetCard({
  post,
  link,
  onOpen,
  onDragStart,
  onDragEnd,
  canDrag = true,
}: {
  post: ContentPost;
  link: ScheduleLink | null;
  onOpen: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  canDrag?: boolean;
}) {
  return (
    <article
      draggable={canDrag}
      onDragStart={canDrag ? onDragStart : undefined}
      onDragEnd={canDrag ? onDragEnd : undefined}
      onClick={onOpen}
      style={{
        cursor: canDrag ? "grab" : "pointer",

        background: CARD,
        border: BORDER,
        borderLeft: `3px solid ${pillarColour(post.pillar)}`,
        borderRadius: 12,
        padding: 10,
        display: "grid",
        gridTemplateColumns: "48px minmax(0,1fr)",
        gap: 10,
        alignItems: "start",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 8,
          overflow: "hidden",
          background: `${SURFACE}`,
          display: "grid",
          placeItems: "center",
          fontSize: 10,
          color: MUTED,
        }}
      >
        {post.media_url ? (
          <img src={post.media_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          "No art"
        )}
      </div>
      <div style={{ minWidth: 0, display: "grid", gap: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <PlatformIcon platform={post.platform} size={13} />
          <span style={{ color: MUTED, fontSize: 11 }}>{platformLabel(post.platform)}</span>
        </div>
        <p
          style={{
            margin: 0,
            color: NAVY,
            fontSize: 12.5,
            lineHeight: 1.4,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {post.title || post.caption || "Untitled post"}
        </p>
        {link && (
          <span
            style={{
              justifySelf: "start",
              fontSize: 10.5,
              padding: "2px 7px",
              borderRadius: 99,
              background: TINT.purple,
              color: TINT.purpleInk,
            }}
          >
            Landing page link
          </span>
        )}
      </div>
    </article>
  );
}

function TimeDropPopover({
  pending,
  postTitle,
  onTime,
  onConfirm,
  onAcceptClash,
  onCancel,
}: {
  pending: PendingDrop;
  postTitle: string;
  onTime: (t: string) => void;
  onConfirm: () => void;
  onAcceptClash: () => void;
  onCancel: () => void;
}) {
  const showClash = pending.clash && !pending.clashAccepted && !pending.error;
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        zIndex: 40,
        top: 6,
        left: 6,
        right: 6,
        background: "#FFFFFF",
        border: `1px solid ${PINK}`,
        borderRadius: 12,
        padding: 10,
        display: "grid",
        gap: 8,
        boxShadow: "0 18px 40px rgba(20,20,40,0.16)",
      }}
    >
      <strong style={{ color: NAVY, fontSize: 12.5 }}>What time?</strong>
      <span
        style={{
          color: MUTED,
          fontSize: 11,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {postTitle}
      </span>
      <input
        type="time"
        value={pending.time}
        onChange={(e) => onTime(e.target.value)}
        style={{
          background: `${SURFACE}`,
          border: BORDER,
          borderRadius: 8,
          color: NAVY,
          padding: "6px 8px",
          fontSize: 12.5,
        }}
      />
      {pending.error && (
        <p style={{ margin: 0, color: "#C0334B", fontSize: 11.5, lineHeight: 1.35 }}>{pending.error}</p>
      )}
      {showClash && (
        <p style={{ margin: 0, color: "#FCD34D", fontSize: 11.5, lineHeight: 1.35 }}>
          You already have a post at this time — schedule anyway?
        </p>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {showClash ? (
          <>
            <button onClick={onAcceptClash} disabled={pending.saving} style={popBtn(true)}>
              Confirm
            </button>
            <button onClick={onCancel} style={popBtn(false)}>
              Change time
            </button>
          </>
        ) : (
          <>
            <button onClick={onConfirm} disabled={pending.saving || !!pending.error} style={popBtn(true)}>
              {pending.saving ? "Scheduling…" : "Confirm schedule"}
            </button>
            <button onClick={onCancel} style={popBtn(false)}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function popBtn(primary: boolean): React.CSSProperties {
  return {
    cursor: "pointer",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 700,
    border: primary ? `1px solid ${PINK}` : BORDER,
    background: primary ? PINK : "transparent",
    color: primary ? "#150B12" : NAVY,
  };
}

function Chip({
  post,
  onOpen,
  onDragStart,
  onDragEnd,
  canDrag = true,
}: {
  post: ContentPost;
  onOpen: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  canDrag?: boolean;
}) {
  const colour = statusColour(post.status);
  const at = post.scheduled_at ? new Date(post.scheduled_at) : null;
  const failed = post.meta && post.meta["live_queued"] === false;
  return (
    <button
      draggable={canDrag}
      onDragStart={canDrag ? onDragStart : undefined}
      onDragEnd={canDrag ? onDragEnd : undefined}
      onClick={onOpen}
      title={post.title || post.caption}
      style={{
        cursor: canDrag ? "grab" : "pointer",

        textAlign: "left",
        border: `1px solid ${colour}55`,
        background: `${colour}22`,
        color: "#EDF0F5",
        borderRadius: 7,
        padding: "4px 6px",
        fontSize: 11,
        display: "grid",
        gap: 2,
        overflow: "hidden",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: colour, flexShrink: 0 }} />
        {at ? hhmm(at) : ""} {failed ? "⚠" : ""}
      </span>
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {post.title || post.caption}
      </span>
    </button>
  );
}

type SaveFn = ReturnType<typeof useServerFn<typeof saveContentPost>>;
type DeleteFn = ReturnType<typeof useServerFn<typeof deleteContentPost>>;

function EditorDrawer({
  post,
  link,
  links,
  brand,
  onClose,
  onSaved,
  onSchedule,
  onDeleted,
  saveFn,
  deleteFn,
}: {
  post: ContentPost;
  link: ScheduleLink | null;
  links: ScheduleLink[];
  brand: { name: string; logoUrl: string | null };
  onClose: () => void;

  onSaved: (p: ContentPost) => void;
  onSchedule: (id: string, iso: string | null) => Promise<void>;
  onDeleted: (id: string) => void;
  saveFn: SaveFn;
  deleteFn: DeleteFn;
}) {
  const at = post.scheduled_at ? new Date(post.scheduled_at) : null;
  const [caption, setCaption] = useState(post.caption);
  const [title, setTitle] = useState(post.title ?? "");
  const [pillar, setPillar] = useState(post.pillar ?? "");
  const [platform, setPlatform] = useState(post.platform);
  const [date, setDate] = useState(at ? isoDate(at) : isoDate(new Date()));
  const [time, setTime] = useState(at ? hhmm(at) : "09:00");
  const [tab, setTab] = useState<PreviewPlatform>(
    (["linkedin", "instagram", "facebook"] as string[]).includes(post.platform)
      ? (post.platform as PreviewPlatform)
      : "linkedin",
  );
  const [busy, setBusy] = useState(false);
  const [media, setMedia] = useState<{ media_url: string | null; media_path: string | null }>({
    media_url: post.media_url ?? null,
    media_path: post.media_path ?? null,
  });

  const vary = (kind: "short" | "lines" | "hook") => {
    setCaption((c) => {
      const text = c.trim();
      if (kind === "short") {
        const first = text.split(/\n+/).filter(Boolean).slice(0, 2).join(" ");
        return first.length > 260 ? `${first.slice(0, 257).trimEnd()}…` : first;
      }
      if (kind === "lines") {
        return text
          .split(/\n+/)
          .flatMap((para) => para.split(/(?<=[.!?])\s+/))
          .filter(Boolean)
          .join("\n\n");
      }
      const [firstLine, ...rest] = text.split("\n");
      return [`${(firstLine ?? "").trim()}`, "", rest.join("\n").trim(), "", "#marketing #smallbusiness #growth"]
        .filter((part, i) => part !== "" || i < 4)
        .join("\n")
        .trim();
    });
  };

  // Live pages for this workspace, with the post's own page first.
  const injectable: InjectableLink[] = links
    .filter((l) => l.status === "live")
    .sort((a, b) => (a.id === link?.id ? -1 : b.id === link?.id ? 1 : 0))
    .map((l) => ({ id: l.id, title: l.title, slug: l.slug, url: l.url, status: l.status }));

  const injectLink = (chosen: InjectableLink) => {
    setCaption((c) => {
      const next = appendLink(c, chosen.url);
      if (next === c) toast.message(`That link is already on this post — ${shortLabel(chosen.url)}`);
      else toast.success(`Link added — ${shortLabel(chosen.url)}`);
      return next;
    });
  };


  const save = async () => {
    setBusy(true);
    try {
      const saved = await saveFn({
        data: {
          id: post.id,
          project_id: post.project_id,
          caption,
          title: title || null,
          platform,
          pillar: pillar || null,
          status: post.status,
          scheduled_at: post.scheduled_at,
          media_url: media.media_url,
          media_path: media.media_path,
          plan_slot: post.plan_slot,
          hashtags: post.hashtags,
          meta: post.meta,
          campaign_id: post.campaign_id,
          paired_landing_page_id: post.paired_landing_page_id,
          paired_guide_campaign_id: post.paired_guide_campaign_id,
        },
      });
      onSaved(saved);
      toast.success("Saved.");
    } catch {
      toast.error("Could not save that.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Edit post"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,20,40,0.4)",
        zIndex: 80,
        display: "flex",
        justifyContent: "flex-end",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(1020px, 100%)",
          height: "100%",
          background: "#FFFFFF",
          borderLeft: BORDER,
          overflowY: "auto",
          padding: 18,
          display: "grid",
          gap: 16,
          alignContent: "start",
          animation: "haayloSlideIn .22s ease",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <strong style={{ color: NAVY, fontSize: 17 }}>Edit post</strong>
          <button onClick={onClose} style={btn(false)}>
            Close
          </button>
        </div>

        <div className="schedule-editor" style={{ display: "grid", gap: 16 }}>
          {/* Workbench */}
          <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" style={input} />
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={10}
              style={{ ...input, resize: "vertical", lineHeight: 1.5 }}
            />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button onClick={() => vary("short")} style={btn(false)}>
                Shorten for X
              </button>
              <button onClick={() => vary("lines")} style={btn(false)}>
                Line breaks for LinkedIn
              </button>
              <button onClick={() => vary("hook")} style={btn(false)}>
                Hook + hashtags
              </button>
              <LinkInjector
                links={injectable}
                buttonStyle={btn(false)}
                label="Inject landing page link"
                onInject={injectLink}
              />

            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8 }}>
              <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={input}>
                <option value="linkedin">LinkedIn</option>
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
              </select>
              <input value={pillar} onChange={(e) => setPillar(e.target.value)} placeholder="Pillar" style={input} />
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={input} />
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={input} />
            </div>
            {post.meta && post.meta["live_queued"] === false && (
              <p style={{ margin: 0, color: "#FBBF24", fontSize: 12.5 }}>
                Not queued live: {String(post.meta["live_note"] ?? "")}{" "}
                <Link to="/connect" style={{ color: PINK }}>
                  Connect accounts
                </Link>
              </p>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={save} disabled={busy} style={btn(true)}>
                {busy ? "Saving…" : "Save"}
              </button>
              <button
                onClick={async () => {
                  await save();
                  await onSchedule(post.id, localIso(date, time));
                }}
                style={btn(false)}
              >
                Schedule &amp; queue
              </button>
              {post.scheduled_at && (
                <button onClick={() => void onSchedule(post.id, null)} style={btn(false)}>
                  Unschedule
                </button>
              )}
              <button
                onClick={async () => {
                  if (!confirm("Delete this post?")) return;
                  await deleteFn({ data: { id: post.id } });
                  onDeleted(post.id);
                }}
                style={{ ...btn(false), color: "#C0334B" }}
              >
                Delete
              </button>
            </div>
          </div>

          {/* Simulator */}
          <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
            <div style={{ display: "flex", gap: 6 }}>
              {PREVIEW_PLATFORMS.map((p) => (
                <button key={p.id} onClick={() => setTab(p.id)} style={btn(tab === p.id)}>
                  {p.label}
                </button>
              ))}
            </div>
            <div style={{ display: "grid", placeItems: "start center" }}>
              <PlatformPreview
                platform={tab}
                caption={caption}
                mediaUrl={media.media_url}
                accountName={brand.name}
                avatarUrl={brand.logoUrl}
              />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <strong style={{ color: NAVY, fontSize: 13 }}>Post image</strong>
              <PostImageZone
                postId={post.id}
                caption={caption}
                title={title}
                platform={platform}
                projectId={post.project_id}
                mediaUrl={media.media_url}
                meta={post.meta as Record<string, unknown> | null}
                size="editor"
                onChange={(next) => setMedia({ media_url: next.media_url, media_path: next.media_path })}
              />
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (min-width: 900px) {
          .schedule-editor { grid-template-columns: minmax(0,1fr) minmax(0,440px); }
        }
        @keyframes haayloSlideIn { from { transform: translateX(24px); opacity: .6 } to { transform: none; opacity: 1 } }
        @keyframes haayloShimmer { from { background-position: 200% 0 } to { background-position: -200% 0 } }
      `}</style>
    </div>
  );
}

// ── shared styles ────────────────────────────────────────────────────────

const input: React.CSSProperties = {
  width: "100%",
  background: `${SURFACE}`,
  border: BORDER,
  borderRadius: 9,
  padding: "9px 11px",
  color: NAVY,
  fontSize: 13.5,
  fontFamily: "inherit",
};

function btn(active: boolean): React.CSSProperties {
  return {
    padding: "8px 13px",
    borderRadius: 9,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    color: NAVY,
    border: active ? "1px solid rgba(255,92,147,0.6)" : BORDER,
    background: active ? `linear-gradient(135deg,${PINK},${PURPLE})` : `${SURFACE}`,
  };
}
