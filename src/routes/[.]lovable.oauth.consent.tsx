import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type OAuthDetails = {
  client?: { name?: string } | null;
  redirect_url?: string;
  redirect_to?: string;
};

type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: OAuthDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: OAuthDetails | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: OAuthDetails | null; error: { message: string } | null }>;
};

const oauth = (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) throw redirect({ to: "/auth", search: { redirect: next } });
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main style={wrap}>
      <p style={{ color: "#F5F3FF" }}>
        Could not load this authorisation request: {String((error as Error)?.message ?? error)}
      </p>
    </main>
  ),
});

const wrap: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  background: "#141B3D",
  padding: 24,
};

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientName = details?.client?.name ?? "this app";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error: err } = approve
      ? await oauth.approveAuthorization(authorization_id)
      : await oauth.denyAuthorization(authorization_id);
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorisation server.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main style={wrap}>
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 18,
          padding: 24,
          color: "#F5F3FF",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Connect {clientName} to Haaylo</h1>
        <p style={{ fontSize: 14, color: "#C9CDE6", marginBottom: 18 }}>
          {clientName} will be able to read your clients, Strategy Profile and saved posts, and create or edit posts as
          you. You can revoke this at any time.
        </p>
        {error && (
          <p role="alert" style={{ color: "#FF5C93", fontSize: 13, marginBottom: 12 }}>
            {error}
          </p>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide(true)}
            style={{
              flex: 1,
              padding: "11px 14px",
              borderRadius: 999,
              border: "none",
              background: "#FF5C93",
              color: "#fff",
              fontWeight: 800,
              cursor: busy ? "default" : "pointer",
            }}
          >
            Approve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide(false)}
            style={{
              flex: 1,
              padding: "11px 14px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "transparent",
              color: "#F5F3FF",
              fontWeight: 700,
              cursor: busy ? "default" : "pointer",
            }}
          >
            Deny
          </button>
        </div>
      </div>
    </main>
  );
}
