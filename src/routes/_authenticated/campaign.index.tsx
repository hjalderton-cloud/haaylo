import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { CampaignEngineModal } from "@/components/CampaignEngineModal";
import { getLatestCampaign } from "@/lib/campaigns.functions";
import { useWorkspace } from "@/hooks/useActiveProject";
import { SURFACE, NAVY, INDIGO, PINK, GREY, LINE, font } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/campaign/")({
  head: () => ({
    meta: [
      { title: "Campaigns — haaylo.com" },
      { name: "description", content: "Every campaign you've launched: posts, landing pages, lead magnets and emails in one place." },
      { property: "og:title", content: "Campaigns — haaylo.com" },
      { property: "og:description", content: "Every campaign you've launched, in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CampaignsIndex,
});

function CampaignsIndex() {
  const navigate = useNavigate();
  const { projectId } = useWorkspace();
  const latestFn = useServerFn(getLatestCampaign);
  const [empty, setEmpty] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const row = await latestFn({ data: { projectId } });
        if (cancelled) return;
        if (row) navigate({ to: "/campaign/$id", params: { id: row.id }, replace: true });
        else setEmpty(true);
      } catch {
        if (!cancelled) setEmpty(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (empty !== true) {
    return (
      <AppShell title="Campaigns">
        <p style={{ fontSize: 13, color: GREY, fontFamily: font }}>Loading…</p>
      </AppShell>
    );
  }

  return (
    <AppShell title="Campaigns">
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          gap: 14,
          minHeight: "50vh",
          borderRadius: 20,
          border: `1px solid ${LINE}`,
          background: SURFACE,
          padding: "40px 24px",
        }}
      >
        <h1 style={{ margin: 0, fontFamily: font, fontSize: "clamp(22px, 4vw, 30px)", color: NAVY, fontWeight: 700 }}>
          Start your first campaign
        </h1>
        <p style={{ margin: 0, maxWidth: 460, fontSize: 14, color: GREY, lineHeight: 1.6, fontFamily: font }}>
          Tell Haaylo what you're working on and it plans the campaign with you, then builds the posts, page,
          guide, emails and images.
        </p>
        <Link
          to="/home"
          style={{
            padding: "16px 28px",
            borderRadius: 14,
            background: PINK,
            color: "#FFFFFF",
            fontWeight: 800,
            fontSize: 15,
            textDecoration: "none",
            boxShadow: "0 12px 30px rgba(229,70,131,0.22)",
            fontFamily: font,
          }}
        >
          Build with Haaylo
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            padding: "9px 14px",
            borderRadius: 11,
            border: `1px solid ${LINE}`,
            background: "transparent",
            color: INDIGO,
            fontWeight: 700,
            fontSize: 12.5,
            cursor: "pointer",
            fontFamily: font,
          }}
        >
          ＋ New Campaign
        </button>
      </div>

      <CampaignEngineModal open={open} onClose={() => setOpen(false)} />
    </AppShell>
  );
}
