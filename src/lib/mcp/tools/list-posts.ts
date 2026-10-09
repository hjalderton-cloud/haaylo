import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { resolveProjectId, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_posts",
  title: "List posts",
  description:
    "List saved posts and captions for a client, newest first. Optionally filter by status (draft, approved, scheduled, published).",
  inputSchema: {
    client_id: z.string().uuid().optional().describe("Client id from list_clients. Omit for the default client."),
    status: z.string().optional().describe("Filter by post status, e.g. draft or scheduled."),
    limit: z.number().int().min(1).max(100).optional().describe("Maximum posts to return (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ client_id, status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const projectId = await resolveProjectId(supabase, client_id);
    let query = supabase
      .from("content_posts")
      .select("id, title, caption, platform, pillar, status, scheduled_at, published_at, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { client_id: projectId, posts: data ?? [] },
    };
  },
});
