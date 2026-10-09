import { z } from "zod";

/**
 * Agent input schemas for every registered tool.
 *
 * Every schema requires an explicit `workspaceId`. The Agent must never infer
 * or switch workspaces during a run. The adapter validates workspace ownership
 * before delegating to the existing backend action.
 *
 * These schemas are stricter than the existing function inputs: workspaceId is
 * mandatory (never optional), and unsafe fields (scheduled_at, status overrides,
 * media paths) are excluded so the Agent cannot bypass draft-only constraints.
 */

// ── LOW risk: reads (no approval) ──────────────────────────────────────────

export const fetchBrandContextInput = z.object({
  workspaceId: z.string().uuid().describe("Workspace to read brand context for."),
});

export const fetchStrategyInput = z.object({
  workspaceId: z.string().uuid().describe("Workspace to read the 90-day strategy plan for."),
});

export const fetchPreviousContentInput = z.object({
  workspaceId: z.string().uuid(),
  status: z.enum(["draft", "approved", "scheduled", "published"]).optional(),
  campaignId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).optional().describe("Maximum posts to return (default 50)."),
});

export const fetchCampaignInput = z.object({
  workspaceId: z.string().uuid(),
  campaignId: z.string().uuid(),
});

export const fetchAnalyticsInput = z.object({
  workspaceId: z.string().uuid(),
});

// ── LOW risk: draft creation (no approval) ────────────────────────────────

export const createSocialContentInput = z.object({
  workspaceId: z.string().uuid(),
  caption: z.string().min(1).max(20000),
  title: z.string().max(300).nullish(),
  platform: z.string().max(40).default("linkedin"),
  pillar: z.string().max(120).nullish(),
  campaignId: z.string().uuid().nullish().describe("Optional campaign to link the post to."),
});

// ── MEDIUM risk: writes and generation (approval required, not executable) ─

/**
 * The approved recommendation behind an agent-built campaign. Stored on the
 * campaign so every asset is written from the same brief the user approved.
 */
export const agentBriefSchema = z.object({
  brief: z.string().trim().max(2000).default(""),
  goal: z.string().trim().max(300).default(""),
  audience: z.string().trim().max(300).default(""),
  channels: z.array(z.string().trim().max(40)).max(6).default([]),
  assetSummary: z.array(z.string().trim().max(120)).max(12).default([]),
  grounding: z.string().trim().max(400).default(""),
});

export type AgentBrief = z.infer<typeof agentBriefSchema>;

export const createCampaignInput = z.object({
  workspaceId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  theme: z.string().trim().min(1).max(600),
  duration: z.enum(["90-day", "30-day"]),
  assets: z.object({
    socialPosts: z.boolean().default(false),
    landingPage: z.boolean().default(false),
    leadMagnet: z.boolean().default(false),
    emailSequence: z.boolean().default(false),
    imagePack: z.boolean().default(false),
    blog: z.boolean().default(false),
  }),
  planWeekStart: z.number().int().min(1).max(13).nullable().optional(),
  planWeekEnd: z.number().int().min(1).max(13).nullable().optional(),
  /** The approved recommendation this campaign came from, when an agent built it. */
  brief: agentBriefSchema.nullable().optional(),
});

export const createStrategyInput = z.object({
  workspaceId: z.string().uuid(),
  goal: z.string().max(500).default(""),
  name: z.string().max(120).optional(),
  postsPerWeek: z.number().int().min(1).max(14).default(3),
});

export const createEmailDraftInput = z.object({
  workspaceId: z.string().uuid(),
  problem: z.string().max(12000).default(""),
  offer: z.string().max(12000).default(""),
  magnetType: z.string().max(200).default("PDF guide / checklist"),
  price: z.string().max(200).default(""),
});

export const createLeadMagnetInput = z.object({
  workspaceId: z.string().uuid(),
  problem: z.string().max(12000).default(""),
  offer: z.string().max(12000).default(""),
  magnetType: z.string().max(200).default("PDF guide / checklist"),
  price: z.string().max(200).default(""),
});

export const createLandingPageInput = z.object({
  workspaceId: z.string().uuid(),
});

export const createImageInput = z.object({
  workspaceId: z.string().uuid(),
  prompt: z.string().trim().min(3).max(1000),
  size: z.enum(["1024x1024", "1024x1536", "1536x1024"]).optional(),
  useLogo: z.boolean().optional(),
  referenceAssetIds: z.array(z.string().uuid()).max(3).optional(),
});

export const createContentCalendarInput = z.object({
  workspaceId: z.string().uuid(),
});

export const saveAssetInput = z.object({
  workspaceId: z.string().uuid(),
  kind: z.enum([
    "post", "blog", "email", "headline", "hook", "cta",
    "campaign", "idea", "image_prompt", "image", "asset", "other",
  ]),
  title: z.string().max(200).optional(),
  body: z.string().max(20000).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  collection: z.string().max(80).optional(),
});

export const updateCampaignInput = z.object({
  workspaceId: z.string().uuid(),
  campaignId: z.string().uuid(),
  planWeekStart: z.number().int().min(1).max(13).nullable(),
  planWeekEnd: z.number().int().min(1).max(13).nullable(),
});

// ── HIGH risk: publishing (always approval, not executable) ────────────────

export const scheduleContentInput = z.object({
  workspaceId: z.string().uuid(),
  postId: z.string().uuid(),
  scheduledAt: z.string().nullable(),
});

export const publishContentInput = z.object({
  workspaceId: z.string().uuid(),
  postId: z.string().uuid(),
});

/** Push one written email into Mailchimp and book its send time. */
export const sendEmailCampaignInput = z.object({
  workspaceId: z.string().uuid(),
  subject: z.string().trim().min(1).max(150),
  body: z.string().trim().min(1).max(20000),
  campaignTitle: z.string().trim().max(100).default("Haaylo email"),
  scheduledAt: z.string().nullable().default(null),
});
