import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generatePostGraphic, generatePostCarousel, refinePostGraphic, saveStudioDesign } from "@/lib/image.functions";
import { getBrain } from "@/lib/brain.functions";
import { listBrainAssets } from "@/lib/brain-assets.functions";
import { setPostImage } from "@/lib/content.functions";
import { parseSlides } from "@/lib/carousel";
import { GraphicStudio, type StudioAsset } from "@/components/GraphicStudio";
import type { Layer } from "@/components/GraphicStudio";
import { renderCarouselDesign, type CarouselDesign } from "@/lib/carousel-design";
import { tweakCarouselDesign } from "@/lib/carousel-design";
import { ImageTweakControl } from "@/components/ImageTweakControl";

export type CarouselSlide = {
  index: number;
  path: string;
  url: string;
  heading: string;
  body: string;
  design?: CarouselDesign;
};

type Props = {
  postId: string;
  caption: string;
  title?: string | null;
  platform?: string | null;
  projectId?: string | null;
  mediaUrl: string | null;
  mediaPath?: string | null;
  meta?: Record<string, unknown> | null;
  size?: "card" | "editor";
  onChange: (next: {
    media_url: string | null;
    media_path: string | null;
    meta?: Record<string, unknown> | null;
  }) => void;
};

type BrandKit = {
  name: string;
  colors: string;
  font?: string;
  logoUrl: string | null;
  assets: StudioAsset[];
};

const PINK = "#E54683";
const NAVY = "#171D41";

const btn: React.CSSProperties = {
  flex: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "7px 10px",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  color: NAVY,
  background: "#FFFFFF",
  border: "1px solid #E6E6EC",
  pointerEvents: "auto",
};

function ImageBox({
  postId,
  caption,
  title,
  platform,
  projectId,
  mediaUrl,
  mediaPath,
  size = "card",
  containImage = false,
  brandKit,
  onChange,
}: Props & { containImage?: boolean; brandKit: BrandKit }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"generate" | "upload" | null>(null);
  const [progress, setProgress] = useState(0);
  const [hover, setHover] = useState(false);
  const [lift, setLift] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);

  const editor = size === "editor";

  async function openStudio() {
    setViewing(false);
    setStudioOpen(true);
  }

  async function persist(url: string | null, path: string | null) {
    onChange({ media_url: url, media_path: path });
    try {
      await setPostImage({ data: { id: postId, media_url: url, media_path: path } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the image on this post.");
    }
  }

  async function generate() {
    if ((caption ?? "").trim().length < 10) {
      toast.error("Add a bit more caption first — there's not enough to work from.");
      return;
    }
    setBusy("generate");
    try {
      const out = await generatePostGraphic({
        data: {
          caption: caption.slice(0, 8000),
          ...(title ? { title } : {}),
          ...(projectId ? { projectId } : {}),
          ...(platform ? { platform } : {}),
        },
      });
      if (!out.url) throw new Error("No image came back — try again.");
      await persist(out.url, out.path);
      toast.success("Image added to the post.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Image generation failed.");
    } finally {
      setBusy(null);
    }
  }

  async function upload(file: File) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error("Use a PNG, JPG or WebP image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("That image is over 10MB — try a smaller file.");
      return;
    }
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) {
      toast.error("Please sign in again and retry.");
      return;
    }
    setBusy("upload");
    setProgress(0);
    const form = new FormData();
    form.append("postId", postId);
    form.append("file", file);

    await new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/post-image");
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const out = JSON.parse(xhr.responseText) as { url: string; path: string };
            onChange({ media_url: out.url, media_path: out.path });
            toast.success("Image added to the post.");
          } catch {
            toast.error("Upload finished but the image could not be read.");
          }
        } else {
          toast.error(xhr.responseText || "Upload failed.");
        }
        resolve();
      };
      xhr.onerror = () => {
        toast.error("Upload failed — check your connection.");
        resolve();
      };
      xhr.send(form);
    });
    setBusy(null);
    setProgress(0);
  }

  function remove() {
    if (!window.confirm("Remove this image from the post?")) return;
    void persist(null, null);
  }

  async function tweak(instruction: string) {
    if (!projectId) throw new Error("Pick a workspace first, then try again.");
    const out = await refinePostGraphic({
      data: {
        instruction,
        projectId,
        ...(mediaPath ? { imagePath: mediaPath } : { imageUrl: mediaUrl ?? undefined }),
      },
    });
    if (!out.url) throw new Error("No revised image came back.");
    await persist(out.url, out.path);
    toast.success("Image updated.");
  }

  const hiddenInput = (
    <input
      ref={fileRef}
      type="file"
      accept="image/png,image/jpeg,image/webp"
      style={{ display: "none" }}
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) void upload(f);
      }}
    />
  );

  if (busy) {
    const h = editor ? (mediaUrl ? 240 : 120) : mediaUrl ? 120 : 80;
    return (
      <div
        style={{
          position: "relative",
          height: h,
          borderRadius: 10,
          overflow: "hidden",
          border: mediaUrl ? "none" : "1px dashed #CECDD4",
        }}
      >
        {mediaUrl ? (
          <img
            src={mediaUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: containImage ? "contain" : "cover", display: "block", filter: "blur(2px)", opacity: 0.5 }}
          />
        ) : null}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            gap: 8,
            padding: 10,
            background: "rgba(4,10,24,.62)",
            backdropFilter: "blur(2px)",
          }}
        >
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              border: "2px solid rgba(255,255,255,.18)",
              borderTopColor: PINK,
              animation: "haaylo-spin .8s linear infinite",
            }}
          />
          <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.95 }}>
            {busy === "generate" ? "Creating an on-brand image…" : `Uploading… ${progress}%`}
          </span>
          {busy === "upload" ? (
            <div style={{ width: "70%", height: 4, borderRadius: 4, background: "rgba(255,255,255,.14)" }}>
              <div
                style={{ width: `${progress}%`, height: "100%", borderRadius: 4, background: PINK, transition: "width .2s" }}
              />
            </div>
          ) : null}
        </div>
        <style>{"@keyframes haaylo-spin{to{transform:rotate(360deg)}}"}</style>
      </div>
    );
  }

  if (mediaUrl) {
    return (
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ position: "relative", borderRadius: 10, overflow: "hidden" }}
      >
        {hiddenInput}
        <img
          src={mediaUrl}
          alt="Paired post image"
          onClick={() => setViewing(true)}
          title="Click to view larger"
          style={{ width: "100%", height: editor ? 240 : 120, objectFit: containImage ? "contain" : "cover", display: "block", cursor: "zoom-in" }}
        />
        <div
          style={{
            position: editor ? "static" : "absolute",
            inset: editor ? undefined : 0,
            display: "flex",
            gap: 8,
            alignItems: editor ? "center" : "flex-end",
            justifyContent: editor ? "flex-start" : "center",
            padding: editor ? "8px 0 0" : 10,
            flexWrap: "wrap",
            background: editor
              ? "transparent"
              : "linear-gradient(to top, rgba(4,10,24,.75), rgba(4,10,24,0))",
            opacity: editor || hover ? 1 : 0,
            transition: "opacity .15s",
            pointerEvents: editor ? "auto" : "none",
          }}
        >
          <button style={{ ...btn, flex: "0 0 auto" }} onClick={() => fileRef.current?.click()}>
            Replace
          </button>
          <button style={{ ...btn, flex: "0 0 auto" }} onClick={() => void generate()}>
            Regenerate
          </button>
          <button style={{ ...btn, flex: "0 0 auto" }} onClick={() => setViewing(true)}>
            View
          </button>
          <button
            style={{ ...btn, flex: "0 0 auto", color: "#FFB4C6", borderColor: "rgba(255,92,147,.45)" }}
            onClick={remove}
          >
            Remove
          </button>
          {editor ? <ImageTweakControl compact onApply={tweak} disabled={!projectId} /> : null}
        </div>

        {viewing ? (
          <div
            onClick={() => setViewing(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 60,
              background: "rgba(10,15,36,.7)",
              display: "grid",
              placeItems: "center",
              padding: 16,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "#FFFFFF",
                borderRadius: 14,
                padding: 14,
                width: "min(720px, 96vw)",
                maxHeight: "92vh",
                overflow: "auto",
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <strong style={{ color: NAVY, fontSize: 13 }}>Post image</strong>
                <button style={{ ...btn, flex: "0 0 auto" }} onClick={() => setViewing(false)}>
                  Close
                </button>
              </div>
              <img
                src={mediaUrl}
                alt="Post image, full size"
                style={{ width: "100%", borderRadius: 10, border: "1px solid #E6E6EC", display: "block", background: "#FFFFFF" }}
              />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={btn} onClick={() => void openStudio()}>
                  🎨 Open in studio — add logo or text
                </button>
                <ImageTweakControl onApply={tweak} disabled={!projectId} />
              </div>
            </div>
          </div>
        ) : null}

        {studioOpen ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 61,
              background: "rgba(10,15,36,.45)",
              display: "grid",
              placeItems: "center",
              padding: 16,
            }}
          >
            <div
              style={{
                background: "#FFFFFF",
                borderRadius: 14,
                padding: 14,
                width: "min(1000px, 96vw)",
                maxHeight: "92vh",
                overflow: "auto",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <strong style={{ color: NAVY }}>Design studio</strong>
                <button style={{ ...btn, flex: "0 0 auto" }} onClick={() => setStudioOpen(false)}>
                  Close
                </button>
              </div>
              <GraphicStudio
                size="1080x1080"
                backgroundSrc={mediaUrl}
                brandName={brandKit.name}
                brandColors={brandKit.colors}
                brandFont={brandKit.font}
                logoUrl={brandKit.logoUrl}
                brandAssets={brandKit.assets}
                exportLabel="Save to this post"
                onExport={(urls) => {
                  const dataUrl = urls[0];
                  if (!dataUrl) return;
                  void (async () => {
                    try {
                      const saved = await saveStudioDesign({ data: { dataUrl } });
                      await persist(saved.url, saved.path);
                      setStudioOpen(false);
                      toast.success("Image updated on the post.");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Could not save that design.");
                    }
                  })();
                }}
              />
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      onMouseEnter={() => setLift(true)}
      onMouseLeave={() => setLift(false)}
      style={{
        height: editor ? 96 : 80,
        borderRadius: 10,
        border: "1px dashed #CECDD4",
        background: lift ? "#F6F7FA" : "#FFFFFF",
        boxShadow: lift ? "0 6px 18px rgba(0,0,0,.28)" : "none",
        transform: lift ? "translateY(-1px)" : "none",
        transition: "all .15s",
        display: "flex",
        gap: 8,
        alignItems: "center",
        padding: 10,
      }}
    >
      {hiddenInput}
      <button style={btn} onClick={() => void generate()}>
        ✨ Generate image
      </button>
      <button style={btn} onClick={() => fileRef.current?.click()}>
        ⬆ Upload image
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Carousel-aware wrapper                                              */
/* ------------------------------------------------------------------ */

function readCarousel(meta?: Record<string, unknown> | null): CarouselSlide[] {
  const c = meta?.["carousel"] as { slides?: unknown } | undefined;
  const raw = Array.isArray(c?.slides) ? c.slides : [];
  return raw
    .filter((s): s is CarouselSlide => Boolean(s) && typeof (s as CarouselSlide).url === "string")
    .map((s, i) => ({ ...s, index: typeof s.index === "number" ? s.index : i }));
}

export function PostImageZone(props: Props) {
  const { postId, caption, title, projectId, meta, onChange } = props;
  const slides = useMemo(() => readCarousel(meta), [meta]);
  const parsed = useMemo(() => parseSlides(caption ?? ""), [caption]);
  const [building, setBuilding] = useState<string | null>(null);
  const [studio, setStudio] = useState<CarouselSlide | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [brandKit, setBrandKit] = useState<BrandKit>({ name: "", colors: "", logoUrl: null, assets: [] });

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void Promise.all([
      getBrain({ data: { projectId } }),
      listBrainAssets({ data: { projectId } }),
    ]).then(([b, assets]) => {
      if (cancelled) return;
      const brain = (b as { data?: { business?: { name?: string }; brand?: { colors?: string; primary_color?: string; secondary_color?: string; accent_color?: string; font_preference?: string } } }).data ?? {};
      const list = (assets ?? []) as { id: string; kind: string; url: string | null; label?: string | null }[];
      const savedColors = [brain.brand?.primary_color, brain.brand?.secondary_color, brain.brand?.accent_color].filter(Boolean).join(",");
      setBrandKit({
        name: brain.business?.name ?? "",
        colors: savedColors || brain.brand?.colors || "",
        font: brain.brand?.font_preference,
        logoUrl: list.find((x) => x.kind === "logo")?.url ?? null,
        assets: list.filter((x) => x.kind === "image" && x.url).map((x) => ({ id: x.id, url: x.url ?? "", label: x.label })),
      });
    }).catch(() => { /* Brand assets remain optional. */ });
    return () => { cancelled = true; };
  }, [projectId]);

  async function saveSet(next: CarouselSlide[], first?: { url: string; path: string }) {
    const nextMeta: Record<string, unknown> = {
      ...(meta ?? {}),
      carousel: next.length ? { slides: next, created_at: new Date().toISOString() } : null,
    };
    const media = first ?? (next[0] ? { url: next[0].url, path: next[0].path } : null);
    onChange({
      media_url: media?.url ?? props.mediaUrl,
      media_path: media?.path ?? null,
      meta: nextMeta,
    });
    try {
      await setPostImage({
        data: {
          id: postId,
          media_url: media?.url ?? props.mediaUrl,
          media_path: media?.path ?? null,
          meta: nextMeta,
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the carousel on this post.");
    }
  }

  async function buildCarousel() {
    if (parsed.length < 2) return;
    if (!projectId) {
      toast.error("Pick a workspace first, then try again.");
      return;
    }
    setBuilding("Preparing your Haaylo design…");
    try {
      const out = await generatePostCarousel({
        data: {
          slides: parsed.map((s) => ({ heading: s.heading, body: s.body })),
          projectId,
          ...(title ? { title } : {}),
        },
      });
      const rendered: Array<{ design: CarouselDesign; dataUrl: string }> = [];
      for (let i = 0; i < out.designs.length; i++) {
        setBuilding(`Rendering slide ${i + 1} of ${out.designs.length}…`);
        const design = out.designs[i];
        if (!design) throw new Error(`Slide ${i + 1} could not be prepared.`);
        rendered.push({ design, dataUrl: await renderCarouselDesign(design) });
      }
      const made: CarouselSlide[] = [];
      for (let i = 0; i < rendered.length; i++) {
        setBuilding(`Saving slide ${i + 1} of ${rendered.length}…`);
        const item = rendered[i];
        const copy = parsed[i];
        if (!item || !copy) throw new Error(`Slide ${i + 1} could not be saved.`);
        const saved = await saveStudioDesign({ data: { dataUrl: item.dataUrl } });
        made.push({
          index: i,
          path: saved.path,
          url: saved.url,
          heading: copy.heading,
          body: copy.body,
          design: item.design,
        });
      }
      await saveSet(made, made[0] ? { url: made[0].url, path: made[0].path } : undefined);
      toast.success(`Carousel built — ${made.length} slides.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Carousel generation failed.");
    } finally {
      setBuilding(null);
    }
  }

  async function removeSlide(index: number) {
    const next = slides.filter((s) => s.index !== index).map((s, i) => ({ ...s, index: i }));
    await saveSet(next, next[0] ? { url: next[0].url, path: next[0].path } : undefined);
  }

  async function saveStudioSlide(dataUrls: string[], pages: Layer[][], backgroundColor: string) {
    const dataUrl = dataUrls[0];
    const target = studio;
    if (!dataUrl || !target) return;
    try {
      const saved = await saveStudioDesign({ data: { dataUrl } });
      const editedDesign: CarouselDesign | undefined = pages[0]
        ? {
            version: 1,
            background: backgroundColor,
            layers: pages[0],
            palette: target.design?.palette ?? [],
            role: target.design?.role ?? "content",
          }
        : target.design;
      const next = slides.map((s) =>
        s.index === target.index ? { ...s, url: saved.url, path: saved.path, design: editedDesign } : s,
      );
      await saveSet(next, next[0] ? { url: next[0].url, path: next[0].path } : undefined);
      setStudio(null);
      toast.success("Slide updated.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save that slide.");
    }
  }

  async function tweakSlide(slide: CarouselSlide, instruction: string) {
    if (!projectId) throw new Error("Pick a workspace first, then try again.");
    let nextSlide: CarouselSlide;
    if (slide.design) {
      const design = tweakCarouselDesign(slide.design, instruction);
      const dataUrl = await renderCarouselDesign(design);
      const saved = await saveStudioDesign({ data: { dataUrl } });
      nextSlide = { ...slide, url: saved.url, path: saved.path, design };
    } else {
      const refined = await refinePostGraphic({
        data: { imagePath: slide.path, imageUrl: slide.url, instruction, projectId },
      });
      nextSlide = { ...slide, url: refined.url, path: refined.path };
    }
    const next = slides.map((item) => item.index === slide.index ? nextSlide : item);
    await saveSet(next, next[0] ? { url: next[0].url, path: next[0].path } : undefined);
    toast.success(`Page ${slide.index + 1} updated.`);
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <ImageBox {...props} containImage={slides.length > 1} brandKit={brandKit} />

      {building ? (
        <div style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>{building}</div>
      ) : parsed.length >= 2 ? (
        <button style={{ ...btn, flex: "0 0 auto" }} onClick={() => void buildCarousel()}>
          {slides.length ? "🎞 Regenerate carousel" : `🎞 Generate carousel (${parsed.length} slides)`}
        </button>
      ) : null}

      {slides.length > 1 ? (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <strong style={{ fontSize: 12, color: NAVY }}>Carousel slides</strong>
            <button style={{ ...btn, flex: "0 0 auto", padding: "5px 10px", fontSize: 11 }} onClick={() => setViewing(0)}>
              👁 View carousel
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
            {slides.map((s) => (
              <div
                key={s.path}
                style={{
                  flex: "0 0 auto",
                  width: 120,
                  border: "1px solid #E6E6EC",
                  borderRadius: 10,
                  overflow: "hidden",
                  background: "#FFFFFF",
                }}
              >
                <img
                  src={s.url}
                  alt={`Page ${s.index + 1}`}
                  onClick={() => setViewing(s.index)}
                  style={{ width: "100%", height: 120, objectFit: "contain", display: "block", background: "#FFFFFF", cursor: "zoom-in" }}
                />
                <div style={{ padding: 6, display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: NAVY }}>Page {s.index + 1}</span>
                  <button style={{ ...btn, padding: "5px 6px", fontSize: 11 }} onClick={() => setStudio(s)}>
                    Edit in studio
                  </button>
                  <ImageTweakControl compact onApply={(instruction) => tweakSlide(s, instruction)} disabled={!projectId} />
                  <button
                    style={{ ...btn, padding: "5px 6px", fontSize: 11, color: PINK }}
                    onClick={() => void removeSlide(s.index)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {viewing !== null && slides.length ? (
        (() => {
          const current = slides[Math.min(viewing, slides.length - 1)];
          if (!current) return null;
          return (
            <div
              onClick={() => setViewing(null)}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 60,
                background: "rgba(10,15,36,.6)",
                display: "grid",
                placeItems: "center",
                padding: 16,
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: "#FFFFFF",
                  borderRadius: 14,
                  padding: 14,
                  width: "min(680px, 96vw)",
                  maxHeight: "92vh",
                  overflow: "auto",
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <strong style={{ color: NAVY, fontSize: 13 }}>
                    Page {current.index + 1} of {slides.length}
                  </strong>
                  <button style={{ ...btn, flex: "0 0 auto" }} onClick={() => setViewing(null)}>
                    Close
                  </button>
                </div>
                <img
                  src={current.url}
                  alt={`Page ${current.index + 1}`}
                  style={{ width: "100%", borderRadius: 10, border: "1px solid #E6E6EC", display: "block", background: "#FFFFFF" }}
                />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    style={btn}
                    disabled={current.index === 0}
                    onClick={() => setViewing(Math.max(0, current.index - 1))}
                  >
                    ← Previous
                  </button>
                  <button
                    style={btn}
                    disabled={current.index >= slides.length - 1}
                    onClick={() => setViewing(Math.min(slides.length - 1, current.index + 1))}
                  >
                    Next →
                  </button>
                  <button
                    style={{ ...btn, color: PINK }}
                    onClick={() => {
                      setViewing(null);
                      setStudio(current);
                    }}
                  >
                    Edit this slide
                  </button>
                  <ImageTweakControl onApply={(instruction) => tweakSlide(current, instruction)} disabled={!projectId} />
                </div>
              </div>
            </div>
          );
        })()
      ) : null}

      {studio ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(10,15,36,.45)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#FFFFFF",
              borderRadius: 14,
              padding: 14,
              width: "min(1000px, 96vw)",
              maxHeight: "92vh",
              overflow: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <strong style={{ color: NAVY }}>Page {studio.index + 1}</strong>
              <button style={{ ...btn, flex: "0 0 auto" }} onClick={() => setStudio(null)}>
                Close
              </button>
            </div>
            <GraphicStudio
              size="1080x1080"
              brandName={studio.design?.layers.find((layer) => layer.id === "brand-name" || layer.id === "brand-name-fallback")?.text ?? ""}
              brandColors={brandKit.colors || studio.design?.palette.join(",") || ""}
              brandFont={brandKit.font}
              logoUrl={brandKit.logoUrl ?? studio.design?.layers.find((layer) => layer.id === "brand-logo")?.src ?? null}
              brandAssets={brandKit.assets}
              initialLayers={studio.design?.layers as Layer[] | undefined}
              initialBackgroundColor={studio.design?.background}
              backgroundSrc={studio.design ? null : studio.url}
              exportLabel="Save this slide"
              onExport={(urls, pages, backgroundColor) => void saveStudioSlide(urls, pages, backgroundColor)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
