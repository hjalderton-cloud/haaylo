import { AppShell } from "@/components/AppShell";
import { HubTabs } from "@/components/HubTabs";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getBrain, updateBrain } from "@/lib/brain.functions";
import {
  createBrainAssetUploadUrl,
  registerBrainAsset,
  listBrainAssets,
  deleteBrainAsset,
} from "@/lib/brain-assets.functions";
import type { BrainData } from "@/lib/brain-schema";
import { useActiveProject } from "@/hooks/useActiveProject";
import { BG, SURFACE, NAVY as THEME_NAVY, PINK as THEME_PINK, LINE as THEME_LINE, TINT } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/brand-assets")({
  head: () => ({
    meta: [
      { title: "Brand Assets — haaylo.com" },
      { name: "description", content: "Your logos, colours, fonts and reusable graphics in one place." },
      { property: "og:title", content: "Brand Assets — haaylo.com" },
      { property: "og:description", content: "Logos, colours, fonts and reusable graphics in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BrandAssetsPage,
});

const NAVY = BG;
const INK = THEME_NAVY;
const PINK = THEME_PINK;
const LINE = `1px solid ${THEME_LINE}`;

const CARD: React.CSSProperties = {
  background: SURFACE,
  border: LINE,
  borderRadius: 18,
  padding: 22,
  marginBottom: 20,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: ".08em",
  color: PINK,
  textTransform: "uppercase",
  margin: "0 0 8px",
};

const hexInput: React.CSSProperties = {
  width: 120,
  padding: "9px 11px",
  borderRadius: 10,
  border: LINE,
  background: "#FFFFFF",
  color: INK,
  fontSize: 14,
  fontFamily: "inherit",
};

const ghostBtn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 999,
  border: LINE,
  background: "transparent",
  color: INK,
  fontWeight: 700,
  fontSize: 13,
  fontFamily: "inherit",
  cursor: "pointer",
};

const FONT_CHOICES = [
  { value: "modern", label: "Modern Sans (Inter)", stack: "Inter, system-ui, sans-serif" },
  { value: "classic", label: "Classic Serif (Merriweather)", stack: "Merriweather, Georgia, serif" },
  { value: "bold", label: "Bold Display (Montserrat)", stack: "Montserrat, system-ui, sans-serif" },
  { value: "minimal", label: "Clean Minimal (DM Sans)", stack: "'DM Sans', system-ui, sans-serif" },
] as const;

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const LOGO_MAX = 5 * 1024 * 1024;
const ASSET_MAX = 10 * 1024 * 1024;
const LOGO_TYPES = ["image/png", "image/svg+xml"];
const ASSET_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp"];

type AssetRow = {
  id: string;
  kind: string;
  storage_path: string;
  label: string | null;
  created_at: string;
  url: string | null;
};

function fileName(row: AssetRow): string {
  if (row.label) return row.label;
  const last = row.storage_path.split("/").pop() ?? "file";
  return last.replace(/^\d+-/, "");
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

function BrandAssetsPage() {
  const activeProjectId = useActiveProject();
  const getBrainFn = useServerFn(getBrain);
  const updateBrainFn = useServerFn(updateBrain);
  const createUrlFn = useServerFn(createBrainAssetUploadUrl);
  const registerFn = useServerFn(registerBrainAsset);
  const listFn = useServerFn(listBrainAssets);
  const deleteFn = useServerFn(deleteBrainAsset);

  const [projectId, setProjectId] = useState<string>("");
  const [brain, setBrain] = useState<BrainData>({});
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedFlash, setSavedFlash] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const brainRef = useRef<BrainData>({});
  brainRef.current = brain;

  const logo = assets.find((a) => a.kind === "logo") ?? null;
  const library = assets.filter((a) => a.kind === "image");

  const flashSaved = useCallback(() => {
    setSavedFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSavedFlash(false), 2000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBrainFn({ data: activeProjectId ? { projectId: activeProjectId } : {} });
      setBrain(res.data ?? {});
      const id = res.projectId;
      setProjectId(id);
      if (id) {
        const rows = (await listFn({ data: { projectId: id } })) as AssetRow[];
        setAssets(rows);
      } else {
        setAssets([]);
      }
    } catch {
      setBrain({});
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [getBrainFn, listFn, activeProjectId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  async function persist(next: BrainData) {
    if (!projectId) return;
    try {
      await updateBrainFn({ data: { projectId, data: next } });
      flashSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't save. Try again.");
    }
  }

  function setBrandField(key: "primary_color" | "secondary_color" | "accent_color" | "font_preference", value: string, debounce = false) {
    const next: BrainData = { ...brainRef.current, brand: { ...(brainRef.current.brand ?? {}), [key]: value } };
    setBrain(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (debounce) {
      saveTimer.current = setTimeout(() => void persist(next), 600);
    } else {
      void persist(next);
    }
  }

  async function refreshAssets() {
    if (!projectId) return;
    const rows = (await listFn({ data: { projectId } })) as AssetRow[];
    setAssets(rows);
  }

  async function upload(kind: "logo" | "image", file: File) {
    if (!projectId) return;
    const isLogo = kind === "logo";
    const types = isLogo ? LOGO_TYPES : ASSET_TYPES;
    const max = isLogo ? LOGO_MAX : ASSET_MAX;
    if (!types.includes(file.type)) {
      toast.error(isLogo ? "Logos need to be a PNG or an SVG." : "Use a PNG, JPG, SVG or WebP.");
      return;
    }
    if (file.size > max) {
      toast.error(isLogo ? "That logo is over 5MB." : "That file is over 10MB.");
      return;
    }
    isLogo ? setUploadingLogo(true) : setUploadingAsset(true);
    try {
      const { path, token } = await createUrlFn({ data: { projectId, kind, filename: file.name } });
      const { error } = await supabase.storage.from("scheduler-media").uploadToSignedUrl(path, token, file);
      if (error) throw error;
      await registerFn({ data: { projectId, kind, storagePath: path, label: file.name } });
      await refreshAssets();
      flashSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      isLogo ? setUploadingLogo(false) : setUploadingAsset(false);
    }
  }

  async function remove(id: string) {
    try {
      await deleteFn({ data: { id } });
      setAssets((prev) => prev.filter((a) => a.id !== id));
      flashSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete that.");
    }
  }

  async function copyUrl(url: string | null) {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied — it's a temporary preview link.");
    } catch {
      toast.error("Couldn't copy that link.");
    }
  }

  const brandBlock = brain.brand ?? {};
  const primary = brandBlock.primary_color || "#FF3D8A";
  const secondary = brandBlock.secondary_color || THEME_NAVY;
  const accent = brandBlock.accent_color || "#4ADE80";
  const font = FONT_CHOICES.find((f) => f.value === (brandBlock.font_preference ?? "")) ?? FONT_CHOICES[0];

  return (
    <AppShell title="Brand Assets" flush>
    <main style={{ background: BG, color: INK, minHeight: "100vh", padding: "28px 20px 80px" }}>
      <div style={{ maxWidth: 940, margin: "0 auto", position: "relative" }}>
        <HubTabs />
        <div
          aria-live="polite"
          style={{
            position: "fixed",
            top: 18,
            right: 22,
            padding: "8px 14px",
            borderRadius: 999,
            background: TINT.green,
            border: `1px solid ${TINT.greenInk}`,
            color: TINT.greenInk,
            fontSize: 13,
            fontWeight: 700,
            opacity: savedFlash ? 1 : 0,
            transition: "opacity .2s ease",
            pointerEvents: "none",
            zIndex: 50,
          }}
        >
          Saved
        </div>

        <h1 style={{ margin: "0 0 6px", fontSize: 28, fontWeight: 800 }}>Brand Assets</h1>
        <p style={{ margin: "0 0 26px", opacity: 0.78, fontSize: 15, maxWidth: 620 }}>
          Your logo, colours, font and saved graphics. Everything here is used automatically by your landing
          pages, guides and generated images.
        </p>

        {loading ? (
          <div style={{ ...CARD, opacity: 0.6 }}>Loading your brand…</div>
        ) : (
          <>
            {/* SECTION 1 — Logo */}
            <section style={CARD}>
              <p style={labelStyle}>Logo</p>
              <p style={{ margin: "0 0 14px", fontSize: 14, opacity: 0.75 }}>PNG or SVG, up to 5MB.</p>

              {logo?.url ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "stretch" }}>
                  <div style={{ flex: "1 1 220px", background: "#FFFFFF", borderRadius: 14, padding: 18, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 120 }}>
                    <img src={logo.url} alt="Your logo on white" style={{ maxHeight: 80, maxWidth: "100%", objectFit: "contain" }} />
                  </div>
                  <div style={{ flex: "1 1 220px", background: THEME_NAVY, border: LINE, borderRadius: 14, padding: 18, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 120 }}>
                    <img src={logo.url} alt="Your logo on a dark background" style={{ maxHeight: 80, maxWidth: "100%", objectFit: "contain" }} />
                  </div>
                </div>
              ) : (
                <p style={{ margin: "0 0 14px", fontSize: 14, opacity: 0.6 }}>No logo yet.</p>
              )}

              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
                <label style={{ ...ghostBtn, display: "inline-block" }}>
                  {uploadingLogo ? "Uploading…" : logo ? "Replace logo" : "Upload logo"}
                  <input
                    type="file"
                    accept=".png,.svg,image/png,image/svg+xml"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void upload("logo", f);
                    }}
                  />
                </label>
                {logo && (
                  <button type="button" style={ghostBtn} onClick={() => void remove(logo.id)}>
                    Remove logo
                  </button>
                )}
              </div>
            </section>

            {/* SECTION 2 — Colours */}
            <section style={CARD}>
              <p style={labelStyle}>Brand colours</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
                {([
                  { key: "primary_color", name: "Primary", value: primary },
                  { key: "secondary_color", name: "Secondary", value: secondary },
                  { key: "accent_color", name: "Accent", value: accent },
                ] as const).map((c) => (
                  <div key={c.key} style={{ flex: "1 1 200px", minWidth: 190 }}>
                    <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700 }}>{c.name}</p>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <input
                        type="color"
                        aria-label={`${c.name} colour picker`}
                        value={HEX.test(c.value) ? c.value : "#000000"}
                        onChange={(e) => setBrandField(c.key, e.target.value)}
                        style={{ width: 44, height: 40, borderRadius: 10, border: LINE, background: "transparent", padding: 2, cursor: "pointer" }}
                      />
                      <input
                        style={hexInput}
                        value={brandBlock[c.key] ?? ""}
                        placeholder={c.value}
                        aria-label={`${c.name} hex code`}
                        onChange={(e) => setBrandField(c.key, e.target.value.trim(), true)}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 20 }}>
                <p style={{ margin: "0 0 10px", fontSize: 13, opacity: 0.7 }}>Your palette</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 0, borderRadius: 14, overflow: "hidden", border: LINE }}>
                  {[primary, secondary, accent].map((c, i) => (
                    <div key={i} style={{ flex: "1 1 100px", height: 64, background: HEX.test(c) ? c : "#333" }} />
                  ))}
                </div>
                <div style={{ marginTop: 14, borderRadius: 14, padding: 18, background: HEX.test(secondary) ? secondary : THEME_NAVY, border: LINE }}>
                  <p style={{ margin: "0 0 12px", fontWeight: 800, fontSize: 18, color: HEX.test(accent) ? accent : INK }}>
                    A headline in your brand
                  </p>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "10px 18px",
                      borderRadius: 999,
                      background: HEX.test(primary) ? primary : PINK,
                      color: "#fff",
                      fontWeight: 800,
                      fontSize: 14,
                    }}
                  >
                    Primary button
                  </span>
                </div>
              </div>
            </section>

            {/* SECTION 3 — Typography */}
            <section style={CARD}>
              <p style={labelStyle}>Typography</p>
              <select
                aria-label="Font preference"
                value={font.value}
                onChange={(e) => setBrandField("font_preference", e.target.value)}
                style={{ ...hexInput, width: "100%", maxWidth: 340 }}
              >
                {FONT_CHOICES.map((f) => (
                  <option key={f.value} value={f.value} style={{ color: "#111" }}>
                    {f.label}
                  </option>
                ))}
              </select>

              <div style={{ marginTop: 18, background: "#FFFFFF", color: "#1B1F35", borderRadius: 14, padding: 22, fontFamily: font.stack }}>
                <p style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 800, lineHeight: 1.15, overflowWrap: "anywhere" }}>
                  Marketing that sounds like you
                </p>
                <p style={{ margin: "0 0 12px", fontSize: 17, opacity: 0.8 }}>A subheading that sets up the offer.</p>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, opacity: 0.85 }}>
                  Body copy sits here. This is how a paragraph on your landing page and in your guide will read
                  once the font is applied.
                </p>
              </div>
            </section>

            {/* SECTION 4 — Asset library */}
            <section style={CARD}>
              <p style={labelStyle}>Asset library</p>
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const files = Array.from(e.dataTransfer.files ?? []);
                  files.forEach((f) => void upload("image", f));
                }}
                style={{
                  display: "block",
                  border: `1px dashed ${dragOver ? PINK : THEME_LINE}`,
                  borderRadius: 14,
                  padding: "28px 18px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: dragOver ? TINT.pink : SURFACE,
                }}
              >
                <p style={{ margin: "0 0 4px", fontWeight: 700 }}>
                  {uploadingAsset ? "Uploading…" : "Drop images here, or click to choose"}
                </p>
                <p style={{ margin: 0, fontSize: 13, opacity: 0.66 }}>PNG, JPG, SVG or WebP — up to 10MB each.</p>
                <input
                  type="file"
                  multiple
                  accept=".png,.jpg,.jpeg,.svg,.webp,image/png,image/jpeg,image/svg+xml,image/webp"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    files.forEach((f) => void upload("image", f));
                  }}
                />
              </label>

              {library.length === 0 ? (
                <p style={{ margin: "16px 0 0", fontSize: 14, opacity: 0.6 }}>Nothing saved yet.</p>
              ) : (
                <div
                  style={{
                    marginTop: 18,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                    gap: 14,
                  }}
                >
                  {library.map((a) => (
                    <div key={a.id} style={{ border: LINE, borderRadius: 14, overflow: "hidden", background: SURFACE }}>
                      <div style={{ height: 120, background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {a.url ? (
                          <img src={a.url} alt={fileName(a)} style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }} />
                        ) : (
                          <span style={{ color: "#666", fontSize: 12 }}>No preview</span>
                        )}
                      </div>
                      <div style={{ padding: 12 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, overflowWrap: "anywhere" }}>{fileName(a)}</p>
                        <p style={{ margin: "2px 0 10px", fontSize: 12, opacity: 0.6 }}>{fmtDate(a.created_at)}</p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          <button type="button" style={{ ...ghostBtn, padding: "6px 12px", fontSize: 12 }} onClick={() => void copyUrl(a.url)}>
                            Copy URL
                          </button>
                          <button type="button" style={{ ...ghostBtn, padding: "6px 12px", fontSize: 12 }} onClick={() => void remove(a.id)}>
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
    </AppShell>
  );
}
