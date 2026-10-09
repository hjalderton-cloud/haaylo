import { AppShell } from "@/components/AppShell";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/hooks/useActiveProject";
import { getContentPost, type ContentPost } from "@/lib/content.functions";
import { PostEditorDrawer } from "@/components/content/PostEditorDrawer";
import { getChannelPerformance, type ChannelPerformance } from "@/lib/dashboard.functions";
import { supabase } from "@/integrations/supabase/client";
import { deleteDraftPosts, getHomeActivity, type HomeActivity } from "@/lib/home-activity.functions";
import { MondayBrief, CompetitorMove } from "@/components/home/MondayBrief";
import { BG, GREY, LINE, NAVY, PINK, POPPINS_LINKS, card, font, primaryButton } from "@/components/agent/theme";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Home | Haaylo" },
      { name: "description", content: "Your morning brief: what worked, what changed and what is ready for you to approve." },
      { property: "og:title", content: "Home | Haaylo" },
      { property: "og:description", content: "Your morning brief: what worked, what changed and what is ready for you to approve." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
    links: POPPINS_LINKS,
  }),
  component: HomePage,
});

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function HomePage() {
  const { projectId } = useWorkspace();
  const activityFn = useServerFn(getHomeActivity);
  const channelsFn = useServerFn(getChannelPerformance);
  const getPost = useServerFn(getContentPost);
  const deleteDrafts = useServerFn(deleteDraftPosts);

  const [activity, setActivity] = useState<HomeActivity | null>(null);
  const [channels, setChannels] = useState<ChannelPerformance | null>(null);
  const [firstName, setFirstName] = useState("");
  const [editingPost, setEditingPost] = useState<ContentPost | null>(null);

  async function refresh() {
    if (!projectId) return;
    try {
      setActivity(await activityFn({ data: { workspaceId: projectId } }));
    } catch {
      /* Home still works without it */
    }
  }

  useEffect(() => {
    void refresh();
    void (async () => {
      try {
        setChannels(await channelsFn({ data: { projectId } }));
      } catch {
        /* optional */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
      const full = String(meta["full_name"] ?? meta["name"] ?? "").trim();
      setFirstName(full.split(/\s+/)[0] ?? "");
    });
  }, []);

  async function openPost(id: string) {
    try {
      setEditingPost(await getPost({ data: { id } }));
    } catch {
      toast.error("Could not open that post. Try again.");
    }
  }

  const review = activity ? [...activity.readyDrafts, ...activity.flaggedDrafts] : [];
  const flaggedIds = new Set(activity?.flaggedDrafts.map((p) => p.id) ?? []);
  const [deleting, setDeleting] = useState(false);

  async function deleteAllReview() {
    if (!projectId || review.length === 0) return;
    const ok = window.confirm(
      `Delete these ${review.length} drafts? This cannot be undone. Scheduled, approved and published posts are not touched.`,
    );
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteDrafts({ data: { workspaceId: projectId, ids: review.map((p) => p.id) } });
      toast.success("Drafts deleted.");
      await refresh();
    } catch {
      toast.error("Could not delete those drafts. Try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AppShell title="Home">
      <div style={{ background: BG, minHeight: "100%", fontFamily: font }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 18px 120px", display: "grid", gap: 18 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: NAVY }}>
            {greeting()}
            {firstName ? `, ${firstName}` : ""}
          </h1>

          <MondayBrief projectId={projectId} activity={activity} channels={channels} onOpenPost={openPost} onChanged={refresh} />

          <Link
            to="/build-marketing"
            style={{ ...primaryButton, display: "block", textAlign: "center", padding: "16px 20px", fontSize: 16, textDecoration: "none" }}
          >
            + Create campaign
          </Link>

          <CompetitorMove projectId={projectId} />

          <section style={{ ...card, padding: "20px 22px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: NAVY }}>Needs your review</h2>
              {review.length > 0 && (
                <button
                  type="button"
                  onClick={() => void deleteAllReview()}
                  disabled={deleting}
                  style={{ all: "unset", cursor: "pointer", fontSize: 13, fontWeight: 600, color: PINK }}
                >
                  {deleting ? "Deleting…" : `Delete all ${review.length}`}
                </button>
              )}
            </div>
            {review.length === 0 ? (
              <p style={{ margin: 0, color: GREY, fontSize: 14 }}>Nothing waiting. You are all caught up.</p>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {review.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0,1fr) auto",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      border: `1px solid ${LINE}`,
                      borderRadius: 12,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: NAVY, fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.label}
                      </div>
                      <div style={{ fontSize: 12, color: GREY, marginTop: 2, textTransform: "capitalize" }}>
                        {p.platform} · {flaggedIds.has(p.id) ? <span style={{ color: PINK }}>Needs a look</span> : "Draft"}
                      </div>
                    </div>
                    <button type="button" onClick={() => void openPost(p.id)} style={{ ...primaryButton, fontSize: 13, padding: "8px 14px", flexShrink: 0 }}>
                      Approve & schedule
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {editingPost && (
        <PostEditorDrawer
          post={editingPost}
          onClose={() => setEditingPost(null)}
          onSaved={() => void refresh()}
          onDuplicated={() => void refresh()}
        />
      )}
    </AppShell>
  );
}
