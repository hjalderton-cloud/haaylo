import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  saveContentPost,
  setContentStatus,
  duplicateContentPost,
  type ContentPost,
} from "@/lib/content.functions";
import { PostImageZone } from "@/components/content/PostImageZone";
import { platformKey, platformLabel } from "@/components/PlatformIcon";
import { BG, LINE, NAVY, PINK, SURFACE, TINT, font } from "@/lib/theme";

/**
 * One editing surface for a post, used on every screen. Slides in from the
 * right so the user never leaves the page they were working on. Every save
 * writes to the same content_posts row, so calendar, campaign and package
 * views all stay in step.
 */

const LIMITS: Record<string, number> = { instagram: 2200, linkedin: 3000, facebook: 63206, x: 280, tiktok: 2200 };

const pad = (n: number) => String(n).padStart(2, "0");

function splitWhen(iso: string | null): { date: string; time: string } {
  const d = iso ? new Date(iso) : (() => { const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(9, 0, 0, 0); return t; })();
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

export function whenLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}, ${d
    .toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })
    .replace(" ", "")}`;
}

type Props = {
  post: ContentPost | null;
  onClose: () => void;
  /** Called with the saved row after any change, so the host list can update in place. */
  onSaved: (post: ContentPost) => void;
  /** Called when a copy is made, so the host list can show it. */
  onDuplicated?: (post: ContentPost) => void;
};

export function PostEditorDrawer({ post, onClose, onSaved, onDuplicated }: Props) {
  const saveFn = useServerFn(saveContentPost);
  const statusFn = useServerFn(setContentStatus);
  const dupFn = useServerFn(duplicateContentPost);

  const [current, setCurrent] = useState<ContentPost | null>(post);
  const [caption, setCaption] = useState("");
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("linkedin");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCurrent(post);
    if (!post) return;
    setCaption(post.caption ?? "");
    setTitle(post.title ?? "");
    setPlatform(platformKey(post.platform ?? "linkedin"));
    const w = splitWhen(post.scheduled_at);
    setDate(post.scheduled_at ? w.date : "");
    setTime(w.time);
  }, [post]);

  useEffect(() => {
    if (!post) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [post, onClose]);

  const open = !!current && !!post;
  const p = current;
  const published = p?.status === "published";
  const max = LIMITS[platform] ?? 3000;
  const over = caption.length > max;
  const needsMedia = platform === "instagram" && !p?.media_url;

  const whenIso = (): string | null => {
    if (!date) return null;
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    return new Date(y, m - 1, d, hh || 0, mm || 0).toISOString();
  };

  async function persist(next: { status?: ContentPost["status"]; scheduled_at?: string | null }) {
    if (!p) return null;
    const saved = await saveFn({
      data: {
        id: p.id,
        project_id: p.project_id,
        caption,
        title: title || null,
        platform,
        pillar: p.pillar,
        status: next.status ?? p.status,
        scheduled_at: next.scheduled_at !== undefined ? next.scheduled_at : p.scheduled_at,
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
    setCurrent(saved);
    onSaved(saved);
    return saved;
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(async () => {
      if (published) return void toast.message("Published posts can't be changed.");
      const iso = whenIso();
      if (iso && new Date(iso).getTime() < Date.now()) return void toast.error("That time has already passed. Pick a later slot.");
      // Clearing the date on a scheduled post moves it back to drafts.
      const status = iso ? (p!.status === "draft" ? p!.status : "scheduled") : p!.status === "scheduled" ? "draft" : p!.status;
      await persist({ status, scheduled_at: iso });
      toast.success("Saved");
      onClose();
    });

  const approveSchedule = () =>
    run(async () => {
      const iso = whenIso() ?? (() => { const w = splitWhen(null); const [y, m, d] = w.date.split("-").map(Number); return new Date(y, m - 1, d, 9, 0).toISOString(); })();
      if (new Date(iso).getTime() < Date.now()) return void toast.error("That time has already passed. Pick a later slot.");
      await persist({});
      const prev = p!;
      const saved = await statusFn({ data: { id: prev.id, status: "scheduled", scheduled_at: iso } });
      onSaved(saved);
      onClose();
      toast.success(`Scheduled for ${whenLabel(iso)}`, {
        action: {
          label: "Undo",
          onClick: () => {
            void statusFn({ data: { id: prev.id, status: prev.status, scheduled_at: prev.scheduled_at } }).then(onSaved);
          },
        },
      });
    });

  const moveToDrafts = () =>
    run(async () => {
      const prev = p!;
      const saved = await statusFn({ data: { id: prev.id, status: "draft", scheduled_at: null } });
      onSaved(saved);
      onClose();
      toast.success("Moved to drafts", {
        action: {
          label: "Undo",
          onClick: () => void statusFn({ data: { id: prev.id, status: prev.status, scheduled_at: prev.scheduled_at } }).then(onSaved),
        },
      });
    });

  const duplicate = () =>
    run(async () => {
      const copy = await dupFn({ data: { id: p!.id } });
      onDuplicated?.(copy);
      toast.success("Copy added to drafts");
    });

  const stateLabel = published ? "Published" : p?.status === "scheduled" && p.scheduled_at ? `Scheduled ${whenLabel(p.scheduled_at)}` : p?.status === "approved" ? "Approved" : "Draft";

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden
        style={{
          position: "fixed", inset: 0, background: "rgba(23,29,65,0.25)", zIndex: 70,
          opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none", transition: "opacity .2s",
        }}
      />
      <aside
        role="dialog"
        aria-label="Edit post"
        aria-hidden={!open}
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, width: "min(420px, 100vw)", zIndex: 71,
          background: "#FFFFFF", borderLeft: `1px solid ${LINE}`, boxShadow: "-8px 0 24px rgba(23,29,65,0.12)",
          transform: open ? "none" : "translateX(105%)", transition: "transform .2s ease",
          overflowY: "auto", padding: 18, fontFamily: font, color: NAVY,
        }}
      >
        {p && (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 17 }}>Edit post</h2>
                <p style={{ margin: "2px 0 0", fontSize: 13, opacity: 0.7 }}>
                  {platformLabel(platform)} · {stateLabel}
                </p>
              </div>
              <button onClick={onClose} aria-label="Close" style={ghost}>✕</button>
            </div>

            <label style={lab}>
              <span>Title <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></span>
              <input style={field} value={title} onChange={(e) => setTitle(e.target.value)} disabled={published} />
            </label>

            <label style={lab}>
              Post text
              <textarea
                style={{ ...field, minHeight: 200, resize: "vertical", lineHeight: 1.5 }}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                disabled={published}
              />
              <small style={{ fontWeight: 400, color: over ? TINT.pinkInk : NAVY, opacity: over ? 1 : 0.6 }}>
                {caption.length.toLocaleString("en-GB")} / {max.toLocaleString("en-GB")} characters
              </small>
            </label>

            <label style={lab}>
              Platform
              <select style={field} value={platform} onChange={(e) => setPlatform(e.target.value)} disabled={published}>
                <option value="linkedin">LinkedIn</option>
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
              </select>
            </label>

            <div style={{ display: "grid", gap: 6 }}>
              <strong style={{ fontSize: 13 }}>Image or video</strong>
              <PostImageZone
                postId={p.id}
                caption={caption}
                title={title}
                platform={platform}
                projectId={p.project_id}
                mediaUrl={p.media_url}
                mediaPath={p.media_path}
                meta={p.meta as Record<string, unknown> | null}
                size="editor"
                onChange={(next) => {
                  const merged = { ...p, ...(next as unknown as Partial<ContentPost>) };
                  setCurrent(merged);
                  onSaved(merged);
                }}
              />
              {needsMedia && (
                <p style={{ margin: 0, fontSize: 12, color: TINT.pinkInk }}>Instagram posts need an image or video.</p>
              )}
            </div>

            {!published && (
              <div style={{ display: "grid", gap: 6 }}>
                <strong style={{ fontSize: 13 }}>Schedule</strong>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="date" style={{ ...field, flex: 1 }} value={date} onChange={(e) => setDate(e.target.value)} />
                  <input type="time" style={{ ...field, width: 120 }} value={time} onChange={(e) => setTime(e.target.value)} />
                </div>
                <small style={{ opacity: 0.6 }}>UK time. Leave the date empty to keep it as a draft.</small>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 4 }}>
              {!published && (
                <button style={ghost} disabled={busy} onClick={save}>{busy ? "Saving…" : "Save changes"}</button>
              )}
              {!published && p.status !== "scheduled" && (
                <button style={primary} disabled={busy} onClick={approveSchedule}>Approve &amp; schedule</button>
              )}
              <button style={ghost} disabled={busy} onClick={duplicate}>Duplicate</button>
              {p.status === "scheduled" && (
                <button style={ghost} disabled={busy} onClick={moveToDrafts}>Move to drafts</button>
              )}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

const lab: React.CSSProperties = { display: "grid", gap: 6, fontSize: 13, fontWeight: 600 };
const field: React.CSSProperties = {
  font: "inherit", fontWeight: 400, fontSize: 14, width: "100%", border: `1px solid ${LINE}`,
  background: SURFACE, color: NAVY, borderRadius: 10, padding: "9px 11px", boxSizing: "border-box",
};
const ghost: React.CSSProperties = {
  font: "inherit", fontSize: 13, cursor: "pointer", border: `1px solid ${LINE}`, background: "#FFFFFF",
  color: NAVY, borderRadius: 9, padding: "7px 13px",
};
const primary: React.CSSProperties = { ...ghost, background: PINK, borderColor: PINK, color: BG, fontWeight: 600 };
