// Server-only Stripe REST helpers. Worker-safe (plain fetch, no Node SDK).
const STRIPE_API = "https://api.stripe.com/v1";

function encode(obj: Record<string, unknown>, prefix = ""): string[] {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item && typeof item === "object") {
          parts.push(...encode(item as Record<string, unknown>, `${key}[${i}]`));
        } else {
          parts.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else if (typeof v === "object") {
      parts.push(...encode(v as Record<string, unknown>, key));
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts;
}

export async function stripeRequest<T = any>(
  path: string,
  init: { method?: "GET" | "POST"; body?: Record<string, unknown> } = {},
): Promise<T> {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) throw new Error("Stripe is not configured");
  const method = init.method ?? (init.body ? "POST" : "GET");
  const encoded = init.body ? encode(init.body).join("&") : "";
  const url = method === "GET" && encoded ? `${STRIPE_API}${path}?${encoded}` : `${STRIPE_API}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    ...(method === "POST" ? { body: encoded } : {}),
  });
  const json = (await res.json()) as any;
  if (!res.ok) {
    throw new Error(json?.error?.message ?? `Stripe request failed (${res.status})`);
  }
  return json as T;
}

export function serverPriceId(membershipType: string): string | undefined {
  if (membershipType === "founding_early") return process.env["STRIPE_FOUNDING_EARLY_PRICE_ID"];
  if (membershipType === "founding_launch") return process.env["STRIPE_FOUNDING_LAUNCH_PRICE_ID"];
  return process.env["STRIPE_STANDARD_MONTHLY_PRICE_ID"];
}
