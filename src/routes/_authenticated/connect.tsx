import { createFileRoute } from "@tanstack/react-router";
import { GREY } from "@/lib/theme";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { ChannelConnect } from "@/components/ChannelConnect";

export const Route = createFileRoute("/_authenticated/connect")({
  head: () => ({
    meta: [
      { title: "Connect your accounts — haaylo" },
      {
        name: "description",
        content:
          "Link Instagram, Facebook, LinkedIn, YouTube and TikTok to haaylo so your posts publish straight to your own channels.",
      },
      { property: "og:title", content: "Connect your accounts — haaylo" },
      {
        property: "og:description",
        content: "Link your social accounts to haaylo in a couple of taps.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConnectPage,
});

function ConnectPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("returned") === "1") {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  return (
    <AppShell title="Connect your accounts">
      <div style={{ maxWidth: 720, display: "grid", gap: 16 }}>
        <p style={{ color: GREY, fontSize: 14, lineHeight: 1.6 }}>
          Link the channels you post to. Each account attaches to your own haaylo workspace, so
          your posts and stats stay yours alone.
        </p>
        <ChannelConnect />
      </div>
    </AppShell>
  );
}
