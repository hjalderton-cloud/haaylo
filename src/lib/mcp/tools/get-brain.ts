import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { resolveProjectId, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_brain",
  title: "Get Strategy Profile",
  description:
    "Read the Strategy Profile (brand voice, audience, offer, positioning) for a client. Defaults to the user's default client.",
  inputSchema: {
    client_id: z.string().uuid().optional().describe("Client id from list_clients. Omit for the default client."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ client_id }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const projectId = await resolveProjectId(supabase, client_id);
    const { data, error } = await supabase
      .from("business_brains")
      .select("data, updated_at")
      .eq("project_id", projectId)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const brain = data?.data ?? {};
    return {
      content: [{ type: "text", text: JSON.stringify(brain) }],
      structuredContent: { client_id: projectId, brain, updated_at: data?.updated_at ?? null },
    };
  },
});
