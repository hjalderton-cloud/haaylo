/**
 * Renders one image-pack brief into a real picture and saves it back onto the
 * same Content Bank item. Status lives in meta.image_status:
 *   queued -> generating -> ready | failed (meta.image_error holds the reason).
 * The result always stays at meta.visual_approval = "required" until the owner signs it off.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { userId: string; supabase: any };

const GATEWAY_IMAGE = "https://ai.gateway.lovable.dev/v1/images/generations";
const GATEWAY_MODEL = "openai/gpt-image-2.5-sunburst";

async function makeImageStrict(prompt: string): Promise<string> {
  const { openAiKey, openAiGenerate } = await import("./openai-image.server");
  if (openAiKey()) {
    const b64 = await openAiGenerate({ prompt, size: "1024x1024" });
    if (!b64) throw new Error("No picture came back. Try again.");
    return b64;
  }
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Image generation isn't set up for this account.");
  const res = await fetch(GATEWAY_IMAGE, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: GATEWAY_MODEL, prompt: prompt.slice(0, 30_000), size: "1024x1024" }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("Too many image requests at once. Try again in a moment.");
    if (res.status === 402) throw new Error("Out of AI credits. Top up, then retry.");
    if (res.status === 403) throw new Error("The image service declined this request.");
    throw new Error(`Image generation failed (${res.status}): ${txt.slice(0, 160)}`);
  }
  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json as string | undefined;
  if (!b64) throw new Error("No picture came back. Try again.");
  return b64;
}

export async function renderBankImage(ctx: Ctx, itemId: string) {
  const { data: item, error } = await ctx.supabase
    .from("content_bank_items")
    .select("id, kind, body, meta")
    .eq("user_id", ctx.userId)
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!item) throw new Error("That image isn't here any more.");
  const meta = { ...((item.meta ?? {}) as Record<string, unknown>) };
  const prompt = String(meta["prompt"] ?? item.body ?? "").trim();
  if (!prompt) throw new Error("This image has no brief to work from.");

  const save = (patch: Record<string, unknown>, kind?: string) =>
    ctx.supabase
      .from("content_bank_items")
      .update({ meta: { ...meta, ...patch }, ...(kind ? { kind } : {}) })
      .eq("user_id", ctx.userId)
      .eq("id", itemId);

  await save({ image_status: "generating", image_error: null });
  try {
    const b64 = await makeImageStrict(prompt);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${ctx.userId}/campaign/${crypto.randomUUID()}.png`;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const up = await supabaseAdmin.storage.from("scheduler-media").upload(path, bytes, { contentType: "image/png", upsert: false });
    if (up.error) throw new Error("The picture was made but couldn't be saved. Try again.");
    const { data: signed } = await supabaseAdmin.storage.from("scheduler-media").createSignedUrl(path, 60 * 60 * 24 * 365);
    const url = signed?.signedUrl ?? null;
    if (!url) throw new Error("The picture was saved but couldn't be shown. Try again.");
    const patch = { image_status: "ready", image_error: null, url, path, visual_approval: "required" };
    await save(patch, "image");
    return { status: "ready" as const, url, path, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Image generation failed.";
    await save({ image_status: "failed", image_error: msg.slice(0, 300) });
    return { status: "failed" as const, url: null, path: null, error: msg };
  }
}
