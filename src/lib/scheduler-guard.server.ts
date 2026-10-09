import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side backstop for the Planner paywall.
 *
 * The UI hides gated controls, but that alone is bypassable by calling the
 * server functions directly. Every connect/publish/upload path must call this.
 */
export async function assertSchedulerSubscription(
  supabase: SupabaseClient<any, any, any>,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("has_active_scheduler", {
    _user_id: userId,
  });
  if (error) throw new Error("Could not verify your Planner subscription.");
  if (data !== true) {
    throw new Error("A Planner subscription is required for this action.");
  }
}
