// Server-only bridge between agent-written content_posts and the live
// publishing pipeline (scheduled_posts + post_targets + the publish cron).
// Never import this from client-reachable modules.

export const PLATFORM_PROVIDERS: Record<string, string[]> = {
  linkedin: ["linkedin", "linkedin_company"],
  facebook: ["facebook_page"],
  facebook_page: ["facebook_page"],
  instagram: ["instagram"],
};

export function providersFor(platform: string): string[] {
  const key = (platform || "").trim().toLowerCase();
  return PLATFORM_PROVIDERS[key] ?? [];
}

type DbLike = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (t: string) => any;
};

export type ConnectionRow = {
  id: string;
  provider: string;
  display_name: string | null;
  status: string | null;
};

/** Live (non-revoked) accounts this user has connected. */
export async function listLiveConnections(db: DbLike, userId: string): Promise<ConnectionRow[]> {
  const { data } = await db
    .from("social_connections")
    .select("id, provider, display_name, status")
    .eq("user_id", userId);
  return ((data ?? []) as ConnectionRow[]).filter(
    (c) => !c.status || c.status === "active" || c.status === "connected",
  );
}

/** Accounts that can carry a post written for `platform`. */
export function matchConnections(connections: ConnectionRow[], platform: string): ConnectionRow[] {
  const providers = providersFor(platform);
  if (!providers.length) return [];
  return connections.filter((c) => providers.includes(c.provider));
}

const SLOT_HOUR_UTC = 8; // 09:30 UK in summer, 08:30 in winter — a sane morning slot.
const SLOT_MINUTE = 30;

/** Nth free morning slot from tomorrow, skipping times already booked. */
export function slotFor(index: number, taken: Set<string>): string {
  const base = new Date();
  base.setUTCHours(SLOT_HOUR_UTC, SLOT_MINUTE, 0, 0);
  let day = 1 + index;
  for (let guard = 0; guard < 400; guard += 1) {
    const when = new Date(base.getTime() + day * 24 * 60 * 60 * 1000);
    const iso = when.toISOString();
    if (!taken.has(iso)) {
      taken.add(iso);
      return iso;
    }
    day += 1;
  }
  return new Date(base.getTime() + day * 24 * 60 * 60 * 1000).toISOString();
}

/** Slots already booked by this user's scheduled posts. */
export async function bookedSlots(db: DbLike, userId: string): Promise<Set<string>> {
  const { data } = await db
    .from("scheduled_posts")
    .select("scheduled_at")
    .eq("user_id", userId)
    .in("status", ["scheduled", "publishing"]);
  const set = new Set<string>();
  for (const row of (data ?? []) as Array<{ scheduled_at: string | null }>) {
    if (row.scheduled_at) set.add(new Date(row.scheduled_at).toISOString());
  }
  return set;
}

export type QueueResult =
  | { ok: true; scheduledPostId: string; scheduledAt: string; accounts: string[] }
  | { ok: false; error: string };

/**
 * Puts one content_posts row into the live queue: creates the scheduled_posts
 * row plus a post_target per matching connected account, and links the
 * content post back to it. The publish cron does the actual sending.
 */
export async function queueToLiveAccounts(
  db: DbLike,
  args: {
    userId: string;
    contentPostId?: string | null;
    caption: string;
    platform: string;

    pillar?: string | null;
    mediaUrl?: string | null;
    mediaPath?: string | null;
    scheduledAt: string;
    connections: ConnectionRow[];
  },
): Promise<QueueResult> {
  const matched = matchConnections(args.connections, args.platform);
  if (!matched.length) {
    return { ok: false, error: `No connected ${args.platform || "social"} account` };
  }
  if (args.platform.toLowerCase() === "instagram" && !args.mediaUrl && !args.mediaPath) {
    return { ok: false, error: "Instagram needs an image before it can go out" };
  }

  const { data: post, error } = await db
    .from("scheduled_posts")
    .insert({
      user_id: args.userId,
      caption: args.caption,
      media_url: args.mediaUrl ?? null,
      media_path: args.mediaPath ?? null,
      scheduled_at: args.scheduledAt,
      status: "scheduled",
      platform: args.platform,
      pillar: args.pillar ?? null,
    })
    .select("id")
    .single();
  if (error || !post) return { ok: false, error: error?.message ?? "Could not queue the post" };

  const { error: tErr } = await db.from("post_targets").insert(
    matched.map((c) => ({ post_id: post.id, connection_id: c.id, status: "pending" })),
  );
  if (tErr) {
    await db.from("scheduled_posts").delete().eq("id", post.id);
    return { ok: false, error: tErr.message };
  }

  if (args.contentPostId) {
    await db
      .from("content_posts")
      .update({
        status: "scheduled",
        scheduled_at: args.scheduledAt,
        scheduled_post_id: post.id,
      })
      .eq("id", args.contentPostId);
  }


  return {
    ok: true,
    scheduledPostId: post.id as string,
    scheduledAt: args.scheduledAt,
    accounts: matched.map((c) => c.display_name || c.provider),
  };
}
