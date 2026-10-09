import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { toast } from "sonner";
import { listContentPosts, setContentStatus } from "@/lib/content.functions";

import {
  listConnections, disconnectConnection, startSocialOAuth,
  listPosts, savePost, deletePost, createUploadUrl, getMediaReadUrl,
} from "@/lib/scheduler.functions";
import { SURFACE, NAVY, INDIGO, PURPLE, PINK, GREY, LINE, TINT, font } from "@/lib/theme";

const searchSchema = z.object({
  sub_session_id: z.string().optional(),
  canceled: z.string().optional(),
  connected: z.string().optional(),
  connect_error: z.string().optional(),
  caption: z.string().optional(),
  media_path: z.string().optional(),
  tab: z.enum(["compose", "calendar", "queue", "connections"]).optional(),
});

export const Route = createFileRoute("/_authenticated/scheduler")({
  validateSearch: searchSchema,
  ssr: false,
  head: () => ({
    meta: [
      { title: "Planner — haaylo.com" },
      { name: "description", content: "Plan and auto-post to LinkedIn (personal + company), Facebook Business Pages and Instagram Business. Calendar, queue and one-click publishing — £6.99/mo." },
      { property: "og:title", content: "Planner — haaylo.com" },
      { property: "og:description", content: "Plan and auto-post to LinkedIn, Facebook Pages and Instagram. £6.99/month." },
      { property: "og:url", content: "https://appcontentcollectiv.lovable.app/scheduler" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "canonical", href: "https://appcontentcollectiv.lovable.app/scheduler" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Service",
          name: "haaylo.com Social Planner",
          description: "Plan and auto-post to LinkedIn personal and company pages, Facebook Business Pages and Instagram Business.",
          provider: { "@type": "Organization", name: "haaylo.com" },
          areaServed: "Worldwide",
          offers: { "@type": "Offer", price: "6.99", priceCurrency: "GBP", category: "Subscription" },
        }),
      },
    ],
  }),
  component: SchedulerPage,
});

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
type GateState = "loading" | "needs_subscription" | "active";
type Tab = "compose" | "calendar" | "queue" | "connections";

const PROVIDER_LABEL: Record<string, string> = {
  linkedin: "LinkedIn",
  linkedin_company: "LinkedIn Page",
  facebook_page: "Facebook Page",
  instagram: "Instagram",
};
const CHAR_LIMITS: Record<string, number> = {
  linkedin: 3000, linkedin_company: 3000,
  facebook_page: 63206, instagram: 2200,
};


function SchedulerPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/_authenticated/scheduler" });
  const [state, setState] = useState<GateState>("loading");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(search.tab ?? (search.caption || search.media_path ? "compose" : "queue"));
  // The separate £6.99/mo "Social Planner" subscription has been retired —
  // the Planner is now part of the single Haaylo membership, gated only by
  // the _authenticated route gate.
  const isAnonymous = false;
  const locked = false;
  function requireSub(): boolean {
    return false;
  }


  const [initialCaption, setInitialCaption] = useState<string>("");
  const [initialMediaPath, setInitialMediaPath] = useState<string | null>(null);

  useEffect(() => {
    if (search.canceled) toast.info("Subscription not completed.");
    if (search.sub_session_id) toast.success("Planner subscription active.");
    if (search.connected) toast.success(`${search.connected} connected.`);
    if (search.connect_error) toast.error(
      search.connect_error === "no_linkedin_pages"
        ? "No LinkedIn Company Pages found on that account. You need admin access to a Page."
        : `Connect failed: ${search.connect_error}`
    );
    if (search.caption) {
      setInitialCaption(search.caption);
      setTab("compose");
      toast.success("Post loaded — pick channels & schedule.");
    }
    if (search.media_path) {
      setInitialMediaPath(search.media_path);
      setTab("compose");
    }
    if (search.canceled || search.sub_session_id || search.connected || search.connect_error || search.caption || search.media_path) {
      navigate({ to: "/scheduler", search: search.tab ? { tab: search.tab } : {}, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    refresh();
    if (search.sub_session_id) {
      let tries = 0;
      timer = window.setInterval(() => {
        tries++; refresh();
        if (tries > 6) window.clearInterval(timer);
      }, 1500);
    }
    return () => { if (timer) window.clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      // The _authenticated gate normally prevents this; bail out rather than
      // creating a throwaway anonymous account.
      if (typeof window !== "undefined") window.location.assign("/auth?redirect=%2Fscheduler");
      return;
    }
    setEmail(u.user.email ?? null);
    setState("active");
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <Shell email={email} isAnonymous={isAnonymous} onSignOut={signOut}>
      {state === "loading" ? (
        <Centered text="Loading…" />
      ) : (
        <div className="w-full max-w-3xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1 rounded-xl p-1" style={{ background: `${LINE}`, border: `1px solid ${LINE}` }}>
              {(["queue", "connections"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="px-3 py-1.5 text-xs sm:text-sm rounded-lg font-bold capitalize"
                  style={{
                    background: tab === t ? PURPLE : "transparent",
                    color: tab === t ? "#ffffff" : INDIGO,
                  }}
                >{t}</button>
              ))}
            </div>
          </div>

          {tab === "compose" && <Composer locked={locked} requireSub={requireSub} onOpenConnections={() => setTab("connections")} initialCaption={initialCaption} initialMediaPath={initialMediaPath} isAnonymous={isAnonymous} />}
          {tab === "calendar" && <CalendarView />}
          {tab === "queue" && <Queue />}
          {tab === "connections" && <Connections locked={locked} requireSub={requireSub} />}
        </div>
      )}
    </Shell>
  );
}

/* ---------------- Connections tab ---------------- */
function Connections({ locked, requireSub }: { locked: boolean; requireSub: () => boolean }) {
  const fetchList = useServerFn(listConnections);
  const start = useServerFn(startSocialOAuth);
  const disconnect = useServerFn(disconnectConnection);
  const [items, setItems] = useState<Array<{ id: string; provider: string; display_name: string | null; avatar_url: string | null; status: string }>>([]);
  const [busy, setBusy] = useState(false);

  async function reload() {
    try { const r = await fetchList(); setItems(r.connections as never); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not load"); }
  }
  useEffect(() => { reload(); }, []);

  async function connect(provider: "linkedin" | "linkedin_company" | "facebook_page" | "instagram") {
    if (requireSub()) return;
    // Open a blank tab synchronously (no `noopener` — we need to write to tab.location).
    const tab = window.open("about:blank", "_blank");
    if (tab) {
      // Friendly placeholder while we fetch the OAuth URL.
      try {
        tab.document.write(
          '<title>Connecting…</title><body style="font-family:system-ui;background:#FAFAFC;color:#171D41;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">Redirecting to sign-in…</body>'
        );
      } catch {}
    }
    setBusy(true);
    try {
      const r = await start({ data: { provider } });
      if (tab && !tab.closed) {
        tab.location.href = r.url;
      } else {
        // Popup blocked — open as a normal navigation in a new tab via an anchor click.
        const a = document.createElement("a");
        a.href = r.url; a.target = "_blank"; a.rel = "noopener";
        document.body.appendChild(a); a.click(); a.remove();
      }
    } catch (e) {
      if (tab && !tab.closed) tab.close();
      toast.error(e instanceof Error ? e.message : "Could not start");
    } finally {
      setBusy(false);
    }
  }



  const PLATFORMS_UI: Array<{
    id: string; name: string; icon: string; color: string;
    providers: string[]; connectProvider?: "linkedin" | "linkedin_company" | "facebook_page" | "instagram"; extraConnect?: { provider: "linkedin_company"; label: string; hint: string }; soon?: boolean;
  }> = [
    { id: "instagram", name: "Instagram", icon: "📷", color: "#E4405F", providers: ["instagram"], connectProvider: "facebook_page" },
    { id: "facebook", name: "Facebook", icon: "👍", color: "#1877F2", providers: ["facebook_page"], connectProvider: "facebook_page" },
    { id: "linkedin", name: "LinkedIn", icon: "💼", color: "#0A66C2", providers: ["linkedin", "linkedin_company"], connectProvider: "linkedin", extraConnect: { provider: "linkedin_company", label: "Connect LinkedIn Page", hint: "Company Page — unlocks real impressions, clicks and engagement" } },
    { id: "youtube", name: "YouTube", icon: "▶️", color: "#FF0000", providers: [], soon: true },
    { id: "tiktok", name: "TikTok", icon: "🎵", color: "#22D3EE", providers: [], soon: true },
  ];

  return (
    <Panel>
      <h2 style={panelTitle}>Connected accounts</h2>
      <p style={{ color: GREY, fontSize: 13, marginBottom: 16 }}>
        Connect once, then schedule and auto-post. Tokens are encrypted at rest.
      </p>

      <div className="grid gap-2 mb-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", display: "grid" }}>
        {PLATFORMS_UI.map((p) => {
          const conns = items.filter((c) => p.providers.includes(c.provider));
          const isOn = conns.length > 0;
          return (
            <div key={p.id} className="rounded-xl p-3"
                 style={{ background: `${LINE}`, border: `1px solid ${isOn ? p.color + "66" : `${LINE}`}` }}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span style={{ fontSize: 20 }}>{p.icon}</span>
                  <span className="text-sm font-semibold truncate">{p.name}</span>
                </div>
                {/* Status toggle */}
                <span
                  aria-label={isOn ? `${p.name} connected` : `${p.name} not connected`}
                  style={{
                    width: 34, height: 20, borderRadius: 999, position: "relative", flexShrink: 0,
                    background: isOn ? "#22C55E" : p.soon ? "rgba(250,204,21,0.25)" : "#FFFFFF",
                  }}
                >
                  <span style={{ position: "absolute", top: 2, left: isOn ? 16 : 2, width: 16, height: 16, borderRadius: 999, background: "#fff", opacity: p.soon ? 0.5 : 1, transition: "left .15s" }} />
                </span>
              </div>
              <div className="text-xs mt-2" style={{ color: isOn ? "#86efac" : p.soon ? "#FACC15" : GREY }}>
                {isOn
                  ? `● ${conns.map((c) => c.display_name || PROVIDER_LABEL[c.provider]).join(", ")}`
                  : p.soon ? "Coming soon" : "○ Not connected"}
              </div>
              <div className="mt-2 flex gap-2 flex-wrap">
                {p.soon ? (
                  <span className="text-xs" style={{ color: GREY }}>Awaiting platform approval</span>
                ) : isOn ? (
                  conns.map((c) => (
                    <button
                      key={c.id}
                      onClick={async () => {
                        if (requireSub()) return;
                        if (!confirm(`Disconnect ${c.display_name || p.name}?`)) return;
                        await disconnect({ data: { id: c.id } });
                        await reload();
                      }}
                      className="text-xs"
                      style={{ color: PURPLE, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                    >Disconnect {c.display_name || PROVIDER_LABEL[c.provider]}</button>
                  ))
                ) : (
                  <button
                    onClick={() => p.connectProvider && connect(p.connectProvider)}
                    disabled={busy}
                    className="text-xs font-semibold disabled:opacity-50"
                    style={{ background: "rgba(124,58,237,.18)", border: "1px solid rgba(124,58,237,.45)", color: "#F5F5FF", borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}
                  >Connect →</button>
                )}
                {p.id === "instagram" && !isOn && null}
              </div>
              {p.extraConnect && (
                <div className="mt-2">
                  <button
                    onClick={() => connect(p.extraConnect!.provider)}
                    disabled={busy}
                    className="text-xs font-semibold disabled:opacity-50"
                    style={{ background: "rgba(10,102,194,.18)", border: "1px solid rgba(10,102,194,.5)", color: "#F5F5FF", borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}
                  >{items.some((c) => c.provider === "linkedin_company") ? "Add another LinkedIn Page" : p.extraConnect.label} →</button>
                  <div className="text-xs mt-1" style={{ color: GREY }}>{p.extraConnect.hint}</div>
                </div>
              )}
              {isOn && p.connectProvider && (
                <button
                  onClick={() => connect(p.connectProvider!)}
                  disabled={busy}
                  className="text-xs mt-1 disabled:opacity-50"
                  style={{ color: GREY, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                >+ Add another {p.name} account</button>
              )}
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 6,
          padding: "10px 12px",
          borderRadius: 10,
          background: "rgba(250,204,21,0.07)",
          border: "1px solid rgba(250,204,21,0.22)",
          color: "#e7d9a6",
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        <strong>Facebook & Instagram auto-posting is pending Meta app review.</strong> You can still
        connect, plan and write everything here — until approval comes through, use{" "}
        <em>Copy caption</em> and <em>Download image</em> on a scheduled post and publish from the
        Meta app on your phone. LinkedIn auto-posts normally.
      </div>
      <p style={{ color: GREY, fontSize: 12, marginTop: 8 }}>
        YouTube & TikTok are coming soon. Personal Facebook profiles and Groups aren't supported by Meta's posting API.
      </p>
    </Panel>
  );
}
function Dot({ provider }: { provider: string }) {
  const color = provider === "linkedin" || provider === "linkedin_company" ? "#0A66C2"
    : provider === "facebook_page" ? "#1877F2"
    : provider === "instagram" ? "#E4405F" : "#7C3AED";
  return <span style={{ width: 10, height: 10, borderRadius: 999, background: color, display: "inline-block" }} />;
}
/* ---------------- Composer tab ---------------- */
function Composer({ locked, requireSub, onOpenConnections, initialCaption, initialMediaPath, isAnonymous }: { locked: boolean; requireSub: () => boolean; onOpenConnections: () => void; initialCaption?: string; initialMediaPath?: string | null; isAnonymous?: boolean }) {
  const fetchList = useServerFn(listConnections);
  const save = useServerFn(savePost);
  const createUpload = useServerFn(createUploadUrl);
  const readUrl = useServerFn(getMediaReadUrl);

  const [conns, setConns] = useState<Array<{ id: string; provider: string; display_name: string | null }>>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [caption, setCaption] = useState(initialCaption || "");
  const [mediaPath, setMediaPath] = useState<string | null>(initialMediaPath ?? null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (initialCaption) setCaption(initialCaption); }, [initialCaption]);
  useEffect(() => {
    if (!initialMediaPath) return;
    setMediaPath(initialMediaPath);
    readUrl({ data: { path: initialMediaPath } })
      .then((r) => setMediaPreview(r.url))
      .catch(() => {});
  }, [initialMediaPath, readUrl]);

  useEffect(() => {
    fetchList().then((r) => setConns(r.connections as never)).catch(() => {});
  }, []);

  const selectedProviders = useMemo(
    () => conns.filter((c) => selected.has(c.id)).map((c) => c.provider),
    [conns, selected],
  );
  const minLimit = useMemo(() => Math.min(...selectedProviders.map((p) => CHAR_LIMITS[p] ?? 3000), 3000), [selectedProviders]);
  const igSelected = selectedProviders.includes("instagram");

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    if (requireSub()) { if (e.target) e.target.value = ""; return; }
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const { path, token } = await createUpload({ data: { filename: f.name } });
      const { error } = await supabase.storage.from("scheduler-media")
        .uploadToSignedUrl(path, token, f, { contentType: f.type });
      if (error) throw error;
      setMediaPath(path);
      setMediaPreview(URL.createObjectURL(f));
      toast.success("Image uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally { setBusy(false); }
  }

  async function submit(schedule: boolean) {
    if (requireSub()) return;
    if (selected.size === 0) return toast.error("Pick at least one channel");
    if (!caption.trim() && !mediaPath) return toast.error("Add a caption or image");
    if (igSelected && !mediaPath) return toast.error("Instagram requires an image");
    if (schedule && !scheduledAt) return toast.error("Pick a date & time");
    setBusy(true);
    try {
      await save({
        data: {
          caption,
          media_path: mediaPath,
          media_url: null,
          scheduled_at: schedule ? new Date(scheduledAt).toISOString() : null,
          connection_ids: Array.from(selected),
          schedule,
        },
      });
      toast.success(schedule ? "Scheduled" : "Saved as draft");
      setCaption(""); setMediaPath(null); setMediaPreview(null); setSelected(new Set()); setScheduledAt("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setBusy(false); }
  }

  return (
    <Panel>
      <h2 style={panelTitle}>New post</h2>

      {conns.length === 0 && (
        <div className="mb-4 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-2 justify-between"
          style={{ background: "rgba(168,85,247,.12)", border: "1px solid rgba(168,85,247,.35)" }}>
          <div className="text-xs sm:text-sm" style={{ color: "#F5F5FF" }}>
            {isAnonymous
              ? "Sign in, then connect a social account to schedule & auto-post."
              : "Connect a social account to schedule & auto-post."}
          </div>
          <div className="flex gap-2 shrink-0">
            {isAnonymous && (
              <a href="/auth" className="px-3 py-1.5 rounded-lg font-bold text-xs"
                 style={{ background: `${LINE}`, border: `1px solid ${LINE}`, color: "#F5F5FF" }}>
                Sign in
              </a>
            )}
            <button onClick={onOpenConnections} className="px-3 py-1.5 rounded-lg font-bold text-xs"
              style={{ background: `linear-gradient(135deg, ${PURPLE}, #7C3AED)`, color: "#ffffff" }}>
              Connect →
            </button>
          </div>
        </div>
      )}

      <div className="mb-3">
        <Label>Channels</Label>
        <div className="flex flex-wrap gap-2">
          {conns.length === 0 && (
            <span className="text-xs" style={{ color: GREY }}>No channels connected yet.</span>
          )}
          {conns.map((c) => (
            <button key={c.id} onClick={() => toggle(c.id)}
              className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-2"
              style={{
                background: selected.has(c.id) ? PURPLE : `${SURFACE}`,
                color: selected.has(c.id) ? "#ffffff" : INDIGO,
                border: `1px solid ${LINE}`,
              }}>
              <Dot provider={c.provider} />
              {c.display_name || PROVIDER_LABEL[c.provider]}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <Label htmlFor="compose-caption">Caption</Label>
        <textarea
          id="compose-caption" name="caption"
          value={caption} onChange={(e) => setCaption(e.target.value)} rows={6}
          placeholder="What do you want to share?"
          className="w-full rounded-xl p-3 text-sm"
          style={{ background: "rgba(0,0,0,.35)", border: `1px solid ${LINE}`, color: "#F5F5FF", fontFamily: "inherit" }}
        />
        <div className="flex justify-between text-xs mt-1" style={{ color: caption.length > minLimit ? "#ef4444" : GREY }}>
          <span>{selectedProviders.length > 0 ? `Tightest limit: ${PROVIDER_LABEL[selectedProviders[0]]} ${minLimit}` : ""}</span>
          <span>{caption.length}/{minLimit}</span>
        </div>
      </div>

      <div className="mb-3">
        <Label htmlFor="compose-image">Image {igSelected && <span style={{ color: PURPLE }}>(required for Instagram)</span>}</Label>
        <input id="compose-image" name="image" ref={fileRef} type="file" accept="image/*" onChange={onFile} className="text-xs" />
        {mediaPreview && (
          <img src={mediaPreview} alt="Selected post image preview" className="mt-2 rounded-xl max-h-56 object-cover" />
        )}
      </div>

      <div className="mb-4">
        <Label htmlFor="compose-schedule">Schedule for</Label>
        <input id="compose-schedule" name="scheduled_at" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)}
          className="rounded-xl p-2 text-sm w-full sm:w-auto"
          style={{ background: "rgba(0,0,0,.35)", border: `1px solid ${LINE}`, color: "#F5F5FF" }} />
        <p className="text-xs mt-1" style={{ color: GREY }}>Leave blank to save as a draft.</p>
      </div>

      <div className="flex gap-2">
        <PrimaryBtn onClick={() => submit(true)} disabled={busy}>
          {busy ? "Saving…" : "Schedule post"}
        </PrimaryBtn>
        <GhostBtn onClick={() => submit(false)} disabled={busy}>Save draft</GhostBtn>
      </div>
    </Panel>
  );
}

/* ---------------- Calendar tab ---------------- */
const WRITTEN_KEY = "ie-written-posts";
type WrittenPost = { id: string; dbId?: string; topic: string; pillar?: string; format?: string; body: string; approved?: boolean; scheduled?: boolean; at?: number; scheduledAt?: string | null };

/* Pillar colour coding — shared between the tray and the calendar */
const PILLAR_COLORS = [PINK, "#22D3EE", "#FACC15", "#4ADE80", PURPLE, "#FB923C"];
function pillarColor(pillar?: string | null): string {
  const key = (pillar || "").trim().toLowerCase();
  if (!key) return "#7C3AED";
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PILLAR_COLORS[h % PILLAR_COLORS.length]!;
}
function readWrittenCache(): WrittenPost[] {
  try { const v = JSON.parse(localStorage.getItem(WRITTEN_KEY) || "[]"); return Array.isArray(v) ? v : []; }
  catch { return []; }
}
function writeWrittenCache(list: WrittenPost[]) {
  try { localStorage.setItem(WRITTEN_KEY, JSON.stringify(list.slice(0, 120))); } catch { /* ignore */ }
}

function CalendarView() {

  const fetchPosts = useServerFn(listPosts);
  const fetchConnections = useServerFn(listConnections);
  const save = useServerFn(savePost);
  const fetchContent = useServerFn(listContentPosts);
  const markScheduled = useServerFn(setContentStatus);
  const [items, setItems] = useState<QueuePost[]>([]);
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [selected, setSelected] = useState<string | null>(null);

  // Drag & drop: written posts → calendar slots
  const [written, setWritten] = useState<WrittenPost[]>([]);
  const [conns, setConns] = useState<Array<{ id: string; provider: string; display_name: string | null }>>([]);
  const [dragging, setDragging] = useState<{ kind: "written"; post: WrittenPost } | { kind: "scheduled"; post: QueuePost } | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ post: WrittenPost; date: Date; time: string; connIds: string[] } | null>(null);
  const [dropBusy, setDropBusy] = useState(false);

  async function reload() {
    try { const r = await fetchPosts(); setItems(r.posts as never); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Load failed"); }
  }
  useEffect(() => { reload(); }, []);
  useEffect(() => {
    const refresh = () => {
      setWritten(readWrittenCache());
      fetchContent({ data: {} })
        .then((rows) => {
          const mapped: WrittenPost[] = (rows as never as Array<Record<string, string | null>>).map((p) => ({
            id: (p['plan_slot'] as string) || (p['id'] as string),
            dbId: p['id'] as string,
            topic: (p['title'] as string) || String(p['caption'] ?? "").slice(0, 60),
            pillar: (p['pillar'] as string) || "",
            format: (p['platform'] as string) || "",
            body: String(p['caption'] ?? ""),
            approved: p['status'] !== "draft",
            scheduled: p['status'] === "scheduled" || p['status'] === "published",
            scheduledAt: (p['scheduled_at'] as string) ?? null,
          }));
          setWritten(mapped);
          writeWrittenCache(mapped);
        })
        .catch(() => { /* keep cached list */ });
    };
    refresh();
    window.addEventListener("ie:written-updated", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("ie:written-updated", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  useEffect(() => {
    fetchConnections()
      .then((r) => setConns((r.connections as never) ?? []))
      .catch(() => setConns([]));
  }, []);

  function openDropDialog(post: WrittenPost, date: Date) {
    setDrop({ post, date, time: "09:00", connIds: conns[0] ? [conns[0].id] : [] });
  }

  async function confirmDrop() {
    if (!drop) return;
    const manual = conns.length === 0 || drop.connIds.length === 0;
    const [h, m] = drop.time.split(":").map(Number);
    const when = new Date(drop.date);
    when.setHours(h || 0, m || 0, 0, 0);
    setDropBusy(true);
    try {
      if (manual) {
        // Manual mode: plan the slot in the content calendar without auto-posting.
        if (drop.post.dbId) {
          await markScheduled({ data: { id: drop.post.dbId, status: "scheduled", scheduled_at: when.toISOString() } });
        }
        const nextManual = written.map(w => (w.id === drop.post.id ? { ...w, approved: true, scheduled: true, scheduledAt: when.toISOString() } : w));
        setWritten(nextManual);
        writeWrittenCache(nextManual);
        try { window.dispatchEvent(new CustomEvent("ie:written-updated")); } catch { /* ignore */ }
        setDrop(null);
        toast.success(`Planned for ${when.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} — post it manually or connect an account to automate`);
        setDropBusy(false);
        return;
      }
      await save({
        data: {
          caption: drop.post.body.slice(0, 3000),
          scheduled_at: when.toISOString(),
          connection_ids: drop.connIds,
          schedule: true,
        },
      });
      if (drop.post.dbId) {
        try { await markScheduled({ data: { id: drop.post.dbId, status: "scheduled" } }); } catch { /* non-fatal */ }
      }
      const nextWritten = written.map(w => (w.id === drop.post.id ? { ...w, approved: true, scheduled: true } : w));
      setWritten(nextWritten);
      writeWrittenCache(nextWritten);
      try { window.dispatchEvent(new CustomEvent("ie:written-updated")); } catch { /* ignore */ }
      setDrop(null);
      toast.success(`Scheduled for ${when.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not schedule");
    } finally { setDropBusy(false); }
  }

  async function moveScheduled(post: QueuePost, date: Date) {
    if (!post.scheduled_at) return;
    const prev = new Date(post.scheduled_at);
    const when = new Date(date);
    when.setHours(prev.getHours(), prev.getMinutes(), 0, 0);
    const connection_ids = post.post_targets
      .map(t => (t as unknown as { connection_id?: string }).connection_id)
      .filter((v): v is string => !!v);
    try {
      await save({
        data: {
          id: post.id,
          caption: post.caption,
          media_url: post.media_url,
          scheduled_at: when.toISOString(),
          connection_ids: connection_ids.length ? connection_ids : conns.slice(0, 1).map(c => c.id),
          schedule: true,
        },
      });
      toast.success("Post moved");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not move post");
    }
  }

  function handleDrop(date: Date) {
    const d = dragging;
    setDragging(null); setDragOverKey(null);
    if (!d) return;
    if (d.kind === "written") openDropDialog(d.post, date);
    else moveScheduled(d.post, date);
  }



  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthName = cursor.toLocaleString(undefined, { month: "long", year: "numeric" });
  const firstDay = new Date(year, month, 1).getDay(); // 0 = Sun
  const offset = (firstDay + 6) % 7; // Mon-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date(); today.setHours(0,0,0,0);

  const byDay = useMemo(() => {
    const map: Record<string, QueuePost[]> = {};
    for (const p of items) {
      if (!p.scheduled_at) continue;
      const d = new Date(p.scheduled_at);
      if (d.getFullYear() !== year || d.getMonth() !== month) continue;
      const key = String(d.getDate());
      (map[key] = map[key] || []).push(p);
    }
    return map;
  }, [items, year, month]);

  const plannedByDay = useMemo(() => {
    const map: Record<string, WrittenPost[]> = {};
    for (const w of written) {
      if (!w.scheduledAt) continue;
      const d = new Date(w.scheduledAt);
      if (Number.isNaN(d.getTime())) continue;
      if (d.getFullYear() !== year || d.getMonth() !== month) continue;
      const key = String(d.getDate());
      (map[key] = map[key] || []).push(w);
    }
    return map;
  }, [written, year, month]);

  const cells: Array<{ day: number | null; date: Date | null }> = [];
  for (let i = 0; i < offset; i++) cells.push({ day: null, date: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, date: new Date(year, month, d) });
  while (cells.length % 7 !== 0) cells.push({ day: null, date: null });

  const dayLabels = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const selectedKey = selected;
  const selectedPosts = selectedKey ? (byDay[selectedKey] || []) : [];

  return (
    <Panel>
      <div className="flex items-center justify-between mb-4">
        <h2 style={panelTitle}>Calendar</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="px-2 py-1 rounded-lg text-sm font-bold"
            style={{ background: `${SURFACE}`, color: INDIGO }}>‹</button>
          <div className="text-sm font-bold min-w-[140px] text-center" style={{ color: "#F5F5FF" }}>{monthName}</div>
          <button onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="px-2 py-1 rounded-lg text-sm font-bold"
            style={{ background: `${SURFACE}`, color: INDIGO }}>›</button>
          <button onClick={() => { const d = new Date(); d.setDate(1); setCursor(d); }}
            className="px-2 py-1 rounded-lg text-xs ml-1"
            style={{ background: "rgba(168,85,247,.18)", color: "#c4b5fd" }}>Today</button>
        </div>
      </div>

      {written.length > 0 && (
        <div className="mb-4 rounded-xl p-3" style={{ background: "rgba(168,85,247,.06)", border: "1px dashed rgba(168,85,247,.35)" }}>
          <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "#c4b5fd" }}>
            Your captions — drag one onto a day
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {written.map(w => (
              <div
                key={w.id}
                draggable
                onDragStart={(e) => { setDragging({ kind: "written", post: w }); e.dataTransfer.effectAllowed = "copy"; e.dataTransfer.setData("text/plain", w.id); }}
                onDragEnd={() => { setDragging(null); setDragOverKey(null); }}
                onClick={() => openDropDialog(w, new Date(year, month, today.getMonth() === month && today.getFullYear() === year ? today.getDate() : 1))}
                title="Drag onto a calendar day (or click to pick a slot)"
                className="shrink-0 w-64 rounded-xl p-3 cursor-grab active:cursor-grabbing"
                style={{
                  background: "rgba(0,0,0,.3)",
                  border: `1px solid ${w.scheduled ? "rgba(34,197,94,.45)" : `${LINE}`}`,
                  borderLeft: `4px solid ${pillarColor(w.pillar)}`,
                }}
              >
                <div className="text-sm font-bold line-clamp-2" style={{ color: "#F5F5FF" }}>{w.topic}</div>
                <div className="text-[10px] mt-1 truncate" style={{ color: GREY }}>
                  {[w.format, w.pillar].filter(Boolean).join(" · ") || "Post"}{w.scheduled ? " · scheduled" : ""}
                </div>
                <div className="text-[11px] mt-2 line-clamp-4 leading-snug" style={{ color: INDIGO }}>{w.body.slice(0, 220)}</div>
              </div>
            ))}
          </div>
        </div>
      )}


      <div className="grid grid-cols-7 gap-1 mb-1">
        {dayLabels.map(l => (
          <div key={l} className="text-[10px] font-bold text-center uppercase py-1" style={{ color: GREY }}>{l}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((c, i) => {
          if (!c.day) return <div key={i} style={{ minHeight: 132 }} />;
          const key = String(c.day);
          const posts = byDay[key] || [];
          const planned = plannedByDay[key] || [];
          const isToday = c.date && c.date.getTime() === today.getTime();
          const isSel = selectedKey === key;
          const isOver = dragOverKey === key;
          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(isSel ? null : key)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(isSel ? null : key); } }}
              onDragOver={(e) => { if (dragging) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setDragOverKey(key); } }}
              onDragLeave={() => setDragOverKey(k => (k === key ? null : k))}
              onDrop={(e) => { e.preventDefault(); if (c.date) handleDrop(c.date); }}
              className="text-left rounded-lg p-2 transition cursor-pointer"
              style={{
                minHeight: 132,
                background: isOver ? "rgba(34,211,238,.22)" : isSel ? "rgba(168,85,247,.18)" : `${SURFACE}`,
                border: `1px solid ${isOver ? "#22D3EE" : isSel ? PURPLE : isToday ? "rgba(250,204,21,.5)" : `${LINE}`}`,
              }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold" style={{ color: isToday ? "#FACC15" : INDIGO }}>{c.day}</span>
                {posts.length > 0 && (
                  <span className="text-[9px] font-bold px-1.5 rounded" style={{ background: PURPLE, color: "#fff" }}>{posts.length}</span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                {posts.slice(0, 3).map(p => (
                  <div key={p.id} className="relative group">
                    <div className="text-[10px] px-1.5 py-1 rounded cursor-grab leading-tight"
                      draggable
                      onDragStart={(e) => { e.stopPropagation(); setDragging({ kind: "scheduled", post: p }); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", p.id); }}
                      onDragEnd={() => { setDragging(null); setDragOverKey(null); }}
                      style={{
                        background: p.status === "published" ? "rgba(34,197,94,.18)"
                          : p.status === "failed" ? "rgba(239,68,68,.2)"
                          : "rgba(124,58,237,.25)",
                        borderLeft: `3px solid ${pillarColor((p as unknown as { pillar?: string }).pillar)}`,
                        color: "#F5F5FF",
                      }}>
                      <div className="font-bold">{new Date(p.scheduled_at!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                      <div className="line-clamp-2">{p.caption.slice(0, 60)}</div>
                    </div>
                    <div
                      className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 w-64 rounded-xl p-3 opacity-0 group-hover:opacity-100 transition hidden group-hover:block"
                      style={{ background: "#FFFFFF", border: "1px solid rgba(168,85,247,.45)", boxShadow: "0 18px 40px rgba(0,0,0,.55)" }}
                    >
                      <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#c4b5fd" }}>
                        {new Date(p.scheduled_at!).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {p.status}
                      </div>
                      <div className="text-[11.5px] whitespace-pre-wrap leading-snug line-clamp-[12]" style={{ color: "#e6e6f5" }}>{p.caption}</div>
                    </div>
                  </div>
                ))}
                {planned.map(w => (
                  <div key={`p-${w.id}`} className="relative group">
                    <div className="text-[10px] px-1.5 py-1 rounded leading-tight"
                      style={{
                        background: `${pillarColor(w.pillar)}33`,
                        borderLeft: `3px solid ${pillarColor(w.pillar)}`,
                        color: "#F5F5FF",
                      }}>
                      <div className="font-bold">{new Date(w.scheduledAt!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                      <div className="line-clamp-2">{w.topic}</div>
                    </div>
                    <div
                      className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 w-64 rounded-xl p-3 hidden group-hover:block"
                      style={{ background: "#FFFFFF", border: "1px solid rgba(168,85,247,.45)", boxShadow: "0 18px 40px rgba(0,0,0,.55)" }}
                    >
                      <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#c4b5fd" }}>
                        {w.pillar || "Post"} · manual reminder
                      </div>
                      <div className="text-xs font-bold mb-1" style={{ color: "#F5F5FF" }}>{w.topic}</div>
                      <div className="text-[11.5px] whitespace-pre-wrap leading-snug line-clamp-[12]" style={{ color: "#e6e6f5" }}>{w.body}</div>
                    </div>
                  </div>
                ))}
                {posts.length > 3 && (
                  <div className="text-[10px]" style={{ color: GREY }}>+{posts.length - 3} more</div>
                )}
              </div>
            </div>
          );

        })}
      </div>

      {drop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => !dropBusy && setDrop(null)}
          style={{ background: "rgba(5,5,15,.75)", backdropFilter: "blur(6px)" }}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl p-4"
            style={{ background: "#FFFFFF", border: `1px solid ${LINE}` }}>
            <div className="text-sm font-bold mb-1" style={{ color: "#F5F5FF" }}>Schedule “{drop.post.topic}”</div>
            <div className="text-xs mb-3" style={{ color: GREY }}>
              {drop.date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
            </div>

            <label htmlFor="drop-time" className="text-[11px] font-bold uppercase" style={{ color: GREY }}>Time</label>
            <input id="drop-time" type="time" value={drop.time}
              onChange={(e) => setDrop(d => (d ? { ...d, time: e.target.value } : d))}
              className="w-full rounded-xl p-2 text-sm mb-3"
              style={{ background: "rgba(0,0,0,.35)", border: `1px solid ${LINE}`, color: "#F5F5FF" }} />

            <div className="text-[11px] font-bold uppercase mb-1" style={{ color: GREY }}>Accounts</div>
            {conns.length === 0 ? (
              <p className="text-xs mb-3" style={{ color: GREY }}>
                No account connected — this will be planned in your calendar as a manual reminder. Connect an account any time to auto-publish.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 mb-4">
                {conns.map(c => {
                  const on = drop.connIds.includes(c.id);
                  return (
                    <button key={c.id}
                      onClick={() => setDrop(d => d ? { ...d, connIds: on ? d.connIds.filter(x => x !== c.id) : [...d.connIds, c.id] } : d)}
                      className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-2"
                      style={{ background: on ? PURPLE : `${LINE}`, color: on ? "#fff" : INDIGO, border: `1px solid ${LINE}` }}>
                      <Dot provider={c.provider} />
                      {c.display_name || PROVIDER_LABEL[c.provider] || c.provider}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2">
              <PrimaryBtn onClick={confirmDrop} disabled={dropBusy}>
                {dropBusy ? "Saving…" : conns.length === 0 || drop.connIds.length === 0 ? "Add to calendar" : "Schedule post"}
              </PrimaryBtn>
              <GhostBtn onClick={() => setDrop(null)} disabled={dropBusy}>Cancel</GhostBtn>
            </div>
          </div>
        </div>
      )}


      {selectedPosts.length > 0 && (
        <div className="mt-4 pt-4 border-t" style={{ borderColor: `${LINE}` }}>
          <div className="text-xs font-bold mb-2" style={{ color: GREY }}>
            {selectedPosts.length} post{selectedPosts.length !== 1 ? "s" : ""} on {new Date(year, month, Number(selectedKey)).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
          </div>
          <div className="grid gap-2">
            {selectedPosts.map(p => (
              <div key={p.id} className="rounded-lg p-2 flex items-start gap-2"
                style={{ background: `${LINE}`, border: `1px solid ${LINE}` }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <StatusBadge status={p.status} />
                    <span className="text-[10px]" style={{ color: GREY }}>
                      {new Date(p.scheduled_at!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-xs line-clamp-2" style={{ color: "#F5F5FF" }}>{p.caption || <em style={{ color: GREY }}>(no caption)</em>}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {p.post_targets.map(t => (
                      <span key={t.id} className="text-[9px] px-1.5 py-0.5 rounded-full flex items-center gap-1"
                        style={{ background: `${SURFACE}`, color: INDIGO }}>
                        <Dot provider={t.social_connections?.provider ?? ""} />
                        {PROVIDER_LABEL[t.social_connections?.provider ?? ""] || "—"}
                      </span>
                    ))}
                  </div>
                </div>
                {p.media_url && <img src={p.media_url} alt="" className="w-12 h-12 object-cover rounded" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {items.filter(p => p.scheduled_at).length === 0 && (
        <div className="mt-3 text-xs text-center py-4" style={{ color: GREY }}>
          No scheduled posts yet. Use <strong>Compose</strong> to plan your first one.
        </div>
      )}
    </Panel>
  );
}

/* ---------------- Queue tab ---------------- */
type QueuePost = {
  id: string; caption: string; media_url: string | null; scheduled_at: string | null;
  status: string; last_error: string | null;
  post_targets: Array<{
    id: string; status: string; permalink: string | null; error_message: string | null;
    social_connections: { provider: string; display_name: string | null } | null;
  }>;
};
function Queue() {
  const fetchPosts = useServerFn(listPosts);
  const del = useServerFn(deletePost);
  const [items, setItems] = useState<QueuePost[]>([]);

  async function reload() {
    try { const r = await fetchPosts(); setItems(r.posts as never); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Load failed"); }
  }
  useEffect(() => {
    reload();
    const id = setInterval(reload, 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <Panel>
      <h2 style={panelTitle}>Queue</h2>
      {items.length === 0 && <div style={{ color: GREY, fontSize: 13 }}>No posts yet.</div>}
      <div className="grid gap-3">
        {items.map((p) => (
          <div key={p.id} className="rounded-xl p-3"
               style={{ background: `${LINE}`, border: `1px solid ${LINE}` }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <StatusBadge status={p.status} />
                  <span className="text-xs" style={{ color: GREY }}>
                    {p.scheduled_at ? new Date(p.scheduled_at).toLocaleString() : "Draft"}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap line-clamp-3" style={{ color: NAVY }}>
                  {p.caption || <em style={{ color: GREY }}>(no caption)</em>}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {p.post_targets.map((t) => (
                    <span key={t.id}
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1"
                      style={{
                        background: t.status === "published" ? "rgba(34,197,94,.18)"
                          : t.status === "failed" ? "rgba(239,68,68,.2)"
                          : "#FFFFFF",
                        color: t.status === "published" ? "#86efac"
                          : t.status === "failed" ? "#fca5a5" : INDIGO,
                      }}
                      title={t.error_message ?? ""}
                    >
                      <Dot provider={t.social_connections?.provider ?? ""} />
                      {t.social_connections?.display_name || PROVIDER_LABEL[t.social_connections?.provider ?? ""] || "—"}
                      {t.permalink && <a href={t.permalink} target="_blank" rel="noreferrer" style={{ marginLeft: 4, textDecoration: "underline" }}>view</a>}
                    </span>
                  ))}
                </div>
                {p.last_error && <div className="text-xs mt-2" style={{ color: "#fca5a5" }}>{p.last_error}</div>}
              </div>
              {p.media_url && <img src={p.media_url} alt="Scheduled post image" className="w-16 h-16 object-cover rounded-lg" />}
              <button onClick={async () => {
                if (!confirm("Delete this post?")) return;
                await del({ data: { id: p.id } }); await reload();
              }} className="text-xs" style={{ color: PURPLE }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
function StatusBadge({ status }: { status: string }) {
  const palette: Record<string, [string, string]> = {
    draft: ["#FFFFFF", INDIGO],
    scheduled: ["rgba(124,58,237,.25)", "#c4b5fd"],
    publishing: ["rgba(168,85,247,.2)", "#facc15"],
    published: ["rgba(34,197,94,.18)", "#86efac"],
    failed: ["rgba(239,68,68,.2)", "#fca5a5"],
    canceled: ["#FFFFFF", GREY],
  };
  const [bg, color] = palette[status] ?? palette.draft;
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase" style={{ background: bg, color }}>{status}</span>;
}

function Shell({ children, email, isAnonymous, onSignOut }: { children: React.ReactNode; email: string | null; isAnonymous: boolean; onSignOut: () => void }) {
  return (
    <AppShell title="Planner">
      <h1 className="sr-only">haaylo.com Social Planner — LinkedIn, Facebook & Instagram</h1>
      <div className="flex items-center justify-end gap-3 text-xs mb-4">
        {!isAnonymous && <span className="hidden sm:inline" style={{ color: GREY }}>{email}</span>}
        {isAnonymous ? (
          <Link to="/auth" style={{ color: PINK, fontWeight: 700 }}>Sign in</Link>
        ) : (
          <button onClick={onSignOut} style={{ color: PINK, fontWeight: 700 }}>Sign out</button>
        )}
      </div>
      <div className="flex justify-center">{children}</div>
    </AppShell>
  );
}
function Panel({ children }: { children: React.ReactNode }) {
  return <div className="w-full rounded-3xl p-5 sm:p-7" style={{ background: "#FFFFFF", border: `1px solid ${LINE}`, boxShadow: "0 30px 80px rgba(20,20,40,0.16)", backdropFilter: "blur(14px)" }}>{children}</div>;
}
const panelTitle: React.CSSProperties = { fontFamily: "'Archivo Black', sans-serif", fontSize: 20, marginBottom: 10 };
function Card({ children }: { children: React.ReactNode }) {
  return <div className="w-full max-w-md rounded-3xl p-6 sm:p-9 text-center" style={{ background: "#FFFFFF", border: `1px solid ${LINE}`, boxShadow: "0 30px 80px rgba(20,20,40,0.16)", backdropFilter: "blur(14px)" }}>{children}</div>;
}
function H1({ children }: { children: React.ReactNode }) {
  return <h1 className="text-[26px] sm:text-[34px]" style={{ fontFamily: "'Archivo Black', sans-serif", lineHeight: 1, marginBottom: 12 }}>{children}</h1>;
}
function Y({ children }: { children: React.ReactNode }) { return <span style={{ color: PURPLE }}>{children}</span>; }
function P({ children }: { children: React.ReactNode }) {
  return <p style={{ color: GREY, marginBottom: 18, fontSize: 14, lineHeight: 1.55 }}>{children}</p>;
}
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div style={{ color: PURPLE, fontSize: 11, letterSpacing: ".18em", fontWeight: 800, marginBottom: 6 }}>{children}</div>;
}
function Price({ amount, suffix }: { amount: string; suffix: string }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "baseline", gap: 6, marginBottom: 18, fontFamily: "'Archivo Black', sans-serif" }}>
      <span style={{ fontSize: 44, color: PURPLE }}>{amount}</span>
      <span style={{ fontSize: 14, color: GREY }}>{suffix}</span>
    </div>
  );
}
function Label({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return <label htmlFor={htmlFor} className="text-xs font-bold uppercase mb-1.5 block" style={{ color: GREY, letterSpacing: ".1em" }}>{children}</label>;
}
function PrimaryBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="px-5 py-3 rounded-xl font-bold transition disabled:opacity-50"
      style={{ background: `linear-gradient(135deg, ${PURPLE}, #3B82F6)`, color: "#ffffff", fontSize: 14 }}>
      {children}
    </button>
  );
}
function GhostBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="px-5 py-3 rounded-xl font-semibold transition disabled:opacity-50"
      style={{ background: "transparent", color: "#F5F5FF", border: `1px solid ${LINE}`, fontSize: 14 }}>
      {children}
    </button>
  );
}
function Centered({ text }: { text: string }) {
  return <div style={{ color: GREY, fontSize: 14 }}>{text}</div>;
}
