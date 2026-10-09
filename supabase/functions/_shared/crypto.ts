// AES-GCM encrypt/decrypt of OAuth tokens using TOKEN_ENCRYPTION_KEY.
// Output format: base64( iv(12) || ciphertext || tag(16) ).

const KEY_B64 = Deno.env.get("TOKEN_ENCRYPTION_KEY") ?? "";

async function getKey(): Promise<CryptoKey> {
  if (!KEY_B64) throw new Error("TOKEN_ENCRYPTION_KEY not set");
  // Accept either raw base64 32 bytes or a longer string we hash to 32 bytes.
  let raw: Uint8Array;
  try {
    const decoded = Uint8Array.from(atob(KEY_B64), (c) => c.charCodeAt(0));
    if (decoded.length === 32) raw = decoded;
    else throw new Error("not 32");
  } catch {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(KEY_B64));
    raw = new Uint8Array(hash);
  }
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encryptToken(plain: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return b64encode(out);
}

export async function decryptToken(payload: string): Promise<string> {
  const key = await getKey();
  const buf = b64decode(payload);
  const iv = buf.slice(0, 12);
  const ct = buf.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// HMAC-signed state token for OAuth round trips.
export async function signState(payload: Record<string, unknown>): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(Deno.env.get("TOKEN_ENCRYPTION_KEY") ?? ""),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const body = btoa(JSON.stringify({ ...payload, t: Date.now() }))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
  );
  return `${body}.${b64encode(sig).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")}`;
}

export async function verifyState(token: string): Promise<Record<string, unknown> | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(Deno.env.get("TOKEN_ENCRYPTION_KEY") ?? ""),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
  );
  const gotPadded = sig.replaceAll("-", "+").replaceAll("_", "/") +
    "=".repeat((4 - (sig.length % 4)) % 4);
  const got = b64decode(gotPadded);
  if (got.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ expected[i];
  if (diff !== 0) return null;
  const padded = body.replaceAll("-", "+").replaceAll("_", "/") +
    "=".repeat((4 - (body.length % 4)) % 4);
  const parsed = JSON.parse(atob(padded));
  if (Date.now() - (parsed.t ?? 0) > 10 * 60 * 1000) return null; // 10 min expiry
  return parsed;
}
