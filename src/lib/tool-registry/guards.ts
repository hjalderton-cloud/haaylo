/**
 * Server-side workspace safety guards.
 *
 * Every adapter calls `assertOwnedWorkspace` before any other work. This verifies
 * that the authenticated user owns the requested workspace, preventing cross-
 * workspace data leakage. The Agent must never infer or switch workspaces.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { userId: string; supabase: any };

/**
 * Throws if the user does not own the workspace, or if the lookup fails.
 * This mirrors the `requireOwnedProject` pattern already used across the app
 * but is shared here so every adapter uses the same check.
 */
export async function assertOwnedWorkspace(ctx: Ctx, workspaceId: string): Promise<void> {
  const { data, error } = await ctx.supabase
    .from("projects")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("id", workspaceId)
    .maybeSingle();
  if (error || !data?.id) {
    throw new Error("That workspace is not available.");
  }
}

/**
 * Throws if the campaign does not belong to the given workspace.
 * Used before linking a post to a campaign to prevent cross-workspace references.
 */
export async function assertCampaignInWorkspace(
  ctx: Ctx,
  workspaceId: string,
  campaignId: string,
): Promise<void> {
  const { data, error } = await ctx.supabase
    .from("campaigns")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("project_id", workspaceId)
    .eq("id", campaignId)
    .maybeSingle();
  if (error || !data?.id) {
    throw new Error("That campaign is not in this workspace.");
  }
}
