export const TOOL_LABEL: Record<string, string> = {
  fetch_brand_context: "Read your Brand DNA",
  fetch_strategy: "Read your 90-day plan",
  fetch_previous_content: "Read previous content",
  fetch_campaign: "Read campaign details",
  fetch_analytics: "Review performance",
  create_social_content: "Draft social posts",
  create_campaign: "Create a campaign",
  create_strategy: "Write a 90-day plan",
  create_email_draft: "Draft emails",
  create_lead_magnet: "Create a guide",
  create_landing_page: "Create a landing page",
  create_image: "Generate an image",
  create_content_calendar: "Create a content calendar",
  save_asset: "Save to the Content Bank",
  update_campaign: "Update a campaign",
  schedule_content: "Schedule a post",
  publish_content: "Publish a post",
  send_email_campaign: "Send to Mailchimp",
};

export function summariseResult(toolName: string, result: unknown): string {
  if (!result || typeof result !== "object" || Array.isArray(result)) return "";
  const record = result as Record<string, unknown>;
  if (toolName === "create_social_content" && Array.isArray(record.posts)) {
    return `${record.posts.length} ${record.posts.length === 1 ? "post" : "posts"} drafted`;
  }
  if (["create_campaign", "update_campaign", "save_asset"].includes(toolName)) {
    const title = record.title ?? record.campaign_title ?? record.name;
    return typeof title === "string" ? title.slice(0, 160) : "";
  }
  return "";
}

export function formatStepDetails(input: unknown, result: unknown, error: unknown): string {
  const text = JSON.stringify({ input, result: result ?? null, ...(error ? { error } : {}) }, null, 2);
  return text.length > 4000 ? `${text.slice(0, 4000)}\n… Details shortened for display.` : text;
}