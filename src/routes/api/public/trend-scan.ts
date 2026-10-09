import { createFileRoute } from "@tanstack/react-router";

/**
 * Live trend scan.
 *
 * Pulls fresh, dated headlines from Google News RSS plus a general web search
 * for a set of trend queries built from the user's industry, audience and
 * keywords. Returns raw source material (title, source, date, link, snippet)
 * so the Trend Radar module can ground its analysis in what is ACTUALLY being
 * published right now instead of the model's training memory.
 *
 * Gated by the project's publishable apikey header (same key the engine holds).
 */

const MAX_QUERIES = 8;
const MAX_ITEMS_PER_QUERY = 8;
const FETCH_TIMEOUT_MS = 9000;

const UA = "Mozilla/5.0 (compatible; HaayloTrendRadar/1.0; +https://haaylo.com)";

type Item = {
  query: string;
  title: string;
  source: string;
  published: string | null;
  url: string;
  snippet: string;
};

async function timedFetch(url: string, accept: string): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "user-agent": UA, accept },
    });
    if (!res.ok) return null;
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m && m[1] ? decode(m[1]) : "";
}

/** Fresh dated headlines for a query (UK edition, last 30 days). */
async function newsFor(query: string, region: string): Promise<Item[]> {
  const gl = region === "US" ? "US" : "GB";
  const hl = gl === "US" ? "en-US" : "en-GB";
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
    `${query} when:30d`,
  )}&hl=${hl}&gl=${gl}&ceid=${gl}:en`;
  const res = await timedFetch(url, "application/rss+xml, application/xml, text/xml");
  if (!res) return [];
  const xml = await res.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, MAX_ITEMS_PER_QUERY);
  return items.map((m) => {
    const block = m[1] as string;
    const pub = tag(block, "pubDate");
    return {
      query,
      title: tag(block, "title").slice(0, 200),
      source: tag(block, "source").slice(0, 80),
      published: pub ? new Date(pub).toISOString().slice(0, 10) : null,
      url: tag(block, "link").slice(0, 400),
      snippet: tag(block, "description").slice(0, 300),
    } satisfies Item;
  });
}

/** General web results (blogs, guides, discussions) via DuckDuckGo HTML. */
async function webFor(query: string): Promise<Item[]> {
  const res = await timedFetch(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    "text/html",
  );
  if (!res) return [];
  const html = await res.text();
  const out: Item[] = [];
  const re =
    /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]{0,900}?)result__snippet[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < MAX_ITEMS_PER_QUERY) {
    let link = m[1] as string;
    const uddg = link.match(/uddg=([^&]+)/);
    if (uddg && uddg[1]) {
      try {
        link = decodeURIComponent(uddg[1]);
      } catch {
        /* keep raw */
      }
    }
    let host = "";
    try {
      host = new URL(link).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    out.push({
      query,
      title: decode(m[2] as string).slice(0, 200),
      source: host,
      published: null,
      url: link.slice(0, 400),
      snippet: decode(m[4] as string).slice(0, 300),
    });
  }
  return out;
}

function buildQueries(input: {
  industry: string;
  audience: string;
  keywords: string;
  channels: string;
}): string[] {
  const industry = input.industry.trim();
  const audience = input.audience.trim();
  const kws = input.keywords
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  const channels = input.channels
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 2);

  const base = industry || audience || "small business";
  const q = [
    `${base} trends`,
    `${base} news`,
    `${base} industry report`,
    audience ? `${audience} ${base} what customers want` : `${base} customer behaviour`,
    ...kws.map((k) => `${k} trend`),
    ...channels.map((c) => `${base} ${c} content trends`),
  ];
  return [...new Set(q.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean))].slice(
    0,
    MAX_QUERIES,
  );
}

export const Route = createFileRoute("/api/public/trend-scan")({
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

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return new Response(JSON.stringify({ error: "invalid json" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const str = (k: string) => String(body[k] ?? "").slice(0, 300);
        const queries = buildQueries({
          industry: str("industry"),
          audience: str("audience"),
          keywords: str("keywords"),
          channels: str("channels"),
        });

        if (!queries.length) {
          return new Response(JSON.stringify({ error: "nothing to scan" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const batches = await Promise.all(
          queries.map(async (q, i) => {
            try {
              // News for every query; web results for the first few (slower endpoint).
              const [news, web] = await Promise.all([
                newsFor(q, str("region") === "US" ? "US" : "GB"),
                i < 4 ? webFor(q) : Promise.resolve([] as Item[]),
              ]);
              return [...news, ...web];
            } catch {
              return [] as Item[];
            }
          }),
        );

        const seen = new Set<string>();
        const items: Item[] = [];
        for (const b of batches) {
          for (const it of b) {
            const key = it.title.toLowerCase().slice(0, 80);
            if (!it.title || seen.has(key)) continue;
            seen.add(key);
            items.push(it);
          }
        }

        // Fallback: if every upstream query came back empty (rate limit, timeout,
        // or an over-specific niche), retry with broader queries so the module
        // still has live material to work with.
        if (!items.length) {
          const base = (str("industry") || str("audience") || "small business").trim();
          const fallback = [base, `${base} UK`, "small business marketing trends"];
          const region = str("region") === "US" ? "US" : "GB";
          const more = await Promise.all(
            fallback.map(async (q) => {
              try {
                const [news, web] = await Promise.all([newsFor(q, region), webFor(q)]);
                return [...news, ...web];
              } catch {
                return [] as Item[];
              }
            }),
          );
          for (const b of more) {
            for (const it of b) {
              const key = it.title.toLowerCase().slice(0, 80);
              if (!it.title || seen.has(key)) continue;
              seen.add(key);
              items.push(it);
            }
          }
        }


        return new Response(
          JSON.stringify({ queries, items, scannedAt: new Date().toISOString() }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "access-control-allow-origin": "*",
            },
          },
        );
      },
    },
  },
});
