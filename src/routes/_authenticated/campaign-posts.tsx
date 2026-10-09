import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell, CARD } from "@/components/AppShell";
import { WorkbenchTabs } from "@/components/content/WorkbenchTabs";
import { useWorkspace } from "@/hooks/useActiveProject";
import { listCampaigns, type CampaignRecord } from "@/lib/campaigns.functions";
import { listCampaignAssets, type CampaignPost } from "@/lib/campaign-assets.functions";
import { SURFACE, NAVY, GREY, LINE, font } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/campaign-posts")({
  head: () => ({
    meta: [
      { title: "Pull from Campaigns — haaylo.com" },
      {
        name: "description",
        content: "Open the posts a campaign already generated and edit them in your Content Bank.",
      },
      { property: "og:title", content: "Pull from Campaigns — haaylo" },
      { property: "og:description", content: "Every post your campaign generated, in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CampaignPostsPage,
});

const field: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: `1px solid ${LINE}`,
  background: SURFACE,
  color: NAVY,
  fontSize: 15,
  fontFamily: font,
};

const smallBtn: React.CSSProperties = {
  padding: "9px 15px",
  borderRadius: 9,
  fontSize: 13.5,
  fontWeight: 600,
  cursor: "pointer",
  color: NAVY,
  background: SURFACE,
  border: `1px solid ${LINE}`,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
};

function CampaignPostsPage() {
  const { projectId } = useWorkspace();
  const listFn = useServerFn(listCampaigns);
  const assetsFn = useServerFn(listCampaignAssets);

  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [posts, setPosts] = useState<CampaignPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        const rows = await listFn({ data: { projectId } });
        if (!alive) return;
        setCampaigns(rows);
        setCampaignId(rows[0]?.id ?? "");
      } catch (err) {
        if (alive) toast.error(err instanceof Error ? err.message : "Could not load your campaigns.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [listFn, projectId]);

  useEffect(() => {
    if (!campaignId) {
      setPosts([]);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const res = await assetsFn({ data: { campaignId } });
        if (alive) setPosts(res.posts);
      } catch (err) {
        if (alive) toast.error(err instanceof Error ? err.message : "Could not load those posts.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [assetsFn, campaignId]);

  return (
    <AppShell title="Pull from Campaigns">
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "8px 0 40px" }}>
        <WorkbenchTabs active="campaigns" />

        <header style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: "-0.02em", fontFamily: font }}>Pull from Campaigns</h1>
          <p style={{ margin: "8px 0 0", color: GREY, fontSize: 15, lineHeight: 1.5 }}>
            The posts your campaigns have already written, ready to edit or reuse.
          </p>
        </header>

        {loading ? (
          <p style={{ color: GREY, fontSize: 14 }}>Loading your campaigns…</p>
        ) : campaigns.length === 0 ? (
          <section style={{ ...CARD, padding: 26 }}>
            <p style={{ margin: 0, color: GREY, fontSize: 15 }}>
              You have no campaigns yet. Start one from “New Campaign” in the sidebar and its posts will show up here.
            </p>
          </section>
        ) : (
          <>
            <section style={{ ...CARD, padding: 20, marginBottom: 20 }}>
              <label
                htmlFor="campaign-picker"
                style={{ display: "block", marginBottom: 7, fontSize: 13, fontWeight: 600, color: GREY }}
              >
                Campaign
              </label>
              <select
                id="campaign-picker"
                style={field}
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
              >
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.campaign_title}
                    {c.campaign_theme ? ` — ${c.campaign_theme}` : ""}
                  </option>
                ))}
              </select>
            </section>

            {posts.length === 0 ? (
              <section style={{ ...CARD, padding: 26 }}>
                <p style={{ margin: 0, color: GREY, fontSize: 15 }}>
                  This campaign hasn’t generated any posts yet.
                </p>
              </section>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                {posts.map((p) => (
                  <article key={p.id} style={{ ...CARD, padding: 20, display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <h2 style={{ margin: 0, fontSize: 16.5, fontWeight: 700, fontFamily: font }}>{p.title || "Untitled post"}</h2>
                      {p.platform && (
                        <span style={{ color: GREY, fontSize: 12.5, textTransform: "capitalize" }}>
                          {p.platform}
                        </span>
                      )}
                    </div>
                    <p
                      style={{
                        margin: 0,
                        color: NAVY,
                        fontSize: 14.5,
                        lineHeight: 1.6,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {p.caption}
                    </p>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <Link to="/bank" style={smallBtn}>
                        Open in Content Bank
                      </Link>
                      <button
                        type="button"
                        style={smallBtn}
                        onClick={() => {
                          void navigator.clipboard.writeText(p.caption);
                          toast.success("Copied");
                        }}
                      >
                        Copy
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
