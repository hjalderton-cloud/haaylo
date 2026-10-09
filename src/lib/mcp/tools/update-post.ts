import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "update_post",
  title: "Update post",
  description: "Update an existing post's copy, platform, pillar, status or scheduled time.",
  inputSchema: {
    post_id: z.string().uuid().describe("Post id from list_posts."),
    caption: z.string().trim().min(1).optional(),
    title: z.string().trim().optional(),
    platform: z.string().trim().optional(),
    pillar: z.string().trim().optional(),
    status: z.string().trim().optional().describe("draft, approved, scheduled or published."),
    scheduled_at: z.string().datetime().optional().describe("ISO timestamp to schedule the post for."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  handler: async ({ post_id, ...fields }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const patch = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    if (Object.keys(patch).length === 0) {
      return { content: [{ type: "text", text: "Nothing to update." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("content_posts")
      .update(patch)
      .eq("id", post_id)
      .select("id, title, caption, platform, pillar, status, scheduled_at")
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "Post not found." }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { post: data } };
  },
});
