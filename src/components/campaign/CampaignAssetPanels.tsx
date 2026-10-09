import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { generateGuideCover } from "@/lib/magnet.functions";
import { useServerFn } from "@tanstack/react-start";
import {
  listCampaignAssets,
  updateCampaignBankItem,
  updateCampaignGuide,
  updateCampaignGuideCover,
  updateCampaignLandingCopy,
  updateCampaignPost,
  listPhaseEmails,
  updatePhaseEmail,
  type CampaignAssets,
  type PhaseEmail,
} from "@/lib/campaign-assets.functions";
import { phaseDef } from "@/lib/phases";
import { requestToolApproval } from "@/lib/tool-registry/approvals.functions";
import {
  refineCampaignText,
  REFINE_ACTIONS,
  REFINE_LABELS,
  type RefineAction,
} from "@/lib/campaign-refine.functions";

/** Which workbench tab a panel belongs to. */
export type CampaignTab =
  | "overview"
  | "strategy"
  | "content"
  | "email"
  | "leads"
  | "schedule"
  | "analytics"
  /** Content studio & scheduler: content, email and scheduling together. */
  | "studio";

import {
  SURFACE,
  NAVY,
  INDIGO,
  PINK,
  GREY,
  LINE,
  TINT,
  font,
  PURPLE,
} from "@/lib/theme";
import { refinePostGraphic } from "@/lib/image.functions";
import { getContentPost, type ContentPost } from "@/lib/content.functions";
import { PostEditorDrawer } from "@/components/content/PostEditorDrawer";
import { ImageTweakControl } from "@/components/ImageTweakControl";
import { useImageRenderQueue } from "@/hooks/useImageRenderQueue";
import { ImageStatusTile } from "./ImageStatusTile";

const MUTED = GREY;

const panel: React.CSSProperties = {
  borderRadius: 16,
  border: `1px solid ${LINE}`,
  background: SURFACE,
  padding: 16,
  minWidth: 0,
};

const field: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 10,
  border: `1px solid ${LINE}`,
  background: "#FFFFFF",
  color: NAVY,
  fontSize: 13.5,
  padding: "9px 11px",
  fontFamily: font,
};

const saveBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "none",
  background: PINK,
  color: "#FFFFFF",
  fontSize: 12.5,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: font,
};

const linkBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 12px",
  borderRadius: 10,
  border: `1px solid ${LINE}`,
  color: INDIGO,
  fontSize: 12.5,
  fontWeight: 700,
  textDecoration: "none",
  fontFamily: font,
};

function H({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: NAVY, fontFamily: font }}>{children}</h2>
      {action}
    </div>
  );
}

function useSaver(run: (v: unknown) => Promise<unknown>) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const save = useCallback(
    async (payload: unknown) => {
      setState("saving");
      try {
        await run(payload);
        setState("saved");
        setMessage("");
        setTimeout(() => setState("idle"), 1800);
      } catch (e) {
        setState("error");
        setMessage(e instanceof Error ? e.message : "That didn't save. Try again.");
      }
    },
    [run],
  );
  return { state, message, save };
}

function SaveRow({ state, message, onSave }: { state: string; message: string; onSave: () => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 10 }}>
      <button type="button" style={saveBtn} onClick={onSave} disabled={state === "saving"}>
        {state === "saving" ? "Saving…" : "Save changes"}
      </button>
      {state === "saved" && <span style={{ fontSize: 12.5, color: TINT.greenInk }}>Saved</span>}
      {state === "error" && <span style={{ fontSize: 12.5, color: "#C0334B" }}>{message}</span>}
    </div>
  );
}

/** Rewrite actions for one piece of copy, plus a route through to scheduling. */
function AssetActions({
  projectId,
  kind,
  text,
  onText,
}: {
  projectId: string | null;
  kind: "post" | "email" | "landing";
  text: string;
  onText: (next: string) => void;
}) {
  const refineFn = useServerFn(refineCampaignText);
  const [busy, setBusy] = useState<RefineAction | null>(null);
  const [error, setError] = useState("");

  async function run(action: RefineAction) {
    if (!projectId) {
      setError("Pick a workspace first.");
      return;
    }
    setBusy(action);
    setError("");
    try {
      const res = await refineFn({ data: { projectId, kind, action, text } });
      onText(res.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      {REFINE_ACTIONS.map((a) => (
        <button
          key={a}
          type="button"
          style={{ ...linkBtn, cursor: "pointer", background: "transparent", opacity: busy ? 0.6 : 1 }}
          disabled={busy !== null}
          onClick={() => void run(a)}
        >
          {busy === a ? "Rewriting…" : REFINE_LABELS[a]}
        </button>
      ))}
      <Link to="/calendar" style={linkBtn}>
        Approve &amp; schedule
      </Link>
      {error && <span style={{ fontSize: 12.5, color: "#C0334B" }}>{error}</span>}
    </div>
  );
}

export function CampaignAssetPanels({
  campaignId,
  show,
  reloadKey,
  tab = "overview",
  projectId = null,
  currentPhase = null,
}: {
  campaignId: string;
  show: { posts: boolean; landing: boolean; guide: boolean; emails: boolean; images: boolean; blog?: boolean };
  reloadKey: number;
  tab?: CampaignTab;
  projectId?: string | null;
  currentPhase?: number | null;
}) {
  const listFn = useServerFn(listCampaignAssets);
  const [assets, setAssets] = useState<CampaignAssets | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listFn({ data: { campaignId } });
        if (!cancelled) setAssets(data);
      } catch {
        if (!cancelled) setAssets(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId, listFn, reloadKey]);

  if (!assets) return null;

  const visiblePosts = currentPhase == null
    ? assets.posts
    : assets.posts.filter((post) => post.phase === currentPhase);

  const on = (t: CampaignTab) =>
    tab === "overview" ||
    tab === t ||
    (tab === "studio" && (t === "content" || t === "email" || t === "schedule"));

  return (
    <div style={{ display: "grid", gap: 14, marginTop: 20 }}>
      {on("content") && show.posts && (
        <PostsPanel posts={visiblePosts} projectId={projectId} currentPhase={currentPhase} />
      )}
      {on("leads") && show.landing && assets.landing && <LandingPanel landing={assets.landing} />}
      {on("leads") && show.guide && (assets.guide.title || assets.guide.sections.length > 0) && (
        <GuidePanel campaignId={campaignId} guide={assets.guide} projectId={projectId} />
      )}
      {on("email") && show.emails && (
        <PhaseEmailsPanel campaignId={campaignId} reloadKey={reloadKey} projectId={projectId} />
      )}
      {on("email") && show.emails && assets.emails.length > 0 && (
        <BankPanel title="Email sequence" items={assets.emails} projectId={projectId} />
      )}
      {on("content") && show.blog !== false && assets.blog && (
        <BlogPanel blog={assets.blog} projectId={projectId} />
      )}
      {on("content") && show.images && assets.images.length > 0 && <ImagesPanel items={assets.images} projectId={projectId} />}
    </div>
  );
}

function PostsPanel({ posts, projectId, currentPhase }: { posts: CampaignAssets["posts"]; projectId: string | null; currentPhase: number | null }) {
  const getPost = useServerFn(getContentPost);
  const [rows, setRows] = useState(posts);
  useEffect(() => setRows(posts), [posts]);
  const [editing, setEditing] = useState<ContentPost | null>(null);

  async function openEditor(id: string) {
    try {
      setEditing(await getPost({ data: { id } }));
    } catch {
      /* row may have been removed; leave the list as it is */
    }
  }

  return (
    <section style={panel}>
      <H action={<Link to="/bank" style={linkBtn}>Open Content Bank</Link>}>
        {currentPhase == null ? "Campaign posts" : `Phase ${currentPhase} campaign posts`} ({rows.length})
      </H>
      {rows.length === 0 ? (
        <p style={{ margin: 0, color: MUTED, fontSize: 13.5 }}>
          {currentPhase == null ? "No campaign posts generated yet." : `No campaign posts generated for Phase ${currentPhase} yet.`}
        </p>
      ) : <div style={{ display: "grid", gap: 8 }}>
        {rows.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => void openEditor(p.id)}
            style={{
              all: "unset",
              cursor: "pointer",
              display: "block",
              width: "100%",
              boxSizing: "border-box",
              borderRadius: 12,
              border: `1px solid ${LINE}`,
              padding: 10,
              color: NAVY,
              fontWeight: 700,
              fontSize: 13.5,
              overflowWrap: "anywhere",
            }}
          >
            {p.title || p.caption.slice(0, 70) || "Untitled post"}
            {p.platform && <span style={{ color: MUTED, fontWeight: 600 }}> · {p.platform}</span>}
          </button>
        ))}
      </div>}
      <PostEditorDrawer
        post={editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) =>
          setRows((r) => r.map((x) => (x.id === saved.id ? { ...x, title: saved.title ?? "", caption: saved.caption } : x)))
        }
      />
    </section>
  );
}

function LandingPanel({ landing }: { landing: NonNullable<CampaignAssets["landing"]> }) {
  const updateFn = useServerFn(updateCampaignLandingCopy);
  const [headline, setHeadline] = useState(landing.headline);
  const [subheadline, setSubheadline] = useState(landing.subheadline);
  const { state, message, save } = useSaver((v) => updateFn({ data: v as never }));

  return (
    <section style={panel}>
      <H
        action={
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link to="/landing/$id" params={{ id: landing.id }} style={linkBtn}>Open in page builder</Link>
            <a href={`/p/${landing.slug}`} target="_blank" rel="noreferrer" style={linkBtn}>View live page</a>
          </span>
        }
      >
        Landing page
      </H>
      <div style={{ display: "grid", gap: 8 }}>
        <textarea style={{ ...field, minHeight: 60, resize: "vertical" }} aria-label="Headline" value={headline} onChange={(e) => setHeadline(e.target.value)} />
        <textarea style={{ ...field, minHeight: 70, resize: "vertical" }} aria-label="Subheadline" value={subheadline} onChange={(e) => setSubheadline(e.target.value)} />
        <SaveRow state={state} message={message} onSave={() => save({ id: landing.id, headline, subheadline })} />
      </div>
    </section>
  );
}

function GuidePanel({ campaignId, guide, projectId }: { campaignId: string; guide: CampaignAssets["guide"]; projectId: string | null }) {
  const updateFn = useServerFn(updateCampaignGuide);
  const coverFn = useServerFn(generateGuideCover);
  const updateCoverFn = useServerFn(updateCampaignGuideCover);
  const [cover, setCover] = useState<string | null>(guide.coverUrl);
  useEffect(() => setCover(guide.coverUrl), [guide.coverUrl]);
  const [coverState, setCoverState] = useState<"idle" | "working" | "error">("idle");
  const makeCover = async () => {
    setCoverState("working");
    try {
      const res = await coverFn({ data: { campaignId } });
      setCover(res.coverUrl);
      setCoverState("idle");
    } catch {
      setCoverState("error");
    }
  };
  const [title, setTitle] = useState(guide.title);
  const [intro, setIntro] = useState(guide.intro);
  const [sections, setSections] = useState(guide.sections);
  const { state, message, save } = useSaver((v) => updateFn({ data: v as never }));

  return (
    <section style={panel}>
      <H action={<a href={`/guide/${campaignId}`} target="_blank" rel="noreferrer" style={linkBtn}>View &amp; download PDF</a>}>
        Lead magnet guide
      </H>
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          {cover ? (
            <img
              src={cover}
              alt="Guide cover"
              style={{ width: 96, height: 128, objectFit: "cover", borderRadius: 10 }}
            />
          ) : null}
          <div style={{ display: "grid", gap: 4 }}>
            <button type="button" style={linkBtn} onClick={() => void makeCover()} disabled={coverState === "working"}>
              {coverState === "working" ? "Designing the cover…" : cover ? "Make another cover" : "Generate cover image"}
            </button>
            <span style={{ fontSize: 12, color: GREY }}>
              {coverState === "error"
                ? "The cover didn't come back — try again."
                : "Built in your brand colours and shown on the guide and its PDF."}
            </span>
            {cover ? (
              <ImageTweakControl
                compact
                disabled={!projectId}
                onApply={async (instruction) => {
                  if (!projectId) throw new Error("Pick a workspace first, then try again.");
                  const next = await refinePostGraphic({ data: { imageUrl: cover, instruction, projectId } });
                  await updateCoverFn({ data: { campaignId, coverUrl: next.url } });
                  setCover(next.url);
                }}
              />
            ) : null}
          </div>
        </div>
        <input style={field} aria-label="Guide title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea style={{ ...field, minHeight: 90, resize: "vertical" }} aria-label="Guide intro" value={intro} onChange={(e) => setIntro(e.target.value)} />
        {sections.map((s, i) => (
          <div key={i} style={{ display: "grid", gap: 6, borderTop: `1px solid ${LINE}`, paddingTop: 8 }}>
            <input
              style={field}
              aria-label={`Section ${i + 1} heading`}
              value={s.heading}
              onChange={(e) => setSections((arr) => arr.map((x, j) => (j === i ? { ...x, heading: e.target.value } : x)))}
            />
            <textarea
              style={{ ...field, minHeight: 120, resize: "vertical" }}
              aria-label={`Section ${i + 1} body`}
              value={s.body}
              onChange={(e) => setSections((arr) => arr.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))}
            />
          </div>
        ))}
        <SaveRow state={state} message={message} onSave={() => save({ campaignId, title, intro, sections })} />
      </div>
    </section>
  );
}

/**
 * Shows the written email the way it will land in an inbox, in a clean
 * Mailchimp-style layout, and offers to put it into Mailchimp. Because it
 * reaches real subscribers, the send goes through the approval step.
 */
function MailchimpBox({
  projectId,
  subject,
  body,
}: {
  projectId: string | null;
  subject: string;
  body: string;
}) {
  const requestFn = useServerFn(requestToolApproval);
  const [when, setWhen] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function sync() {
    if (!projectId) return;
    setState("sending");
    setMessage("");
    try {
      await requestFn({
        data: {
          tool: "send_email_campaign",
          workspaceId: projectId,
          input: {
            subject,
            body,
            campaignTitle: subject.slice(0, 100) || "Haaylo email",
            scheduledAt: when ? new Date(when).toISOString() : null,
          },
        },
      });
      setState("sent");
      setMessage("Waiting for your approval on the Approvals screen.");
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : "That didn't go through. Try again.");
    }
  }

  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ background: SURFACE, borderRadius: 12, padding: 14 }}>
        <div
          style={{
            maxWidth: 600,
            margin: "0 auto",
            background: "#FFFFFF",
            borderRadius: 12,
            border: `1px solid ${LINE}`,
            padding: 20,
          }}
        >
          <div style={{ borderTop: `4px solid ${PURPLE}`, marginBottom: 14 }} />
          <h4 style={{ margin: "0 0 12px", fontSize: 17, color: NAVY, lineHeight: 1.3 }}>
            {subject || "Subject line"}
          </h4>
          {paragraphs.map((p, i) => (
            <p key={i} style={{ margin: "0 0 12px", fontSize: 13.5, lineHeight: 1.65, color: NAVY }}>
              {p}
            </p>
          ))}
          <p style={{ margin: "18px 0 0", fontSize: 11, color: GREY }}>Unsubscribe</p>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <label style={{ fontSize: 12, color: NAVY }}>
          Send time{" "}
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            style={{ ...field, width: "auto", display: "inline-block", padding: "6px 8px" }}
          />
        </label>
        <button
          type="button"
          onClick={() => void sync()}
          disabled={state === "sending" || !projectId || !subject.trim() || !body.trim()}
          style={{
            padding: "9px 14px",
            borderRadius: 10,
            border: "none",
            background: PURPLE,
            color: "#FFFFFF",
            fontWeight: 700,
            fontSize: 12.5,
            cursor: "pointer",
          }}
        >
          ⚡ {state === "sending" ? "Sending to Mailchimp…" : "Sync & Schedule in Mailchimp"}
        </button>
        {message && (
          <span style={{ fontSize: 12, color: state === "error" ? PINK : NAVY }}>{message}</span>
        )}
      </div>
      <p style={{ margin: 0, fontSize: 11.5, color: GREY }}>
        Leave the time blank to create it in Mailchimp without a send date. Nothing goes out until you
        approve it.
      </p>
    </div>
  );
}

/** The campaign's long-form article. */
function BlogPanel({ blog, projectId }: { blog: NonNullable<CampaignAssets["blog"]>; projectId: string | null }) {
  const updateFn = useServerFn(updateCampaignBankItem);
  const [row, setRow] = useState(blog);
  useEffect(() => setRow(blog), [blog]);
  const { state, message, save } = useSaver((v) => updateFn({ data: v as never }));

  return (
    <section style={panel}>
      <H action={<Link to="/bank" style={linkBtn}>Open Content Bank</Link>}>
        Blog article · {row.readMinutes} min read
      </H>
      <div style={{ display: "grid", gap: 8 }}>
        <input
          style={field}
          aria-label="Article title"
          value={row.title}
          onChange={(e) => setRow({ ...row, title: e.target.value })}
        />
        <textarea
          style={{ ...field, minHeight: 300, resize: "vertical" }}
          aria-label="Article body"
          value={row.body}
          onChange={(e) => setRow({ ...row, body: e.target.value })}
        />
        <AssetActions
          projectId={projectId}
          kind="post"
          text={row.body}
          onText={(next) => setRow((r) => ({ ...r, body: next }))}
        />
        <SaveRow state={state} message={message} onSave={() => save({ id: row.id, title: row.title, body: row.body })} />
      </div>
    </section>
  );
}

function BankPanel({
  title,
  items,
  projectId,
}: {
  title: string;
  items: CampaignAssets["emails"];
  projectId: string | null;
}) {
  const updateFn = useServerFn(updateCampaignBankItem);
  const [rows, setRows] = useState(items);
  useEffect(() => setRows(items), [items]);
  const { state, message, save } = useSaver((v) => updateFn({ data: v as never }));
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);

  return (
    <section style={panel}>
      <H action={<Link to="/bank"  style={linkBtn}>Open Content Bank</Link>}>
        {title} ({rows.length})
      </H>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((it) => {
          const open = openId === it.id;
          return (
            <div key={it.id} style={{ borderRadius: 12, border: `1px solid ${LINE}`, padding: 10 }}>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : it.id)}
                style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", color: NAVY, fontWeight: 700, fontSize: 13.5, overflowWrap: "anywhere" }}
              >
                {it.title || "Untitled email"}
              </button>
              {open && (
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  <input
                    style={field}
                    aria-label="Email subject"
                    value={it.title}
                    onChange={(e) => setRows((r) => r.map((x) => (x.id === it.id ? { ...x, title: e.target.value } : x)))}
                  />
                  <textarea
                    style={{ ...field, minHeight: 170, resize: "vertical" }}
                    aria-label="Email body"
                    value={it.body}
                    onChange={(e) => setRows((r) => r.map((x) => (x.id === it.id ? { ...x, body: e.target.value } : x)))}
                  />
                  <AssetActions
                    projectId={projectId}
                    kind="email"
                    text={it.body}
                    onText={(next) => setRows((r) => r.map((x) => (x.id === it.id ? { ...x, body: next } : x)))}
                  />
                  <SaveRow state={state} message={message} onSave={() => save({ id: it.id, title: it.title, body: it.body })} />
                  <MailchimpBox projectId={projectId} subject={it.title.replace(/^\d+\.\s*/, "")} body={it.body} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Launch emails written per phase for 30-day campaigns. */
function PhaseEmailsPanel({
  campaignId,
  reloadKey,
  projectId,
}: {
  campaignId: string;
  reloadKey: number;
  projectId: string | null;
}) {
  const listFn = useServerFn(listPhaseEmails);
  const updateFn = useServerFn(updatePhaseEmail);
  const [rows, setRows] = useState<PhaseEmail[]>([]);
  const { state, message, save } = useSaver((v) => updateFn({ data: v as never }));
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listFn({ data: { campaignId } });
        if (!cancelled) setRows(data);
      } catch {
        if (!cancelled) setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId, listFn, reloadKey]);

  if (rows.length === 0) return null;

  return (
    <section style={panel}>
      <H>Launch emails ({rows.length})</H>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((e) => {
          const open = openId === e.id;
          return (
            <div key={e.id} style={{ borderRadius: 12, border: `1px solid ${LINE}`, padding: 10 }}>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : e.id)}
                style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", color: NAVY, fontWeight: 700, fontSize: 13.5, overflowWrap: "anywhere" }}
              >
                <span style={{ color: PINK, marginRight: 8 }}>Phase {e.phase} · {phaseDef(e.phase).label}</span>
                {e.subject || "Untitled email"}
              </button>
              {open && (
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  <input
                    style={field}
                    aria-label="Email subject"
                    value={e.subject}
                    onChange={(ev) => setRows((r) => r.map((x) => (x.id === e.id ? { ...x, subject: ev.target.value } : x)))}
                  />
                  <textarea
                    style={{ ...field, minHeight: 170, resize: "vertical" }}
                    aria-label="Email body"
                    value={e.body}
                    onChange={(ev) => setRows((r) => r.map((x) => (x.id === e.id ? { ...x, body: ev.target.value } : x)))}
                  />
                  <AssetActions
                    projectId={projectId}
                    kind="email"
                    text={e.body}
                    onText={(next) => setRows((r) => r.map((x) => (x.id === e.id ? { ...x, body: next } : x)))}
                  />
                  <SaveRow state={state} message={message} onSave={() => save({ id: e.id, subject: e.subject, body: e.body })} />
                  <MailchimpBox projectId={projectId} subject={e.subject} body={e.body} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ImagesPanel({ items, projectId }: { items: CampaignAssets["images"]; projectId: string | null }) {
  const updateFn = useServerFn(updateCampaignBankItem);
  const [rows, setRows] = useState(items);
  useEffect(() => setRows(items), [items]);
  const { state, message, save } = useSaver((v) => updateFn({ data: v as never }));
  const { view, retry } = useImageRenderQueue(items);

  return (
    <section style={panel}>
      <H action={<Link to="/image" style={linkBtn}>Open Image Generator</Link>}>Image pack ({rows.length})</H>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
        {rows.map((row) => {
          const v = view(row);
          const im = { ...row, url: v.url ?? row.url, path: v.path ?? row.path };
          return (
          <div key={im.id} style={{ borderRadius: 12, border: `1px solid ${LINE}`, padding: 10, minWidth: 0 }}>
            <ImageStatusTile view={{ ...v, url: im.url }} alt={im.title || "Campaign image"} onRetry={() => retry(im.id)} />
            {im.url ? <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>Awaiting visual approval</div> : null}
            {im.url ? (
              <div style={{ marginTop: 8 }}>
                <ImageTweakControl
                  compact
                  disabled={!projectId}
                  onApply={async (instruction) => {
                    if (!projectId) throw new Error("Pick a workspace first, then try again.");
                    const next = await refinePostGraphic({
                      data: { instruction, projectId, ...(im.path ? { imagePath: im.path } : { imageUrl: im.url ?? undefined }) },
                    });
                    await updateFn({ data: { id: im.id, title: im.title, body: im.body, imageUrl: next.url, imagePath: next.path } });
                    setRows((current) => current.map((item) => item.id === im.id ? { ...item, url: next.url, path: next.path } : item));
                  }}
                />
              </div>
            ) : null}
            <input
              style={{ ...field, marginTop: 8 }}
              aria-label="Image label"
              value={im.title}
              onChange={(e) => setRows((r) => r.map((x) => (x.id === im.id ? { ...x, title: e.target.value } : x)))}
            />
            <textarea
              style={{ ...field, minHeight: 90, marginTop: 8, resize: "vertical" }}
              aria-label="Image brief"
              value={im.body}
              onChange={(e) => setRows((r) => r.map((x) => (x.id === im.id ? { ...x, body: e.target.value } : x)))}
            />
            <SaveRow state={state} message={message} onSave={() => save({ id: im.id, title: im.title, body: im.body })} />
          </div>
          );
        })}
      </div>
    </section>
  );
}
