import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { listCampaignAssets, listPhaseEmails, type PhaseEmail, type CampaignAssets } from "@/lib/campaign-assets.functions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Copy, ArrowUpRight } from "lucide-react";
import type { CampaignTab } from "@/components/campaign/CampaignAssetPanels";
import { SURFACE, NAVY, PURPLE, PINK, GREY, LINE, TINT, font } from "@/lib/theme";

/** Small caps tag at the top of every asset card. */
function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: ".12em",
        textTransform: "uppercase",
        color: GREY,
        fontFamily: font,
      }}
    >
      {children}
    </span>
  );
}

function Card({ tag, onOpen, children }: { tag: string; onOpen: () => void; children: React.ReactNode }) {
  return (
    <Button variant="outline" onClick={onOpen} className="h-auto min-w-0 w-full flex-col items-stretch justify-start gap-3 whitespace-normal rounded-lg bg-card p-4 text-left text-card-foreground hover:bg-accent/40">
      <Tag>{tag}</Tag>
      {children}
    </Button>
  );
}

function previewText(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/^[#>*-]+\s*/gm, "").replace(/\*\*/g, "").trim();
}

function Empty({ label }: { label: string }) {
  return (
    <p style={{ margin: 0, fontSize: 12.5, color: GREY, fontFamily: font }}>{label}</p>
  );
}

const title3: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 700,
  color: NAVY,
  fontFamily: font,
  lineHeight: 1.35,
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

/**
 * The four headline outputs of a campaign — email, social, image and blog —
 * shown as a single row of cards. Clicking one opens its workbench tab.
 */
export function CampaignAssetGrid({
  campaignId,
  reloadKey = 0,
  brandName,
  brandColour = PURPLE,
  headline,
  currentPhase = null,
  onOpenTab,
}: {
  campaignId: string;
  reloadKey?: number;
  brandName: string;
  brandColour?: string;
  headline?: string;
  currentPhase?: number | null;
  onOpenTab?: (tab: CampaignTab) => void;
}) {
  const listFn = useServerFn(listCampaignAssets);
  const phaseFn = useServerFn(listPhaseEmails);
  const [phaseEmails, setPhaseEmails] = useState<PhaseEmail[]>([]);
  const [preview, setPreview] = useState<"email" | "blog" | null>(null);
  const [selectedEmail, setSelectedEmail] = useState(0);
  const [copyStatus, setCopyStatus] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [assets, setAssets] = useState<CampaignAssets | null>(null);
  const [viewImage, setViewImage] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setAssets(null);
    setPhaseEmails([]);
    setSelectedEmail(0);
    setLoadError(false);
    (async () => {
      try {
        const [data, emails] = await Promise.all([
          listFn({ data: { campaignId } }), phaseFn({ data: { campaignId } }),
        ]);
        if (!cancelled) { setAssets(data); setPhaseEmails(emails); }
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId, listFn, phaseFn, reloadKey]);

  const open = (tab: CampaignTab) => () => onOpenTab?.(tab);

  const phasePosts = currentPhase == null
    ? (assets?.posts ?? [])
    : (assets?.posts ?? []).filter((item) => item.phase === currentPhase);
  const emails = [
    ...phaseEmails.filter(e => currentPhase == null || e.phase === currentPhase).map(e => ({ id: e.id, title: e.subject, body: e.body })),
    ...(assets?.emails ?? []),
  ];
  const email = emails[0] ?? null;
  const activeEmail = emails[selectedEmail] ?? email;
  const post = phasePosts[0] ?? null;
  const image = assets?.images.find((i) => i.url) ?? assets?.images[0] ?? null;
  const blog = assets?.blog ?? null;
  const activePreview = preview === "email" ? activeEmail : blog;
  const emptyLabel = (label: string) => loadError ? "Couldn’t load content. Please try again." : !assets ? "Loading content…" : label;
  async function copyPreview() {
    if (!activePreview) return;
    try {
      await navigator.clipboard.writeText(`${activePreview.title}\n\n${previewText(activePreview.body)}`);
      setCopyStatus("Copied");
    } catch { setCopyStatus("Couldn’t copy. Please try again."); }
  }
  const overlayTitle = headline || assets?.landing?.headline || "";

  return (
    <div style={{ display: "grid", gap: 14, marginBottom: 14 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
          alignItems: "stretch",
        }}
      >
        {/* Email */}
        <Card tag="✉ Email" onOpen={() => { setPreview("email"); setCopyStatus(""); }}>
          {email ? (
            <>
              <h3 style={title3}>{email.title.replace(/^\d+\.\s*/, "")}</h3>
              <p className="m-0 line-clamp-4 break-words text-sm font-normal leading-relaxed text-foreground">{previewText(email.body)}</p>
              <span className="mt-auto flex items-center justify-between gap-2 text-sm text-primary"><span>{emails.length} {emails.length === 1 ? "email" : "emails"} · Preview & copy</span><ArrowUpRight className="size-4 shrink-0" /></span>
            </>
          ) : (
            <><Empty label={emptyLabel("No emails written yet.")} /><span className="text-sm text-primary">Open emails →</span></>
          )}
        </Card>

        {/* Campaign posts */}
        <Card tag="Campaign Posts" onOpen={open("content")}>
          {post ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 999,
                    background: TINT.purple,
                    color: TINT.purpleInk,
                    display: "grid",
                    placeItems: "center",
                    fontSize: 12,
                    fontWeight: 800,
                    fontFamily: font,
                  }}
                >
                  {brandName.slice(0, 1).toUpperCase()}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: NAVY, fontFamily: font }}>
                  {brandName}
                </span>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: NAVY,
                  fontFamily: font,
                  lineHeight: 1.45,
                  display: "-webkit-box",
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {post.caption}
              </p>
              <span style={{ marginTop: "auto", fontSize: 12, color: GREY, fontFamily: font }}>
                {phasePosts.length} {phasePosts.length === 1 ? "post" : "posts"} generated
              </span>
            </>
          ) : (
            <Empty label="No campaign posts generated yet." />
          )}
        </Card>

        {/* Image */}
        <Card tag="🖼 Image" onOpen={open("content")}>
          {image?.url ? (
            <div
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: "1 / 1",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <img
                src={image.url}
                alt={image.title || "Campaign image"}
                loading="lazy"
                onClick={(e) => { e.stopPropagation(); setViewImage(true); }}
                title="Click to view larger"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", cursor: "zoom-in" }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "flex-end",
                  padding: 12,
                  pointerEvents: "none",
                  background: "linear-gradient(180deg, rgba(23,29,65,0) 35%, rgba(23,29,65,0.72) 100%)",
                }}
              >
                <span
                  style={{
                    color: "#FFFFFF",
                    fontFamily: font,
                    fontSize: 14,
                    fontWeight: 700,
                    lineHeight: 1.3,
                    borderLeft: `3px solid ${brandColour}`,
                    paddingLeft: 8,
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {overlayTitle}
                </span>
              </div>
            </div>
          ) : (
            <Empty label="No images generated yet." />
          )}
        </Card>

        {/* Blog */}
        <Card tag="📝 Blog" onOpen={() => { setPreview("blog"); setCopyStatus(""); }}>
          {blog ? (
            <>
              <h3 style={title3}>{blog.title}</h3>
              <p className="m-0 line-clamp-4 break-words text-sm font-normal leading-relaxed text-foreground">{previewText(blog.body)}</p>
              <span className="flex items-center justify-between text-sm text-primary">Preview & copy<ArrowUpRight className="size-4" /></span>
              <span
                style={{
                  marginTop: "auto",
                  fontSize: 10.5,
                  fontWeight: 800,
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                  color: GREY,
                  fontFamily: font,
                }}
              >
                {blog.readMinutes} min read
              </span>
            </>
          ) : (
            <><Empty label={emptyLabel("No article written yet.")} /><span className="text-sm text-primary">Open blog →</span></>
          )}
        </Card>
      </div>

      <Dialog open={viewImage && Boolean(image?.url)} onOpenChange={(isOpen) => { if (!isOpen) setViewImage(false); }}>
        <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-lg text-foreground">
          <DialogTitle className="pr-6 leading-snug">{image?.title || "Campaign image"}</DialogTitle>
          <DialogDescription>{brandName}</DialogDescription>
          {image?.url ? (
            <img
              src={image.url}
              alt={image.title || "Campaign image, full size"}
              style={{ width: "100%", borderRadius: 10, border: "1px solid #E6E6EC", display: "block" }}
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                if (image?.url) {
                  try { sessionStorage.setItem("haaylo:studio-image", image.url); } catch { /* storage unavailable */ }
                }
                setViewImage(false);
                void navigate({ to: "/image" });
              }}
            >
              <ArrowUpRight className="size-4" />Open in studio — add logo or text
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={preview !== null} onOpenChange={(isOpen) => { if (!isOpen) setPreview(null); }}>
        <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-lg text-foreground">
          <DialogTitle className="pr-6 leading-snug">{preview === "email" ? "Email preview" : "Blog preview"}</DialogTitle>
          <DialogDescription>{brandName}</DialogDescription>
          {preview === "email" && emails.length > 1 && <div className="flex flex-wrap gap-2" aria-label="Emails in sequence">
            {emails.map((item, index) => <Button key={item.id} size="sm" variant={selectedEmail === index ? "default" : "outline"} aria-pressed={selectedEmail === index} onClick={() => { setSelectedEmail(index); setCopyStatus(""); }}>Email {index + 1}</Button>)}
          </div>}
          {activePreview ? <article className="min-w-0 border-y border-border py-5">
            <h3 className="mb-4 break-words text-xl font-semibold">{activePreview.title}</h3>
            <div className="whitespace-pre-wrap break-words text-sm leading-7">{previewText(activePreview.body)}</div>
          </article> : <p>{emptyLabel(preview === "email" ? "No emails written yet." : "No article written yet.")}</p>}
          <div className="flex flex-wrap gap-2">
            {activePreview && <Button variant="outline" onClick={() => void copyPreview()}><Copy className="size-4" />Copy {preview === "email" ? "email" : "blog"}</Button>}
            <Button onClick={() => { onOpenTab?.(preview === "email" ? "email" : "content"); setPreview(null); }}><ArrowUpRight className="size-4" />{activePreview ? "Open editor" : preview === "email" ? "Open emails" : "Open content studio"}</Button>
          </div>
          {copyStatus && <p role="status" className="text-sm">{copyStatus}</p>}
        </DialogContent>
      </Dialog>

      <CampaignTimelineRail
        hasDrafts={phasePosts.length > 0}
        ready={phasePosts.length > 0 && (assets?.emails.length ?? 0) > 0}
        approved={(assets?.publishedCount ?? 0) > 0 || !!assets?.nextScheduledAt}
        scheduledAt={assets?.nextScheduledAt ?? null}
      />
    </div>
  );
}

function formatSlot(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase();
  const time = d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
  return `${day} ${time}`;
}

/** Where this campaign has got to, from first draft through to a booked slot. */
export function CampaignTimelineRail({
  hasDrafts,
  ready,
  approved,
  scheduledAt,
}: {
  hasDrafts: boolean;
  ready: boolean;
  approved: boolean;
  scheduledAt: string | null;
}) {
  const steps = [
    { label: "Send", icon: "🧭", done: true },
    { label: "Draft", icon: "✓", done: hasDrafts },
    { label: "Ready", icon: "✓", done: ready },
    { label: "Approved", icon: "✓", done: approved },
    {
      label: scheduledAt ? `Scheduled · ${formatSlot(scheduledAt)}` : "Scheduled",
      icon: "🟢",
      done: !!scheduledAt,
    },
  ];
  const activeIndex = steps.reduce((acc, s, i) => (s.done ? i : acc), 0);

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
        border: `1px solid ${LINE}`,
        background: SURFACE,
        borderRadius: 14,
        padding: "10px 12px",
      }}
    >
      {steps.map((s, i) => (
        <span key={s.label} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Chip label={s.label} icon={s.icon} active={i === activeIndex} done={s.done} />
          {i < steps.length - 1 && (
            <span style={{ color: GREY, fontSize: 12, fontFamily: font }} aria-hidden>
              ›
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

function Chip({
  label,
  icon,
  active,
  done,
}: {
  label: string;
  icon: string;
  active: boolean;
  done: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 11px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: ".06em",
        textTransform: "uppercase",
        fontFamily: font,
        whiteSpace: "nowrap",
        border: `1px solid ${active ? "transparent" : LINE}`,
        background: active ? PINK : done ? "#FFFFFF" : "transparent",
        color: active ? "#FFFFFF" : done ? NAVY : GREY,
        boxShadow: active && hover ? "0 8px 20px -10px rgba(229,70,131,0.8)" : "none",
        transition: "box-shadow .2s ease, background .2s ease",
      }}
    >
      <span aria-hidden>{icon}</span>
      {label}
    </span>
  );
}
