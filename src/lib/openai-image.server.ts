/**
 * Image generation through the account's own OpenAI API key.
 *
 * When OPENAI_API_KEY is configured, every image request in Haaylo is billed to
 * that OpenAI account instead of consuming Lovable AI credits. If the key is
 * absent we return null so callers fall back to the built-in gateway model.
 */

const OPENAI_IMAGES = "https://api.openai.com/v1/images/generations";
const OPENAI_EDITS = "https://api.openai.com/v1/images/edits";
const MODEL = "gpt-image-1";

export type OpenAiSize = "1024x1024" | "1024x1536" | "1536x1024" | "auto";

export function openAiKey(): string | undefined {
  const k = process.env.OPENAI_API_KEY;
  return k && k.trim().length > 20 ? k.trim() : undefined;
}

function friendlyError(status: number, body: string): Error {
  if (status === 429) return new Error("OpenAI is rate limiting requests — try again in a moment.");
  if (status === 401) return new Error("Your OpenAI key was rejected. Check it in Settings.");
  if (status === 402 || /insufficient|quota|billing/i.test(body))
    return new Error("Your OpenAI account is out of credit. Top it up in your OpenAI billing settings.");
  if (/content_policy|safety/i.test(body))
    return new Error("OpenAI declined that prompt. Try rewording it.");
  return new Error(`Image generation failed (${status}): ${body.slice(0, 200)}`);
}

/** Plain text-to-image. Returns base64 PNG, or null when no OpenAI key is set. */
export async function openAiGenerate(opts: {
  prompt: string;
  size?: OpenAiSize;
  /** When false, a failure returns null instead of throwing. */
  strict?: boolean;
}): Promise<string | null> {
  const key = openAiKey();
  if (!key) return null;
  try {
    const res = await fetch(OPENAI_IMAGES, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        prompt: opts.prompt.slice(0, 30_000),
        size: opts.size ?? "1024x1024",
        quality: "high",
        n: 1,
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      if (opts.strict === false) return null;
      throw friendlyError(res.status, txt);
    }
    const json = await res.json();
    return (json?.data?.[0]?.b64_json as string | undefined) ?? null;
  } catch (err) {
    if (opts.strict === false) return null;
    throw err;
  }
}

async function fetchAsFile(url: string, name: string): Promise<File | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    const type = r.headers.get("content-type") ?? "image/png";
    return new File([buf], name, { type });
  } catch {
    return null;
  }
}

/**
 * Image-to-image: edits/extends the supplied images with an instruction.
 * Used both for refining an existing graphic and for generating with brand
 * reference images attached. Returns base64 PNG, or null when no key is set.
 */
export async function openAiEdit(opts: {
  prompt: string;
  imageUrls: string[];
  size?: OpenAiSize;
  strict?: boolean;
}): Promise<string | null> {
  const key = openAiKey();
  if (!key) return null;

  const files: File[] = [];
  let i = 0;
  for (const url of opts.imageUrls.slice(0, 4)) {
    const f = await fetchAsFile(url, `image-${i++}.png`);
    if (f) files.push(f);
  }
  if (!files.length) return openAiGenerate({ prompt: opts.prompt, ...(opts.size ? { size: opts.size } : {}), ...(opts.strict === false ? { strict: false } : {}) });

  const form = new FormData();
  form.append("model", MODEL);
  form.append("prompt", opts.prompt.slice(0, 30_000));
  form.append("size", opts.size ?? "1024x1024");
  form.append("quality", "high");
  form.append("n", "1");
  for (const f of files) form.append("image[]", f, f.name);

  try {
    const res = await fetch(OPENAI_EDITS, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      if (opts.strict === false) return null;
      throw friendlyError(res.status, txt);
    }
    const json = await res.json();
    return (json?.data?.[0]?.b64_json as string | undefined) ?? null;
  } catch (err) {
    if (opts.strict === false) return null;
    throw err;
  }
}

/** Maps a social platform to the closest supported OpenAI image size. */
export function sizeForPlatform(platform?: string): OpenAiSize {
  const p = (platform ?? "").toLowerCase();
  if (p.includes("linkedin") || p.includes("facebook") || p.includes("twitter") || p === "x")
    return "1536x1024";
  return "1024x1024";
}
