import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { BRAIN_SECTIONS } from "./brain-schema";

/**
 * Reads an uploaded strategy / brand document from storage and asks the AI to
 * map its contents onto Strategy Profile fields. Returns suggestions only —
 * the user reviews and applies them in the UI.
 */
export const extractBrainFromDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; assetId: string }) =>
    z.object({ projectId: z.string().uuid(), assetId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ suggestions: Record<string, Record<string, string>> }> => {
    const { data: asset } = await context.supabase
      .from("brain_assets")
      .select("id, storage_path, label, project_id")
      .eq("id", data.assetId)
      .eq("project_id", data.projectId)
      .maybeSingle();
    if (!asset) throw new Error("Document not found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: blob, error } = await supabaseAdmin.storage
      .from("scheduler-media")
      .download(asset.storage_path);
    if (error || !blob) throw new Error(error?.message ?? "Could not read the document");

    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.byteLength > 12 * 1024 * 1024) {
      throw new Error("That document is too large (max 12MB). Upload a smaller version.");
    }
    const name = (asset.label ?? asset.storage_path.split("/").pop() ?? "document").toLowerCase();
    const ext = name.split(".").pop() ?? "";
    const mime =
      ext === "pdf" ? "application/pdf"
      : ext === "png" ? "image/png"
      : ext === "jpg" || ext === "jpeg" ? "image/jpeg"
      : ext === "webp" ? "image/webp"
      : ext === "md" ? "text/markdown"
      : "text/plain";

    let plainText = "";
    if (mime.startsWith("text/")) {
      plainText = new TextDecoder().decode(bytes).slice(0, 120_000);
    }

    let base64 = "";
    if (!plainText) {
      let bin = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      base64 = btoa(bin);
    }

    const fieldList = BRAIN_SECTIONS.flatMap((s) =>
      s.fields.map((f) => `${String(s.key)}.${f.key} — ${s.title} / ${f.label}`),
    ).join("\n");

    const system = `You extract structured brand information from a business/marketing document and map it onto a fixed Strategy Profile schema.

RULES:
- Only use information that is actually present in the document. Never invent, infer beyond what is written, or pad with generic marketing filler.
- If a field is not covered by the document, omit that key entirely.
- Keep the document's own wording where possible. British English.
- Multi-item fields (testimonials, values, pain points, etc.) may use short newline-separated bullet lines.
- Return strict JSON only, shaped as {"suggestions": {"<section>": {"<field>": "<value>"}}} using ONLY these keys:
${fieldList}
No markdown, no commentary.`;

    const userContent: Array<Record<string, unknown>> = [
      { type: "text", text: `Extract Strategy Profile fields from this document (filename: ${name}).` },
    ];
    if (plainText) userContent.push({ type: "text", text: plainText });
    else if (mime.startsWith("image/")) userContent.push({ type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } });
    else userContent.push({ type: "file", file: { filename: name, file_data: `data:${mime};base64,${base64}` } });

    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Document read failed [${res.status}]: ${body.slice(0, 300)}`);
    }
    const json = await res.json();
    const text: string = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: { suggestions?: Record<string, Record<string, string>> };
    try { parsed = JSON.parse(text); } catch { parsed = {}; }

    // Keep only keys that exist in the schema.
    const clean: Record<string, Record<string, string>> = {};
    for (const s of BRAIN_SECTIONS) {
      const sect = parsed.suggestions?.[String(s.key)];
      if (!sect) continue;
      for (const f of s.fields) {
        const v = sect[f.key];
        if (typeof v === "string" && v.trim()) {
          clean[String(s.key)] = clean[String(s.key)] ?? {};
          clean[String(s.key)][f.key] = v.trim().slice(0, 4000);
        }
      }
    }
    return { suggestions: clean };
  });

/**
 * Reads a website or blog page and maps what it says onto Strategy Profile
 * fields. Suggestions only — the user reviews and applies them in the UI.
 */
export const extractBrainFromUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; url: string }) =>
    z.object({ projectId: z.string().uuid(), url: z.string().trim().min(3).max(500) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ suggestions: Record<string, Record<string, string>> }> => {
    const { data: project } = await context.supabase
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project) throw new Error("Pick a workspace first, then try again.");

    const { looksLikeUrl, toUrl, readSite } = await import("./site-read");
    if (!looksLikeUrl(data.url)) throw new Error("That doesn't look like a web address.");
    const url = toUrl(data.url);
    const site = await readSite(url);
    if (site.text.length < 200) {
      throw new Error("That page couldn't be read. Try another link, or upload a document instead.");
    }

    const fieldList = BRAIN_SECTIONS.flatMap((s) =>
      s.fields.map((f) => `${String(s.key)}.${f.key} — ${s.title} / ${f.label}`),
    ).join("\n");

    const system = `You extract structured brand information from a company's own website copy and map it onto a fixed Strategy Profile schema.

RULES:
- Only use information that is actually present in the page copy. Never invent, infer beyond what is written, or pad with generic marketing filler.
- If a field is not covered by the copy, omit that key entirely.
- Keep the page's own wording where possible. British English.
- Never use these words or phrasings: crucial, tapestry, dive deep, more than just, look no further, elevate, testament, game-changer, foster, unlock, supercharge, or 'not X, it's Y'.
- Multi-item fields (testimonials, values, pain points, etc.) may use short newline-separated bullet lines.
- Return strict JSON only, shaped as {"suggestions": {"<section>": {"<field>": "<value>"}}} using ONLY these keys:
${fieldList}
No markdown, no commentary.`;

    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Extract Strategy Profile fields from this website copy (${url}).\n\n${site.text}` },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      if (res.status === 429) throw new Error("The AI is busy right now — try again in a moment.");
      if (res.status === 402) throw new Error("You've run out of AI credits. Top them up, then try again.");
      const body = await res.text();
      throw new Error(`Reading that page failed [${res.status}]: ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = (json.choices?.[0]?.message?.content ?? "{}").replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    let parsed: { suggestions?: Record<string, Record<string, string>> };
    try { parsed = JSON.parse(text) as typeof parsed; } catch { parsed = {}; }

    const clean: Record<string, Record<string, string>> = {};
    for (const s of BRAIN_SECTIONS) {
      const sect = parsed.suggestions?.[String(s.key)];
      if (!sect) continue;
      for (const f of s.fields) {
        const v = sect[f.key];
        if (typeof v === "string" && v.trim()) {
          clean[String(s.key)] = clean[String(s.key)] ?? {};
          clean[String(s.key)][f.key] = v.trim().slice(0, 4000);
        }
      }
    }
    return { suggestions: clean };
  });

