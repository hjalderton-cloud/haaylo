import { createFileRoute } from "@tanstack/react-router";

/**
 * Live competitor web scan.
 *
 * Takes a list of competitor names or URLs, resolves each to a website,
 * fetches the homepage plus up to 2 content pages (blog / news / insights),
 * strips them to plain text and returns that as source material so the
 * Competitor Radar can analyse what competitors ACTUALLY publish instead of
 * guessing from the model's memory.
 *
 * Gated by the project's publishable apikey header (same key the engine
 * already holds) so it isn't an open web-proxy.
 */

const MAX_COMPETITORS = 6;
const MAX_PAGES_PER_COMPETITOR = 3;
const MAX_CHARS_PER_PAGE = 3500;
const FETCH_TIMEOUT_MS = 9000;

const UA =
  "Mozilla/5.0 (compatible; HaayloCompetitorRadar/1.0; +https://haaylo.com)";

type Page = { url: string; title: string; text: string };
type ScanResult = {
  input: string;
  site: string | null;
  pages: Page[];
  error?: string;
};

async function timedFetch(url: string): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("html") && ct !== "") return null;
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|section|article|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

function titleOf(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m && m[1] ? htmlToText(m[1]).slice(0, 140) : "";
}

function looksLikeUrl(s: string): boolean {
  return /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(s.trim());
}

function toUrl(s: string): string {
  const v = s.trim();
  return /^https?:\/\//i.test(v) ? v : `https://${v.replace(/^\/+/, "")}`;
}

/** Best-effort name -> website resolution via DuckDuckGo's HTML endpoint. */
async function resolveSite(name: string): Promise<string | null> {
  const res = await timedFetch(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(name + " official site")}`,
  );
  if (!res) return null;
  const html = await res.text();
  const matches = [...html.matchAll(/uddg=([^"&]+)/g)];
  for (const m of matches) {
    try {
      const target = decodeURIComponent(m[1] as string);
      const host = new URL(target).hostname;
      if (/duckduckgo|wikipedia|facebook|linkedin|instagram|youtube|twitter|x\.com|yell\.com|trustpilot/i.test(host))
        continue;
      return `https://${host}`;
    } catch {
      /* skip */
    }
  }
  return null;
}

/** Pick up to N content-ish internal links from a homepage. */
function contentLinks(html: string, origin: string, limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < limit) {
    const raw = m[1] as string;
    if (!/blog|news|insight|article|resources|case-stud|guide|post/i.test(raw)) continue;
    let abs: string;
    try {
      abs = new URL(raw, origin).toString();
    } catch {
      continue;
    }
    if (!abs.startsWith(origin)) continue;
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push(abs);
  }
  return out;
}

async function scanOne(input: string): Promise<ScanResult> {
  const name = input.trim();
  const site = looksLikeUrl(name) ? toUrl(name) : await resolveSite(name);
  if (!site) return { input: name, site: null, pages: [], error: "Could not find a website for this competitor" };

  const homeRes = await timedFetch(site);
  if (!homeRes) return { input: name, site, pages: [], error: "Website did not respond or blocked the scan" };

  const finalUrl = homeRes.url || site;
  const origin = new URL(finalUrl).origin;
  const homeHtml = await homeRes.text();
  const pages: Page[] = [
    { url: finalUrl, title: titleOf(homeHtml), text: htmlToText(homeHtml).slice(0, MAX_CHARS_PER_PAGE) },
  ];

  const links = contentLinks(homeHtml, origin, MAX_PAGES_PER_COMPETITOR - 1);
  const extra = await Promise.all(
    links.map(async (l) => {
      const r = await timedFetch(l);
      if (!r) return null;
      const h = await r.text();
      const text = htmlToText(h).slice(0, MAX_CHARS_PER_PAGE);
      if (text.length < 200) return null;
      return { url: r.url || l, title: titleOf(h), text } as Page;
    }),
  );
  for (const p of extra) if (p) pages.push(p);

  return { input: name, site: origin, pages };
}

export const Route = createFileRoute("/api/public/competitor-scan")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "content-type, apikey",
            "access-control-allow-methods": "POST, OPTIONS",
          },
        }),
      POST: async ({ request }) => {
        const expected =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ||
          process.env["SUPABASE_ANON_KEY"] ||
          import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const provided = request.headers.get("apikey");
        if (!expected || provided !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        let body: { competitors?: unknown };
        try {
          body = (await request.json()) as { competitors?: unknown };
        } catch {
          return new Response(JSON.stringify({ error: "invalid json" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const list = Array.isArray(body.competitors)
          ? body.competitors
          : String(body.competitors ?? "")
              .split(/[\n,]/)
              .map((s) => s.trim());

        const targets = list
          .map((s) => String(s).trim())
          .filter(Boolean)
          .slice(0, MAX_COMPETITORS);

        if (!targets.length) {
          return new Response(JSON.stringify({ error: "no competitors provided" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const results = await Promise.all(
          targets.map(async (t) => {
            try {
              return await scanOne(t);
            } catch (e) {
              return {
                input: t,
                site: null,
                pages: [],
                error: e instanceof Error ? e.message : "scan failed",
              } as ScanResult;
            }
          }),
        );

        return new Response(JSON.stringify({ results, scannedAt: new Date().toISOString() }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "access-control-allow-origin": "*",
          },
        });
      },
    },
  },
});
