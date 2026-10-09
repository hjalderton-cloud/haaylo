/**
 * Approval binding helpers.
 *
 * An approval is only valid when it is bound to the same user, workspace, tool
 * and the exact validated inputs it was raised for. Inputs are fingerprinted
 * with a stable hash so a caller cannot approve one thing and run another.
 */

/** Deterministic JSON: object keys sorted at every depth. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

/** SHA-256 fingerprint of tool + workspace + validated inputs. */
export async function fingerprint(
  toolName: string,
  workspaceId: string,
  input: unknown,
): Promise<string> {
  const payload = `${toolName}|${workspaceId}|${stableStringify(input)}`;
  const bytes = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** How long a granted approval stays usable before it has to be asked for again. */
export const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

export type ApprovalRow = {
  id: string;
  user_id: string;
  project_id: string;
  tool_name: string;
  risk: string;
  summary: string | null;
  input: Record<string, unknown>;
  input_hash: string;
  status: string;
  reason: string | null;
  error: string | null;
  result: unknown;
  expires_at: string | null;
  decided_at: string | null;
  executed_at: string | null;
  created_at: string;
};

/**
 * Fails closed. Returns nothing; throws with a plain-language reason when the
 * approval cannot be used for this exact call.
 */
export function assertApprovalUsable(
  approval: ApprovalRow | null | undefined,
  args: { userId: string; workspaceId: string; toolName: string; hash: string },
): asserts approval is ApprovalRow {
  if (!approval) throw new Error("That request has not been approved.");
  if (approval.user_id !== args.userId) throw new Error("That approval belongs to someone else.");
  if (approval.project_id !== args.workspaceId)
    throw new Error("That approval was given for a different workspace.");
  if (approval.tool_name !== args.toolName)
    throw new Error("That approval was given for a different action.");
  if (approval.status === "pending") throw new Error("That request is still waiting for approval.");
  if (approval.status === "rejected") throw new Error("That request was turned down.");
  if (approval.status === "executed") throw new Error("That approval has already been used.");
  if (approval.status !== "approved") throw new Error("That approval is no longer usable.");
  if (approval.input_hash !== args.hash)
    throw new Error("The details changed since approval — ask again.");
  if (approval.expires_at && Date.parse(approval.expires_at) < Date.now())
    throw new Error("That approval has expired — ask again.");
}

/** Short plain-language line describing what is being asked for. */
export function summarise(toolName: string, input: Record<string, unknown>): string {
  const s = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : "");
  switch (toolName) {
    case "create_campaign":
      return `Create the campaign "${s("title")}"`;
    case "update_campaign":
      return "Change which plan weeks a campaign covers";
    case "create_strategy":
      return "Write and save a new 90-day plan, replacing the current one";
    case "create_lead_magnet":
      return "Write and save the lead magnet copy";
    case "create_email_draft":
      return "Write and save the funnel email sequence";
    case "create_landing_page":
      return "Create a new draft landing page";
    case "save_asset":
      return `Save "${s("title") || "an item"}" to the Content Bank`;
    case "schedule_content":
      return input["scheduledAt"]
        ? `Schedule a post for ${String(input["scheduledAt"])}`
        : "Remove a post's schedule";
    case "publish_content":
      return "Send a post to your connected accounts";
    case "send_email_campaign":
      return input["scheduledAt"]
        ? `Send "${s("subject")}" to your Mailchimp audience on ${String(input["scheduledAt"])}`
        : `Create "${s("subject")}" in Mailchimp as an unsent draft`;
    default:
      return `Run ${toolName}`;
  }
}
