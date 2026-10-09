import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnedWorkspace } from "./guards";
import {
  fetchBrandContextInput,
  fetchStrategyInput,
  fetchPreviousContentInput,
  fetchCampaignInput,
  fetchAnalyticsInput,
  createSocialContentInput,
} from "./schemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { userId: string; supabase: any };

/**
 * Direct server functions for the LOW-risk tools — reads and draft creation.
 * They need no approval, so they are callable on their own.
 *
 * Every adapter:
 * 1. Runs behind requireSupabaseAuth (same as all Haaylo server functions).
 * 2. Validates the Agent input (mandatory workspaceId, draft-only constraints).
 * 3. Verifies the caller owns the workspace.
 * 4. Delegates to the shared runner in runners.server.ts.
 *
 * MEDIUM and HIGH risk tools are not exposed here. They run only through
 * `runRegistryTool` / `approveAndRun` in approvals.functions.ts, which require
 * an approval bound to the exact inputs.
 */

export const fetchBrandContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => fetchBrandContextInput.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertOwnedWorkspace(ctx, data.workspaceId);
    const { runFetchBrandContext } = await import("./runners.server");
    return (await runFetchBrandContext(ctx, data)) as never;
  });

export const fetchStrategy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => fetchStrategyInput.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertOwnedWorkspace(ctx, data.workspaceId);
    const { runFetchStrategy } = await import("./runners.server");
    return (await runFetchStrategy(ctx, data)) as never;
  });

export const fetchPreviousContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => fetchPreviousContentInput.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertOwnedWorkspace(ctx, data.workspaceId);
    const { runFetchPreviousContent } = await import("./runners.server");
    return (await runFetchPreviousContent(ctx, data)) as never;
  });

export const fetchCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => fetchCampaignInput.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertOwnedWorkspace(ctx, data.workspaceId);
    const { runFetchCampaign } = await import("./runners.server");
    return (await runFetchCampaign(ctx, data)) as never;
  });

export const fetchAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => fetchAnalyticsInput.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertOwnedWorkspace(ctx, data.workspaceId);
    const { runFetchAnalytics } = await import("./runners.server");
    return (await runFetchAnalytics(ctx, data)) as never;
  });

export const createSocialContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createSocialContentInput.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertOwnedWorkspace(ctx, data.workspaceId);
    const { runCreateSocialContent } = await import("./runners.server");
    return (await runCreateSocialContent(ctx, data)) as never;
  });
