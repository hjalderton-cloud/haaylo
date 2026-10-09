import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type FirstPostIdea = {
  pillar: "education" | "inspiration" | "entertainment";
  topic: string;
  formatId: "instagram" | "tiktok" | "linkedin" | "blog" | "facebook" | "email";
};

export const generateFirstPostIdeas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ projectId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ ideas: FirstPostIdea[] }> => {
    const { generateIdeasForProject } = await import("./first-post-ideas.server");
    return generateIdeasForProject(context.supabase, data.projectId, context.userId);
  });