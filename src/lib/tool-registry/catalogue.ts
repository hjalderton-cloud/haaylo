import { z } from "zod";
import type { ToolDefinition } from "./types";
import {
  fetchBrandContextInput,
  fetchStrategyInput,
  fetchPreviousContentInput,
  fetchCampaignInput,
  fetchAnalyticsInput,
  createSocialContentInput,
  createCampaignInput,
  createStrategyInput,
  createEmailDraftInput,
  createLeadMagnetInput,
  createLandingPageInput,
  createImageInput,
  createContentCalendarInput,
  saveAssetInput,
  updateCampaignInput,
  scheduleContentInput,
  publishContentInput,
  sendEmailCampaignInput,
} from "./schemas";

const IMAGE_BLOCKED =
  "Image generation writes to media storage and returns signed URLs; it has no registry runner yet.";

/**
 * The Haaylo Tool Registry — the authoritative definition of Agent-callable tools.
 *
 * Stage 2: sixteen tools can execute.
 * - LOW risk (reads + draft creation) run on the Agent's own authority.
 * - MEDIUM and HIGH risk run only through an approval bound to the user,
 *   workspace, tool and the exact inputs that were approved.
 * - create_image and create_content_calendar remain unavailable, with reasons.
 */
export const catalogue: ToolDefinition[] = [
  // ── LOW: reads ────────────────────────────────────────────────────────────
  {
    name: "fetch_brand_context",
    description:
      "Read the Strategy Profile (brand voice, audience, offer, positioning) for a workspace. Returns the stored brain data and its last-updated timestamp.",
    inputSchema: fetchBrandContextInput,
    outputSchema: z.object({
      workspaceId: z.string(),
      data: z.record(z.string(), z.unknown()),
      updated_at: z.string().nullable(),
    }),
    workspaceRequired: true,
    permissions: ["authenticated", "workspace_owner"],
    risk: "LOW",
    approval: "never",
    available: true,
    backingAction: "getBrain",
    backingFile: "src/lib/brain.functions.ts",
  },
  {
    name: "fetch_strategy",
    description:
      "Read the 90-day strategy plan (goal, pillars, weekly themes) for a workspace. Returns null if no plan exists.",
    inputSchema: fetchStrategyInput,
    outputSchema: z.object({
      plan: z.unknown().nullable(),
      updatedAt: z.string().nullable(),
    }),
    workspaceRequired: true,
    permissions: ["authenticated", "workspace_owner"],
    risk: "LOW",
    approval: "never",
    available: true,
    backingAction: "getStrategyPlan",
    backingFile: "src/lib/strategy.functions.ts",
  },
  {
    name: "fetch_previous_content",
    description:
      "List saved posts and captions for a workspace, newest first. Optionally filter by status or campaign.",
    inputSchema: fetchPreviousContentInput,
    outputSchema: z.array(z.record(z.string(), z.unknown())),
    workspaceRequired: true,
    permissions: ["authenticated", "workspace_owner"],
    risk: "LOW",
    approval: "never",
    available: true,
    backingAction: "listContentPosts",
    backingFile: "src/lib/content.functions.ts",
  },
  {
    name: "fetch_campaign",
    description:
      "Read a single campaign record for a workspace, including its asset status, plan weeks and phase.",
    inputSchema: fetchCampaignInput,
    outputSchema: z.record(z.string(), z.unknown()).nullable(),
    workspaceRequired: true,
    permissions: ["authenticated", "workspace_owner"],
    risk: "LOW",
    approval: "never",
    available: true,
    backingAction: "getCampaign",
    backingFile: "src/lib/campaigns.functions.ts",
  },
  {
    name: "fetch_analytics",
    description:
      "Read saved content performance data for a workspace — posts with their status, platform, published date and any recorded external metrics. Does not fetch live social metrics.",
    inputSchema: fetchAnalyticsInput,
    outputSchema: z.object({
      posts: z.array(z.record(z.string(), z.unknown())),
    }),
    workspaceRequired: true,
    permissions: ["authenticated", "workspace_owner"],
    risk: "LOW",
    approval: "never",
    available: true,
    backingAction: "getContentPerformance",
    backingFile: "src/lib/content-performance.functions.ts",
  },

  // ── LOW: draft creation ──────────────────────────────────────────────────
  {
    name: "create_social_content",
    description:
      "Create a new social post as a draft in the workspace. The post is always saved as 'draft' — it is never scheduled or published. An optional campaign can be linked.",
    inputSchema: createSocialContentInput,
    outputSchema: z.record(z.string(), z.unknown()),
    workspaceRequired: true,
    permissions: ["authenticated", "workspace_owner"],
    risk: "LOW",
    approval: "never",
    available: true,
    backingAction: "saveContentPost",
    backingFile: "src/lib/content.functions.ts",
  },

  // ── MEDIUM: writes and generation (blocked pending approval) ─────────────
  {
    name: "create_campaign",
    description:
      "Create a new campaign record in a workspace. Does not generate assets; asset generation is a separate action triggered afterwards.",
    inputSchema: createCampaignInput,
    workspaceRequired: true,
    permissions: ["authenticated", "workspace_owner"],
    risk: "MEDIUM",
    approval: "default",
    available: true,
    backingAction: "createCampaign",
    backingFile: "src/lib/campaigns.functions.ts",
  },
  {
    name: "create_strategy",
    description:
      "Generate and save a 90-day strategy plan for a workspace from the Strategy Profile. May replace an existing plan.",
    inputSchema: createStrategyInput,
    workspaceRequired: true,
    permissions: ["authenticated", "workspace_owner"],
    risk: "MEDIUM",
    approval: "default",
    available: true,
    backingAction: "generateStrategyPlan",
    backingFile: "src/lib/strategy.functions.ts",
  },
  {
    name: "create_email_draft",
    description:
      "Generate and save the funnel email sequence for a workspace. May replace saved email copy. Does not send emails.",
    inputSchema: createEmailDraftInput,
    workspaceRequired: true,
    permissions: ["authenticated", "workspace_owner"],
    risk: "MEDIUM",
    approval: "default",
    available: true,
    backingAction: "generateEmails",
    backingFile: "src/lib/funnel.functions.ts",
  },
  {
    name: "create_lead_magnet",
    description:
      "Generate and save the funnel lead magnet text for a workspace. Does not produce a designed PDF export.",
    inputSchema: createLeadMagnetInput,
    workspaceRequired: true,
    permissions: ["authenticated", "workspace_owner"],
    risk: "MEDIUM",
    approval: "default",
    available: true,
    backingAction: "generateMagnet",
    backingFile: "src/lib/funnel.functions.ts",
  },
  {
    name: "create_landing_page",
    description:
      "Create an unpublished landing page draft with default content in the workspace.",
    inputSchema: createLandingPageInput,
    workspaceRequired: true,
    permissions: ["authenticated", "workspace_owner"],
    risk: "MEDIUM",
    approval: "default",
    available: true,
    backingAction: "createLandingPage",
    backingFile: "src/lib/landing.functions.ts",
  },
  {
    name: "create_image",
    description:
      "Generate a brand image for the workspace using the Strategy Profile's brand colours and tone. Uses the built-in AI image service.",
    inputSchema: createImageInput,
    workspaceRequired: true,
    permissions: ["authenticated", "workspace_owner"],
    risk: "MEDIUM",
    approval: "default",
    available: false,
    unavailableReason: IMAGE_BLOCKED,
    backingAction: "generateBrandImage",
    backingFile: "src/lib/image.functions.ts",
  },
  {
    name: "create_content_calendar",
    description:
      "Create a content calendar for a workspace. No standalone calendar-creation action exists in Haaylo today.",
    inputSchema: createContentCalendarInput,
    workspaceRequired: true,
    permissions: ["authenticated", "workspace_owner"],
    risk: "MEDIUM",
    approval: "default",
    available: false,
    unavailableReason:
      "No standalone calendar-creation action exists in the codebase. The calendar is built from scheduled posts, not created as a separate object.",
    backingAction: "(none)",
    backingFile: "—",
  },
  {
    name: "save_asset",
    description:
      "Save an item to the Content Bank for the workspace. Saves text items (posts, captions, ideas, emails); not a generic file upload.",
    inputSchema: saveAssetInput,
    workspaceRequired: true,
    permissions: ["authenticated", "workspace_owner"],
    risk: "MEDIUM",
    approval: "default",
    available: true,
    backingAction: "saveToBank",
    backingFile: "src/lib/bank.functions.ts",
  },
  {
    name: "update_campaign",
    description:
      "Update the plan-week range of a campaign in the workspace. Only the plan-week assignment is exposed; no unrestricted campaign patch.",
    inputSchema: updateCampaignInput,
    workspaceRequired: true,
    permissions: ["authenticated", "workspace_owner"],
    risk: "MEDIUM",
    approval: "default",
    available: true,
    backingAction: "setCampaignPlanWeeks",
    backingFile: "src/lib/campaigns.functions.ts",
  },

  // ── HIGH: publishing (always approval, not executable) ─────────────────────
  {
    name: "schedule_content",
    description:
      "Set or clear the schedule on a post in the workspace. This records the schedule separately from the live publishing queue.",
    inputSchema: scheduleContentInput,
    workspaceRequired: true,
    permissions: ["authenticated", "workspace_owner", "scheduler_subscription"],
    risk: "HIGH",
    approval: "always",
    available: true,
    backingAction: "setPostSchedule",
    backingFile: "src/lib/schedule.functions.ts",
  },
  {
    name: "publish_content",
    description:
      "Publish a post publicly. In Haaylo, publishing is done by a timed job that fans queued posts to connected accounts — this is not the same as changing a post's status to 'published'.",
    inputSchema: publishContentInput,
    workspaceRequired: true,
    permissions: ["authenticated", "workspace_owner", "scheduler_subscription"],
    risk: "HIGH",
    approval: "always",
    available: true,
    backingAction: "publish cron job",
    backingFile: "src/routes/api/public/cron/publish.ts",
  },
  {
    name: "send_email_campaign",
    description:
      "Put one written email into the owner's Mailchimp account as a campaign and, when a time is given, schedule it to the primary audience. This reaches real subscribers.",
    inputSchema: sendEmailCampaignInput,
    workspaceRequired: true,
    permissions: ["authenticated", "workspace_owner"],
    risk: "HIGH",
    approval: "always",
    available: true,
    backingAction: "createAndScheduleCampaign",
    backingFile: "src/lib/mailchimp-campaign.server.ts",
  },
];

/** Look up a tool definition by name. */
export function getTool(name: string): ToolDefinition | undefined {
  return catalogue.find((t) => t.name === name);
}

/** All registered tool names, in catalogue order. */
export function listToolNames(): string[] {
  return catalogue.map((t) => t.name);
}
