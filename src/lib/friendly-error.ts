// Turns raw service errors into plain English a customer can act on.
const RULES: Array<[RegExp, string]> = [
  [/invalid login credentials/i, "That email and password don't match. Check them and try again."],
  [/email not confirmed/i, "Please confirm your email address first — check your inbox for the link."],
  [/user already registered|already been registered/i, "You already have an account with that email. Sign in instead."],
  [/password should be at least/i, "Your password needs to be at least 6 characters."],
  [/unable to validate email address|invalid email/i, "That email address doesn't look right."],
  [/for security purposes|rate limit|too many requests/i, "Too many attempts just then. Wait a minute and try again."],
  [/email rate limit exceeded/i, "We've sent a few emails to that address already. Wait a few minutes and try again."],
  [/unsupported provider|provider is not enabled/i, "Signing in with Google isn't available right now. Use your email and password."],
  [/popup closed|access_denied|cancelled|canceled/i, "Sign-in was cancelled."],
  [/stripe is not configured|no such price|api key/i, "Payments aren't available right now. Please try again shortly."],
  [/network|fetch failed|failed to fetch|timeout/i, "We couldn't reach the server. Check your connection and try again."],
  [/not found|no rows/i, "We couldn't find that."],
  [/unauthorized|401|jwt|session/i, "Your session has expired. Please sign in again."],
];

export function friendlyError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!raw) return fallback;
  for (const [pattern, message] of RULES) {
    if (pattern.test(raw)) return message;
  }
  // Anything technical-looking (codes, stack fragments, JSON) gets the fallback.
  if (/[{}<>]|https?:\/\/|error code|\b[A-Z_]{5,}\b/.test(raw) || raw.length > 120) return fallback;
  return raw;
}
