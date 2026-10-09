import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell, CARD } from "@/components/AppShell";
import {
  BRAIN_SECTIONS,
  type BrainData,
  brainFillScore,
  brainEssentialsComplete,
  brandDnaProgress,
} from "@/lib/brain-schema";
import {
  DnaSection,
  Field,
  TagInput,
  TonePills,
  dnaInput,
} from "@/components/brand-dna/fields";
import { getBrain, updateBrain, listProjects } from "@/lib/brain.functions";
import { gaEvent, gaOnce } from "@/lib/analytics";
import { supabase } from "@/integrations/supabase/client";
import { SURFACE, NAVY, INDIGO, PURPLE, PINK, GREY, LINE, TINT, font } from "@/lib/theme";

const searchSchema = z.object({
  onboarding: z
    .union([z.string(), z.number(), z.boolean()])
    .optional()
    .transform((v) => (v === undefined ? undefined : String(v))),
  step: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === undefined ? undefined : String(v))),
  returned: z
    .union([z.string(), z.number(), z.boolean()])
    .optional()
    .transform((v) => (v === undefined ? undefined : String(v))),
});

export const Route = createFileRoute("/_authenticated/brain/setup")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Brand DNA — haaylo.com" },
      {
        name: "description",
        content: "Your brand foundation: business, audience, proof and voice — the source every haaylo module writes from.",
      },
      { property: "og:title", content: "Brand DNA — haaylo.com" },
      {
        property: "og:description",
        content: "Set your brand foundation once and every campaign, post and landing page writes from it.",
      },
    ],
  }),
  component: BrandDnaPage,
});

const TONE_OPTIONS = [
  "Authoritative",
  "Conversational",
  "Inspirational",
  "Bold",
  "Witty",
  "Educational",
  "Warm",
  "Direct",
] as const;

/** Fields shown explicitly on this screen — everything else drops into Advanced. */
const SURFACED: Record<string, string[]> = {
  business: ["name", "website", "vision", "industry", "industry_descriptors", "products_services"],
  brand: ["values", "usp", "mission", "tone_of_voice", "words_always_use"],
  founder: ["origin_story", "banned_words", "sample_posts"],
  marketing: ["business_goals", "competitors"],
  ctas: ["primary", "current_offer"],
  audience: ["ideal_customer", "objections", "buying_triggers"],
  proof: ["testimonials", "case_studies", "notable_clients"],
};

function BrandDnaPage() {
  const navigate = useNavigate();
  const { onboarding } = useSearch({ from: "/_authenticated/brain/setup" });
  const isOnboarding = onboarding === "1";

  const getBrainFn = useServerFn(getBrain);
  const listProjectsFn = useServerFn(listProjects);
  const updateBrainFn = useServerFn(updateBrain);

  const [projects, setProjects] = useState<Array<{ id: string; name: string; is_default: boolean }>>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [data, setData] = useState<BrainData>({});
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<{ plan: string | null; brain_enabled: boolean; active: boolean } | null>(null);

  // Snapshot of the last saved payload — lets blur autosave skip no-op saves.
  const lastSaved = useRef<string>("");

  useEffect(() => {
    (async () => {
      try {
        const list = await listProjectsFn();
        setProjects(list);
        const stored = typeof window !== "undefined" ? window.localStorage.getItem("ie-active-project") : null;
        const chosen = (stored && list.find((p) => p.id === stored)) || list.find((p) => p.is_default) || list[0];
        if (!chosen) return;
        setProjectId(chosen.id);
        try { window.localStorage.setItem("ie-active-project", chosen.id); } catch { /* ignore */ }
        const b = await getBrainFn({ data: { projectId: chosen.id } });
        setData(b.data);
        lastSaved.current = JSON.stringify(b.data);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't load your Brand DNA");
      } finally {
        setLoading(false);
      }
    })();
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) return;
        const { data: p } = await supabase.rpc("get_engine_plan", { _user: u.user.id });
        const row = Array.isArray(p) ? p[0] : p;
        if (row) setPlan({ plan: row.plan, brain_enabled: !!row.brain_enabled, active: !!row.active });
      } catch { /* silent */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function switchProject(id: string) {
    setProjectId(id);
    try { window.localStorage.setItem("ie-active-project", id); } catch { /* ignore */ }
    setLoading(true);
    try {
      const b = await getBrainFn({ data: { projectId: id } });
      setData(b.data);
      lastSaved.current = JSON.stringify(b.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load that workspace");
    } finally {
      setLoading(false);
    }
  }

  const field = (section: string, key: string) =>
    ((data as Record<string, Record<string, string | undefined>>)[section]?.[key]) ?? "";

  function setField(section: string, key: string, value: string) {
    setData((d) => ({
      ...d,
      [section]: { ...(d as Record<string, Record<string, string>>)[section], [key]: value },
    }));
  }

  async function save(silent = false) {
    if (!projectId) return;
    const payload = JSON.stringify(data);
    if (silent && payload === lastSaved.current) return;
    setBusy(true);
    try {
      await updateBrainFn({ data: { projectId, data } });
      lastSaved.current = payload;
      try {
        const rec = data as Record<string, Record<string, string | undefined>>;
        for (const s of BRAIN_SECTIONS) {
          const sect = rec?.[s.key] ?? {};
          const allFilled = s.fields.every((f) => (sect?.[f.key] ?? "").toString().trim().length > 0);
          if (allFilled) {
            gaOnce(`ga:brain_section:${projectId}:${String(s.key)}`, () =>
              gaEvent("brain_section_complete", { section_key: String(s.key), section_title: s.title, project_id: projectId }),
            );
          }
        }
        if (brainEssentialsComplete(data)) {
          gaOnce(`ga:brain_setup_complete:${projectId}`, () =>
            gaEvent("brain_setup_complete", { project_id: projectId }),
          );
        }
      } catch { /* silent */ }
      setSavedAt(Date.now());
      if (!silent) toast.success("Strategy Profile saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed — your changes are still on screen");
    } finally {
      setBusy(false);
    }
  }

  const autosave = () => { void save(true); };

  const score = brainFillScore(data);
  const dna = brandDnaProgress(data);

  useEffect(() => {
    if (loading) return;
    try {
      window.dispatchEvent(new CustomEvent("brain:updated", { detail: { score } }));
    } catch { /* silent */ }
  }, [score, loading]);

  const advanced = BRAIN_SECTIONS.map((s) => ({
    ...s,
    fields: s.fields.filter((f) => !(SURFACED[String(s.key)] ?? []).includes(f.key)),
  })).filter((s) => s.fields.length > 0);

  const showTrialNotice = !loading && plan && !plan.active;

  return (
    <AppShell title="Brand DNA">
      <p style={{ color: GREY, marginTop: 0, maxWidth: 720, lineHeight: 1.55 }}>
        Set this once. Every campaign, post, landing page and lead magnet is written from it — for the workspace you have
        selected.
      </p>

      {showTrialNotice && (
        <div style={{
          ...CARD, marginBottom: 16,
          background: "rgba(255,92,147,.08)", border: "1px solid rgba(255,92,147,.3)",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
        }}>
          <span style={{ color: "#dcdcef", fontSize: 13, lineHeight: 1.5 }}>
            You&rsquo;re on the free trial — finish your Brand DNA, then use your free generation.
          </span>
          <Link to="/pricing" style={{ color: PINK, fontWeight: 800, fontSize: 13, textDecoration: "none", whiteSpace: "nowrap" }}>
            See membership →
          </Link>
        </div>
      )}

      {/* Completion + workspace */}
      <div style={{ ...CARD, marginBottom: 14, position: "sticky", top: 0, zIndex: 5 }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px", minWidth: 0 }}>
            <span style={{ fontSize: 11, color: GREY, textTransform: "uppercase", letterSpacing: ".06em" }}>Workspace</span>
            <select value={projectId ?? ""} onChange={(e) => switchProject(e.target.value)} style={dnaInput}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.is_default ? " (default)" : ""}</option>
              ))}
            </select>
          </label>
          <div style={{ flex: "2 1 260px", minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: GREY, marginBottom: 6 }}>
              <span style={{ textTransform: "uppercase", letterSpacing: ".06em" }}>Completion</span>
              <span>{dna.percent}% · {dna.filled} of {dna.total} required fields</span>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: `${LINE}`, overflow: "hidden" }}>
              <div style={{
                width: `${dna.percent}%`,
                height: "100%",
                borderRadius: 999,
                background: dna.percent === 100 ? "linear-gradient(90deg,#4ADE80,#22C55E)" : `linear-gradient(90deg,${PINK},#E01F68)`,
                transition: "width .25s ease",
              }} />
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <p style={{ color: GREY }}>Loading…</p>
      ) : (
        <div style={{ paddingBottom: 96 }}>
          {projectId && (
            <StrategyDocSection
              projectId={projectId}
              onApply={(suggestions, overwrite) => {
                let applied = 0;
                setData((d) => {
                  const rec = { ...(d as unknown as Record<string, Record<string, string | undefined>>) };
                  for (const [sec, fields] of Object.entries(suggestions)) {
                    const current = { ...(rec[sec] ?? {}) };
                    for (const [key, value] of Object.entries(fields)) {
                      const existing = (current[key] ?? "").toString().trim();
                      if (existing && !overwrite) continue;
                      current[key] = value;
                      applied++;
                    }
                    rec[sec] = current;
                  }
                  return rec as unknown as BrainData;
                });
                setTimeout(() => {
                  if (applied > 0) toast.success(`${applied} field${applied === 1 ? "" : "s"} filled — check them, then save`);
                  else toast.info("Nothing new to fill — those fields are already complete");
                }, 0);
              }}
            />
          )}

          {/* SECTION 1 */}
          <DnaSection title="Business foundation" badge="Required">
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              <Field label="Business name" required>
                <input type="text" value={field("business", "name")} placeholder="e.g. Haaylo Ltd" style={dnaInput}
                  onChange={(e) => setField("business", "name", e.target.value)} onBlur={autosave} />
              </Field>
              <Field label="Website" required>
                <input type="text" value={field("business", "website")} placeholder="https://haaylo.com" style={dnaInput}
                  onChange={(e) => setField("business", "website", e.target.value)} onBlur={autosave} />
              </Field>
            </div>
            <Field label="Founder story" required hint="Three lines or more works best.">
              <textarea rows={4} value={field("founder", "origin_story")}
                placeholder="Why did you start this? What problem are you solving and for whom?"
                style={dnaInput} onChange={(e) => setField("founder", "origin_story", e.target.value)} onBlur={autosave} />
            </Field>
            <Field label="Company vision" required>
              <textarea rows={3} value={field("business", "vision")}
                placeholder="Where is this business going in 3–5 years?"
                style={dnaInput} onChange={(e) => setField("business", "vision", e.target.value)} onBlur={autosave} />
            </Field>
            <Field label="Core values" required>
              <TagInput value={field("brand", "values")} max={5}
                placeholder="e.g. Transparency, Community, Innovation"
                onChange={(v) => setField("brand", "values", v)} onCommit={autosave} />
            </Field>
            <Field label="Products and services" required>
              <textarea rows={3} value={field("business", "products_services")}
                placeholder="Main offers, prices and what each one delivers"
                style={dnaInput} onChange={(e) => setField("business", "products_services", e.target.value)} onBlur={autosave} />
            </Field>
            <Field label="Unique selling point" required>
              <textarea rows={2} value={field("brand", "usp")}
                placeholder="What you do that competitors can't or won't"
                style={dnaInput} onChange={(e) => setField("brand", "usp", e.target.value)} onBlur={autosave} />
            </Field>
            <Field label="Mission" required>
              <textarea rows={2} value={field("brand", "mission")}
                placeholder="One sentence: who you help, how, and the outcome"
                style={dnaInput} onChange={(e) => setField("brand", "mission", e.target.value)} onBlur={autosave} />
            </Field>
            <Field label="Business goals" required hint="Numbers and dates help.">
              <textarea rows={2} value={field("marketing", "business_goals")}
                placeholder="e.g. 30 qualified enquiries a month by Q4"
                style={dnaInput} onChange={(e) => setField("marketing", "business_goals", e.target.value)} onBlur={autosave} />
            </Field>
            <Field label="Competitors" required>
              <TagInput value={field("marketing", "competitors")} max={8}
                placeholder="e.g. Jasper, Copy.ai"
                onChange={(v) => setField("marketing", "competitors", v)} onCommit={autosave} />
            </Field>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              <Field label="Main call to action" required>
                <input type="text" value={field("ctas", "primary")} placeholder="e.g. Book a free consultation"
                  style={dnaInput} onChange={(e) => setField("ctas", "primary", e.target.value)} onBlur={autosave} />
              </Field>
              <Field label="Current live offer" hint="Leave blank if you have none — nothing will be invented.">
                <input type="text" value={field("ctas", "current_offer")} placeholder="e.g. 20% off until 31 March"
                  style={dnaInput} onChange={(e) => setField("ctas", "current_offer", e.target.value)} onBlur={autosave} />
              </Field>
            </div>
          </DnaSection>

          {/* SECTION 2 */}
          <DnaSection title="Target audience" badge="Required">
            <Field label="Primary audience description" required>
              <textarea rows={4} value={field("audience", "ideal_customer")}
                placeholder="Who exactly is this for? Be specific — industry, role, pain points, aspirations."
                style={dnaInput} onChange={(e) => setField("audience", "ideal_customer", e.target.value)} onBlur={autosave} />
            </Field>
            <Field label="Market niche" required>
              <input type="text" value={field("business", "industry")}
                placeholder="e.g. Female founders, Fitness coaches, eCommerce brands"
                style={dnaInput} onChange={(e) => setField("business", "industry", e.target.value)} onBlur={autosave} />
            </Field>
            <Field label="Industry descriptors" required>
              <TagInput value={field("business", "industry_descriptors")} max={5}
                placeholder="e.g. B2B SaaS, Personal brand, Local service"
                onChange={(v) => setField("business", "industry_descriptors", v)} onCommit={autosave} />
            </Field>
            <Field label="Common objections" required>
              <textarea rows={3} value={field("audience", "objections")}
                placeholder="The hesitations that stop them buying"
                style={dnaInput} onChange={(e) => setField("audience", "objections", e.target.value)} onBlur={autosave} />
            </Field>
            <Field label="Buying triggers" required>
              <textarea rows={3} value={field("audience", "buying_triggers")}
                placeholder="What happens right before they're ready to buy"
                style={dnaInput} onChange={(e) => setField("audience", "buying_triggers", e.target.value)} onBlur={autosave} />
            </Field>
          </DnaSection>

          {/* SECTION 3 */}
          <DnaSection title="Proof and authority" badge="Optional" defaultOpen={false}>
            <Field label="Case study results">
              <textarea rows={3} value={field("proof", "case_studies")}
                placeholder="Any specific results you've achieved for clients or yourself"
                style={dnaInput} onChange={(e) => setField("proof", "case_studies", e.target.value)} onBlur={autosave} />
            </Field>
            <Field label="Notable clients or press">
              <TagInput value={field("proof", "notable_clients")} max={10}
                placeholder="e.g. BBC, Monzo, The Times"
                onChange={(v) => setField("proof", "notable_clients", v)} onCommit={autosave} />
            </Field>
          </DnaSection>

          {/* SECTION 4 */}
          <DnaSection title="Brand voice" badge="Optional">
            <Field label="Tone of voice" hint="Pick up to three.">
              <TonePills options={TONE_OPTIONS} value={field("brand", "tone_of_voice")} max={3}
                onChange={(v) => { setField("brand", "tone_of_voice", v); setTimeout(autosave, 0); }} />
            </Field>
            <Field label="Words to always use">
              <TagInput value={field("brand", "words_always_use")} max={12}
                placeholder="e.g. Community, Strategy, Real results"
                onChange={(v) => setField("brand", "words_always_use", v)} onCommit={autosave} />
            </Field>
            <Field label="Words to never use">
              <TagInput value={field("founder", "banned_words")} max={30}
                placeholder="e.g. Guru, Hustle, Hack"
                onChange={(v) => setField("founder", "banned_words", v)} onCommit={autosave} />
            </Field>
            <Field label="Example posts" hint="Paste three to five posts that sound like you. Separate each one with a blank line.">
              <textarea rows={8} value={field("founder", "sample_posts")}
                placeholder="Paste real posts you've written. Haaylo will learn their rhythm, length and voice."
                style={dnaInput} onChange={(e) => setField("founder", "sample_posts", e.target.value)} onBlur={autosave} />
            </Field>
            <Field label="Testimonials" hint="Paste real customer quotes — name and quote per line, separated by blank lines.">
              <textarea rows={6} value={field("proof", "testimonials")}
                placeholder={"Sarah J.\n\"Booked three jobs in a week — best decision we made.\"\n\nMike T.\n\"The team made the whole process effortless.\""}
                style={dnaInput} onChange={(e) => setField("proof", "testimonials", e.target.value)} onBlur={autosave} />
            </Field>
          </DnaSection>

          {/* SECTION 5 */}
          <DnaSection title="Advanced detail" badge="Optional" defaultOpen={false}
            subtitle="Extra context the AI uses when it has it. Nothing here is required.">
            {advanced.map((section) => (
              <div key={String(section.key)} style={{ display: "grid", gap: 10 }}>
                <div style={{ fontSize: 11, color: TINT.pinkInk, textTransform: "uppercase", letterSpacing: ".08em" }}>
                  {section.title}
                </div>
                {section.fields.map((f) => (
                  <Field key={f.key} label={f.label} hint={f.hint}>
                    {f.multiline ? (
                      <textarea rows={3} value={field(String(section.key), f.key)} placeholder={f.placeholder}
                        style={dnaInput} onBlur={autosave}
                        onChange={(e) => setField(String(section.key), f.key, e.target.value)} />
                    ) : (
                      <input type="text" value={field(String(section.key), f.key)} placeholder={f.placeholder}
                        style={dnaInput} onBlur={autosave}
                        onChange={(e) => setField(String(section.key), f.key, e.target.value)} />
                    )}
                  </Field>
                ))}
              </div>
            ))}
          </DnaSection>

          {projectId && <BrainAssetsSection projectId={projectId} />}
        </div>
      )}

      {/* Fixed save bar */}
      {!loading && (
        <div style={{
          position: "sticky", bottom: 0, marginTop: 8, padding: "12px 0",
          background: "linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.94) 45%)",
          display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
        }}>
          <button onClick={() => void save()} disabled={busy} style={primaryBtn}>
            {busy ? "Saving…" : "Save Strategy Profile"}
          </button>
          {isOnboarding && (
            <button onClick={async () => { await save(true); navigate({ to: "/first-post" }); }} style={secondaryBtn}>
              Continue →
            </button>
          )}
          <span style={{ fontSize: 12, color: savedAt ? "#86EFAC" : GREY }}>
            {busy ? "Saving…" : savedAt ? "✓ Saved — also saves as you move between fields" : "Saves as you move between fields"}
          </span>
        </div>
      )}
    </AppShell>
  );
}

const primaryBtn: React.CSSProperties = {
  background: `linear-gradient(135deg, ${PINK}, #E01F68)`,
  color: "#FFFFFF",
  border: "none",
  padding: "12px 20px",
  borderRadius: 12,
  fontWeight: 800,
  cursor: "pointer",
};
const secondaryBtn: React.CSSProperties = {
  background: "transparent",
  color: PINK,
  border: "1px solid rgba(255,92,147,.35)",
  padding: "12px 20px",
  borderRadius: 12,
  fontWeight: 700,
  cursor: "pointer",
};

// ============= Brand assets =============

import { createBrainAssetUploadUrl, registerBrainAsset, listBrainAssets, deleteBrainAsset } from "@/lib/brain-assets.functions";
import { extractBrainFromDocument, extractBrainFromUrl } from "@/lib/brain-extract.functions";

type BrainAsset = { id: string; kind: string; storage_path: string; label: string | null; created_at: string; url: string | null };

const ASSET_KINDS: Array<{ key: "logo" | "brand_guidelines" | "image" | "pdf" | "case_study"; label: string; hint: string; accept: string }> = [
  { key: "logo", label: "Logo", hint: "PNG with transparent background works best.", accept: "image/*" },
  { key: "brand_guidelines", label: "Brand guidelines", hint: "PDF or image — your style rules.", accept: "application/pdf,image/*" },
  { key: "image", label: "Reference images", hint: "Photos, product shots, mood board.", accept: "image/*" },
  { key: "pdf", label: "PDFs & docs", hint: "Case studies, one-pagers, decks.", accept: "application/pdf" },
  { key: "case_study", label: "Case studies", hint: "Written wins to reference in content.", accept: "application/pdf,image/*,text/*" },
];

function BrainAssetsSection({ projectId }: { projectId: string }) {
  const createUrlFn = useServerFn(createBrainAssetUploadUrl);
  const registerFn = useServerFn(registerBrainAsset);
  const listFn = useServerFn(listBrainAssets);
  const deleteFn = useServerFn(deleteBrainAsset);
  const [assets, setAssets] = useState<BrainAsset[]>([]);
  const [uploadingKind, setUploadingKind] = useState<string | null>(null);

  async function refresh() {
    try {
      const rows = await listFn({ data: { projectId } });
      setAssets(rows as BrainAsset[]);
    } catch { /* ignore */ }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId]);

  async function upload(kind: typeof ASSET_KINDS[number]["key"], file: File) {
    setUploadingKind(kind);
    try {
      const { path, token } = await createUrlFn({ data: { projectId, kind, filename: file.name } });
      const { error } = await supabase.storage.from("scheduler-media").uploadToSignedUrl(path, token, file);
      if (error) throw error;
      await registerFn({ data: { projectId, kind, storagePath: path, label: file.name } });
      await refresh();
      toast.success(`${kind === "logo" ? "Logo" : "File"} uploaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingKind(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this asset?")) return;
    await deleteFn({ data: { id } });
    await refresh();
  }

  return (
    <section style={{ ...CARD, marginBottom: 14 }}>
      <h2 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 14, color: PINK, margin: "0 0 4px", letterSpacing: ".04em", textTransform: "uppercase" }}>
        Brand assets
      </h2>
      <p style={{ color: GREY, fontSize: 12, margin: "0 0 12px" }}>
        Upload once. Used by image generation and referenced in your content.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        {ASSET_KINDS.map((k) => {
          const existing = assets.filter((a) => a.kind === k.key);
          const isBusy = uploadingKind === k.key;
          return (
            <div key={k.key} style={{ border: `1px dashed ${LINE}`, borderRadius: 12, padding: 10 }}>
              <div style={{ fontSize: 12, color: "#dcdcef", fontWeight: 700, marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: 11, color: GREY, marginBottom: 8, lineHeight: 1.4 }}>{k.hint}</div>
              <label style={{ display: "inline-block", background: "rgba(255,92,147,.15)", color: "#c9a7ff", border: "1px solid rgba(255,92,147,.35)", padding: "6px 10px", borderRadius: 8, fontSize: 12, cursor: isBusy ? "wait" : "pointer" }}>
                {isBusy ? "Uploading…" : k.key === "logo" && existing.length ? "Replace" : "+ Upload"}
                <input
                  type="file"
                  accept={k.accept}
                  disabled={isBusy}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) { upload(k.key, f); e.target.value = ""; } }}
                  style={{ display: "none" }}
                />
              </label>

              {existing.length > 0 && (
                <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
                  {existing.map((a) => (
                    <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, background: SURFACE, padding: 6, borderRadius: 8 }}>
                      {a.url && /\.(png|jpe?g|gif|webp|svg)$/i.test(a.storage_path) ? (
                        <img src={a.url} alt={a.label ?? ""} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, background: "#fff" }} />
                      ) : (
                        <div style={{ width: 40, height: 40, display: "grid", placeItems: "center", background: "rgba(168,85,247,.2)", borderRadius: 6, fontSize: 18 }}>📄</div>
                      )}
                      <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: "#dcdcef", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label ?? a.storage_path.split("/").pop()}</div>
                      <button onClick={() => remove(a.id)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 16 }} title="Remove">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StrategyDocSection({ projectId, onApply }: {
  projectId: string;
  onApply: (suggestions: Record<string, Record<string, string>>, overwrite: boolean) => void;
}) {
  const createUrlFn = useServerFn(createBrainAssetUploadUrl);
  const registerFn = useServerFn(registerBrainAsset);
  const listFn = useServerFn(listBrainAssets);
  const deleteFn = useServerFn(deleteBrainAsset);
  const extractFn = useServerFn(extractBrainFromDocument);
  const extractUrlFn = useServerFn(extractBrainFromUrl);

  const [docs, setDocs] = useState<BrainAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [link, setLink] = useState("");
  const [readingLink, setReadingLink] = useState(false);

  async function autofillFromLink() {
    const value = link.trim();
    if (value.length < 3) {
      toast.error("Paste a web address first.");
      return;
    }
    setReadingLink(true);
    try {
      const res = await extractUrlFn({ data: { projectId, url: value } });
      const suggestions = (res?.suggestions ?? {}) as Record<string, Record<string, string>>;
      if (!Object.keys(suggestions).length) {
        toast.info("Couldn't find brand detail on that page");
        return;
      }
      onApply(suggestions, overwrite);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that page");
    } finally {
      setReadingLink(false);
    }
  }


  async function refresh() {
    try {
      const rows = (await listFn({ data: { projectId } })) as BrainAsset[];
      setDocs(rows.filter((r) => r.kind === "strategy_doc"));
    } catch { /* ignore */ }
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId]);

  async function upload(file: File) {
    setUploading(true);
    try {
      const { path, token } = await createUrlFn({ data: { projectId, kind: "strategy_doc", filename: file.name } });
      const { error } = await supabase.storage.from("scheduler-media").uploadToSignedUrl(path, token, file);
      if (error) throw error;
      await registerFn({ data: { projectId, kind: "strategy_doc", storagePath: path, label: file.name } });
      await refresh();
      toast.success("Document uploaded — now hit Auto-fill");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function autofill(assetId: string) {
    setReadingId(assetId);
    try {
      const res = await extractFn({ data: { projectId, assetId } });
      const suggestions = (res?.suggestions ?? {}) as Record<string, Record<string, string>>;
      if (!Object.keys(suggestions).length) {
        toast.info("Couldn't find brand detail in that document");
        return;
      }
      onApply(suggestions, overwrite);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that document");
    } finally {
      setReadingId(null);
    }
  }

  return (
    <section style={{ ...CARD, marginBottom: 14, border: "1px solid rgba(255,92,147,.35)" }}>
      <h2 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 14, color: PINK, margin: "0 0 4px", letterSpacing: ".04em", textTransform: "uppercase" }}>
        Start from your marketing strategy
      </h2>
      <p style={{ color: GREY, fontSize: 12, margin: "0 0 12px", lineHeight: 1.5 }}>
        Already have a marketing strategy, brand guide or company profile? Upload it and we&rsquo;ll suggest values for the
        fields below. PDF, text or image. Nothing is stored on your profile until you save.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, background: PINK, color: NAVY, fontWeight: 800, fontSize: 12.5, padding: "9px 14px", borderRadius: 10, cursor: uploading ? "wait" : "pointer" }}>
          {uploading ? "Uploading…" : "＋ Upload marketing strategy"}
          <input
            type="file"
            accept="application/pdf,text/plain,text/markdown,image/*"
            style={{ display: "none" }}
            disabled={uploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.currentTarget.value = ""; }}
          />
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, color: GREY, fontSize: 12 }}>
          <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
          Overwrite fields I&rsquo;ve already filled
        </label>
      </div>

      <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: GREY }}>Or paste a link</span>
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !readingLink) void autofillFromLink(); }}
          placeholder="yourwebsite.com, an About page or a blog post"
          style={{ flex: "1 1 260px", minWidth: 200, padding: "9px 12px", borderRadius: 10, border: "1px solid #E6E6EC", background: "#FFFFFF", color: "#171D41", fontSize: 12.5, fontFamily: "inherit" }}
        />
        <button
          type="button"
          onClick={() => void autofillFromLink()}
          disabled={readingLink}
          style={{ background: "#553EA2", border: "none", color: "#fff", fontWeight: 800, fontSize: 12.5, padding: "9px 16px", borderRadius: 10, cursor: readingLink ? "wait" : "pointer", fontFamily: "inherit" }}
        >
          {readingLink ? "Reading…" : "Read this page"}
        </button>
      </div>

      {docs.length > 0 && (
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          {docs.map((d) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, background: `${LINE}`, borderRadius: 10, padding: "8px 10px", flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 120, fontSize: 12.5, color: "#e7e7f5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                📄 {d.label ?? "Document"}
              </span>
              <button
                type="button"
                onClick={() => autofill(d.id)}
                disabled={readingId === d.id}
                style={{ background: "rgba(255,92,147,.15)", border: "1px solid rgba(255,92,147,.5)", color: PINK, fontWeight: 700, fontSize: 12, padding: "6px 10px", borderRadius: 8, cursor: "pointer" }}
              >
                {readingId === d.id ? "Reading…" : "✨ Auto-fill"}
              </button>
              <button
                type="button"
                onClick={async () => { if (confirm("Remove this document?")) { await deleteFn({ data: { id: d.id } }); await refresh(); } }}
                style={{ background: "transparent", border: "none", color: GREY, fontSize: 14, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
