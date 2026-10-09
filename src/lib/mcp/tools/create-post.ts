import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { resolveProjectId, supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_post",
  title: "Create post",
  description:
    "Save a new post/caption to the client's content bank as a draft, optionally scheduled for a date and platform.",
  inputSchema: {
    caption: z.string().trim().min(1).describe("The post copy."),
    client_id: z.string().uuid().optional().describe("Client id from list_clients. Omit for the default client."),
    title: z.string().trim().optional().describe("Short internal title for the post."),
    platform: z.string().trim().optional().describe("instagram, facebook, linkedin, tiktok or youtube."),
    pillar: z.string().trim().optional().describe("Content pillar: education, inspiration or entertainment."),
    scheduled_at: z.string().datetime().optional().describe("ISO timestamp to schedule the post for."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ caption, client_id, title, platform, pillar, scheduled_at }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const projectId = await resolveProjectId(supabase, client_id);
    const { data, error } = await supabase
      .from("content_posts")
      .insert({
        user_id: ctx.getUserId(),
        project_id: projectId,
        caption,
        title: title ?? null,
        platform: platform ?? null,
        pillar: pillar ?? null,
        scheduled_at: scheduled_at ?? null,
        status: scheduled_at ? "scheduled" : "draft",
      })
      .select("id, title, caption, platform, pillar, status, scheduled_at")
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { post: data },
    };
  },
});
