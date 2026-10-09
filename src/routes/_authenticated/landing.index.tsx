import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useActiveProject } from "@/hooks/useActiveProject";
import { toast } from "sonner";
import { AppShell, CARD } from "@/components/AppShell";
import { PINK, MUTED } from "@/components/WorkflowNav";
import { NAVY, LINE, TINT, GREY } from "@/lib/theme";
import {
  listLandingPages,
  createLandingPage,
  setLandingStatus,
  deleteLandingPage,
  type LandingPage,
  type LandingStatus,
} from "@/lib/landing.functions";

export const Route = createFileRoute("/_authenticated/landing/")({
  head: () => ({
    meta: [
      { title: "Landing Pages — haaylo" },
      {
        name: "description",
        content:
          "Build a landing page in minutes, get a shareable haaylo link and capture leads straight into your inbox.",
      },
      { property: "og:title", content: "Landing Pages — haaylo" },
      {
        property: "og:description",
        content: "Build a page, get a link, capture leads straight into haaylo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LandingPagesScreen,
});

export const PUBLIC_HOST = "haaylo.com";

const BADGE: Record<LandingStatus, { label: string; bg: string; fg: string }> = {
  live: { label: "Live", bg: "rgba(34,197,94,0.16)", fg: "#4ADE80" },
  draft: { label: "Draft", bg: TINT.blue, fg: TINT.blueInk },
  unpublished: { label: "Unpublished", bg: "rgba(245,158,11,0.16)", fg: "#FBBF24" },
};

function LandingPagesScreen() {
  const navigate = useNavigate();
  const activeProjectId = useActiveProject();
  const listFn = useServerFn(listLandingPages);
  const createFn = useServerFn(createLandingPage);
  const statusFn = useServerFn(setLandingStatus);
  const deleteFn = useServerFn(deleteLandingPage);

  const [pages, setPages] = useState<LandingPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPages(await listFn({ data: activeProjectId ? { projectId: activeProjectId } : {} }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load your pages.");
    } finally {
      setLoading(false);
    }
  }, [listFn, activeProjectId]);

  useEffect(() => { void load(); }, [load]);

  async function createPage() {
    setBusy("new");
    try {
      const { id } = await createFn({ data: activeProjectId ? { projectId: activeProjectId } : {} });
      await navigate({ to: "/landing/$id", params: { id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create that page.");
    } finally {
      setBusy(null);
    }
  }

  async function toggleStatus(page: LandingPage) {
    const next: LandingStatus = page.status === "live" ? "unpublished" : "live";
    setBusy(page.id);
    try {
      await statusFn({ data: { id: page.id, status: next } });
      setPages((prev) => prev.map((p) => (p.id === page.id ? { ...p, status: next } : p)));
      toast.success(next === "live" ? "Page is live." : "Page taken down.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change that page.");
    } finally {
      setBusy(null);
    }
  }

  async function removePage(page: LandingPage) {
    if (!window.confirm(`Delete “${page.title}”? This cannot be undone.`)) return;
    setBusy(page.id);
    try {
      await deleteFn({ data: { id: page.id } });
      setPages((prev) => prev.filter((p) => p.id !== page.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete that page.");
    } finally {
      setBusy(null);
    }
  }

  async function copyLink(page: LandingPage) {
    const url = `https://${PUBLIC_HOST}/p/${page.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied.");
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  return (
    <AppShell title="Landing Pages">
      <div style={{ maxWidth: 940, margin: "0 auto", padding: "8px 0 60px" }}>
        <header
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 20,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: NAVY }}>
              Landing Pages
            </h1>
            <p style={{ margin: "6px 0 0", color: MUTED, fontSize: 14 }}>
              Build a page, get a link, capture leads straight into Haaylo.
            </p>
          </div>
          <button
            type="button"
            onClick={createPage}
            disabled={busy === "new"}
            style={primaryBtn}
          >
            {busy === "new" ? "Creating…" : "Create new page"}
          </button>
        </header>

        {loading ? (
          <div style={{ ...CARD, padding: 24, color: MUTED }}>Loading your pages…</div>
        ) : pages.length === 0 ? (
          <div style={{ ...CARD, padding: "44px 28px", textAlign: "center" }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: NAVY }}>
              You haven't built a landing page yet
            </h2>
            <p style={{ margin: "10px auto 20px", maxWidth: 460, color: MUTED, fontSize: 14, lineHeight: 1.6 }}>
              Create a page in minutes — get a shareable link and capture leads straight into your inbox.
            </p>
            <button type="button" onClick={createPage} disabled={busy === "new"} style={primaryBtn}>
              Build your first page
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {pages.map((page) => {
              const badge = BADGE[page.status];
              const url = `https://${PUBLIC_HOST}/p/${page.slug}`;
              return (
                <article key={page.id} style={{ ...CARD, padding: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: NAVY }}>
                      {page.title}
                    </h2>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: ".06em",
                        textTransform: "uppercase",
                        padding: "3px 9px",
                        borderRadius: 999,
                        background: badge.bg,
                        color: badge.fg,
                      }}
                    >
                      {badge.label}
                    </span>
                  </div>

                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: "inline-block", marginTop: 6, color: PINK, fontSize: 13, textDecoration: "none" }}
                  >
                    {PUBLIC_HOST}/p/{page.slug}
                  </a>

                  <p style={{ margin: "8px 0 14px", color: MUTED, fontSize: 13 }}>
                    {page.leadCount} {page.leadCount === 1 ? "lead" : "leads"} captured
                  </p>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => navigate({ to: "/landing/$id", params: { id: page.id } })}
                      style={ghostBtn}
                    >
                      Edit
                    </button>
                    <button type="button" onClick={() => copyLink(page)} style={ghostBtn}>
                      Copy link
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleStatus(page)}
                      disabled={busy === page.id}
                      style={ghostBtn}
                    >
                      {page.status === "live" ? "Unpublish" : "Publish"}
                    </button>
                    <button
                      type="button"
                      onClick={() => removePage(page)}
                      disabled={busy === page.id}
                      style={{ ...ghostBtn, color: "#C0334B" }}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

const primaryBtn: React.CSSProperties = {
  background: PINK,
  color: "#fff",
  border: "none",
  borderRadius: 999,
  padding: "11px 20px",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
};

const ghostBtn: React.CSSProperties = {
  background: "#FFFFFF",
  color: NAVY,
  border: `1px solid ${LINE}`,
  borderRadius: 999,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};
