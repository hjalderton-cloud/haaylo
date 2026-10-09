/**
 * Shared best-effort website reader.
 * Used by the competitor scan, the competitor watch and Business Brain
 * auto-fill from a link. Failures are silent — callers decide what to say.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const TIMEOUT_MS = 9000;

export async function timedFetch(url: string): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-GB,en;q=0.9",
        "cache-control": "no-cache",
      },
    });
    const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";
    return res.ok && (contentType.includes("text/html") || contentType.includes("application/xhtml+xml"))
      ? res
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

export function looksLikeUrl(value: string): boolean {
  const v = value.trim();
  if (!v || /\s/.test(v)) return false;
  return /^https?:\/\//i.test(v) || /^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(v);
}

export function toUrl(value: string): string {
  const v = value.trim();
  return /^https?:\/\//i.test(v) ? v : `https://${v.replace(/^\/+/, "")}`;
}

/** Reads the given page plus a few obvious sibling pages. Best effort. */
export async function readSite(rootUrl: string): Promise<{ text: string; pages: string[] }> {
  const home = await timedFetch(rootUrl);
  if (!home) return { text: "", pages: [] };
  const base = home.url.replace(/\/+$/, "");
  const homeText = htmlToText(await home.text()).slice(0, 5000);
  // Only crawl siblings when the URL looks like a site root, not a deep article.
  const isRoot = (() => {
    try {
      return new URL(base).pathname.replace(/\/+$/, "") === "";
    } catch {
      return false;
    }
  })();
  const paths = isRoot ? ["/about", "/blog", "/services"] : [];
  const extra = await Promise.all(
    paths.map(async (p) => {
      const res = await timedFetch(`${base}${p}`);
      if (!res) return null;
      return { path: p, text: htmlToText(await res.text()).slice(0, 2500) };
    }),
  );
  const found = extra.filter((x): x is { path: string; text: string } => Boolean(x && x.text));
  const text = [`HOMEPAGE (${base}):\n${homeText}`, ...found.map((f) => `PAGE ${f.path}:\n${f.text}`)]
    .join("\n\n")
    .slice(0, 12000);
  return { text, pages: [base, ...found.map((f) => `${base}${f.path}`)] };
}

/** Stable short hash of the read text, for spotting changes between checks. */
export function fingerprint(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c, 2246822519) >>> 0;
  }
  return `${h1.toString(16)}${h2.toString(16)}`;
}
