import { createFileRoute } from "@tanstack/react-router";

const CALLBACK_PATH = "/api/public/oauth/callback";

function redirectBase(req: Request): string {
  const configured = process.env.OAUTH_REDIRECT_BASE_URL;
  if (!configured) return new URL(req.url).origin;

  try {
    const url = new URL(configured);
    if (url.hostname === "haaylo.com") return "https://haaylo.com";
  } catch {
    // Ignore malformed redirect-base values and fall back to the request origin.
  }

  return new URL(req.url).origin;
}

function htmlRedirect(target: string, message: string): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>${message}</title><meta http-equiv="refresh" content="0;url=${target}"><body style="font-family:system-ui;background:#0B0B1F;color:#fff;display:grid;place-items:center;min-height:100vh"><p>${message}…</p></body>`,
    { status: 302, headers: { "Content-Type": "text/html; charset=utf-8", Location: target } },
  );
}

export const Route = createFileRoute("/api/public/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const stateParam = url.searchParams.get("state");
        const oauthError =
          url.searchParams.get("error_description") ||
          url.searchParams.get("error_message") ||
          url.searchParams.get("error");
        const oauthErrorCode = url.searchParams.get("error_code");

        const target = (path: string) => `${new URL(request.url).origin}${path}`;

        if (oauthError) {
          console.error("oauth provider error", oauthError);
          const errorKey = oauthErrorCode === "1349048"
            ? "meta_domain_not_allowed"
            : "provider_denied";
          return htmlRedirect(
            target(`/scheduler?connect_error=${errorKey}`),
            "Returning to Scheduler",
          );
        }
        if (!code || !stateParam) {
          return htmlRedirect(target("/scheduler?connect_error=missing_code"), "Returning");
        }

        const { verifyState } = await import("@/lib/scheduler-crypto.server");
        const { encryptToken } = await import("@/lib/scheduler-crypto.server");
        const state = verifyState(stateParam);
        if (!state) {
          return htmlRedirect(target("/scheduler?connect_error=bad_state"), "Returning");
        }
        const uid = state.uid as string;
        const provider = state.provider as
          | "linkedin"
          | "linkedin_company"
          | "facebook_page"
          | "instagram";

        const redirectUri = `${redirectBase(request)}${CALLBACK_PATH}`;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        try {
          if (provider === "linkedin" || provider === "linkedin_company") {
            const params = new URLSearchParams({
              grant_type: "authorization_code",
              code,
              redirect_uri: redirectUri,
              client_id: process.env.LINKEDIN_CLIENT_ID!,
              client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
            });
            const tRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: params.toString(),
            });
            const tBody = await tRes.json();
            if (!tRes.ok) throw new Error(`LinkedIn token: ${JSON.stringify(tBody)}`);
            const accessToken = tBody.access_token as string;
            const expiresIn = tBody.expires_in as number | undefined;
            const expiresAt = expiresIn
              ? new Date(Date.now() + expiresIn * 1000).toISOString()
              : null;

            if (provider === "linkedin_company") {
              const liHeaders = {
                Authorization: `Bearer ${accessToken}`,
                "LinkedIn-Version": "202405",
                "X-Restli-Protocol-Version": "2.0.0",
              };
              const aclRes = await fetch(
                "https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=20",
                { headers: liHeaders },
              );
              const aclBody = await aclRes.json();
              if (!aclRes.ok) throw new Error(`LinkedIn orgs: ${JSON.stringify(aclBody)}`);
              const orgUrns: string[] = (aclBody.elements ?? [])
                .map((e: { organization?: string }) => e.organization)
                .filter(Boolean);
              if (orgUrns.length === 0) {
                return htmlRedirect(
                  target("/scheduler?connect_error=no_linkedin_pages"),
                  "No LinkedIn Pages found",
                );
              }

              for (const urn of orgUrns) {
                const orgId = urn.split(":").pop()!;
                let name = "LinkedIn Page";
                let logo: string | null = null;
                try {
                  const oRes = await fetch(
                    `https://api.linkedin.com/rest/organizations/${orgId}?fields=id,localizedName,vanityName`,
                    { headers: liHeaders },
                  );
                  if (oRes.ok) {
                    const org = await oRes.json();
                    name = org.localizedName ?? name;
                  }
                } catch {
                  // Name lookup is cosmetic; carry on with the connection.
                }
                await supabaseAdmin.from("social_connections").upsert(
                  {
                    user_id: uid,
                    provider: "linkedin_company",
                    external_id: orgId,
                    display_name: name,
                    avatar_url: logo,
                    access_token_enc: encryptToken(accessToken),
                    scopes:
                      "openid profile email w_member_social r_organization_social w_organization_social rw_organization_admin r_organization_admin",
                    token_expires_at: expiresAt,
                    status: "active",
                    last_error: null,
                    metadata: { organization_urn: urn },
                  },
                  { onConflict: "user_id,provider,external_id" },
                );
              }

              return htmlRedirect(
                target("/scheduler?connected=linkedin_company"),
                "Connecting LinkedIn Page",
              );
            }

            const meRes = await fetch("https://api.linkedin.com/v2/userinfo", {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            const me = await meRes.json();
            if (!meRes.ok) throw new Error(`LinkedIn userinfo: ${JSON.stringify(me)}`);

            await supabaseAdmin.from("social_connections").upsert(
              {
                user_id: uid,
                provider: "linkedin",
                external_id: me.sub,
                display_name: me.name ?? me.email ?? "LinkedIn",
                avatar_url: me.picture ?? null,
                access_token_enc: encryptToken(accessToken),
                scopes: "openid profile email w_member_social",
                token_expires_at: expiresAt,
                status: "active",
                last_error: null,
                metadata: { email: me.email ?? null },
              },
              { onConflict: "user_id,provider,external_id" },
            );


            return htmlRedirect(target("/scheduler?connected=linkedin"), "Connecting LinkedIn");
          }

          // Meta (Facebook + Instagram)
          const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
          tokenUrl.searchParams.set("client_id", process.env.META_APP_ID!);
          tokenUrl.searchParams.set("client_secret", process.env.META_APP_SECRET!);
          tokenUrl.searchParams.set("redirect_uri", redirectUri);
          tokenUrl.searchParams.set("code", code);
          const tRes = await fetch(tokenUrl.toString());
          const tBody = await tRes.json();
          if (!tRes.ok) throw new Error(`Meta token: ${JSON.stringify(tBody)}`);
          const shortToken = tBody.access_token as string;

          // Exchange for long-lived token (~60d)
          const llUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
          llUrl.searchParams.set("grant_type", "fb_exchange_token");
          llUrl.searchParams.set("client_id", process.env.META_APP_ID!);
          llUrl.searchParams.set("client_secret", process.env.META_APP_SECRET!);
          llUrl.searchParams.set("fb_exchange_token", shortToken);
          const llRes = await fetch(llUrl.toString());
          const llBody = await llRes.json();
          if (!llRes.ok) throw new Error(`Meta long-lived: ${JSON.stringify(llBody)}`);
          const userLongToken = llBody.access_token as string;
          const userExp = llBody.expires_in as number | undefined;

          // List managed pages (with their page tokens)
          const pagesRes = await fetch(
            `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,profile_picture_url}&access_token=${encodeURIComponent(userLongToken)}`,
          );
          const pagesBody = await pagesRes.json();
          if (!pagesRes.ok) throw new Error(`Meta pages: ${JSON.stringify(pagesBody)}`);

          const pages: Array<{
            id: string;
            name: string;
            access_token: string;
            instagram_business_account?: { id: string; username?: string; profile_picture_url?: string };
          }> = pagesBody.data ?? [];

          if (pages.length === 0) {
            return htmlRedirect(
              target("/scheduler?connect_error=no_pages_found"),
              "No Pages found",
            );
          }

          for (const page of pages) {
            // Facebook Page connection
            await supabaseAdmin.from("social_connections").upsert(
              {
                user_id: uid,
                provider: "facebook_page",
                external_id: page.id,
                display_name: page.name,
                avatar_url: null,
                access_token_enc: encryptToken(page.access_token),
                scopes: "pages_manage_posts pages_read_engagement",
                token_expires_at: userExp
                  ? new Date(Date.now() + userExp * 1000).toISOString()
                  : null,
                status: "active",
                last_error: null,
                metadata: { page_id: page.id },
              },
              { onConflict: "user_id,provider,external_id" },
            );

            // Instagram Business connection, if linked
            if (page.instagram_business_account?.id) {
              const ig = page.instagram_business_account;
              await supabaseAdmin.from("social_connections").upsert(
                {
                  user_id: uid,
                  provider: "instagram",
                  external_id: ig.id,
                  display_name: ig.username ? `@${ig.username}` : "Instagram",
                  avatar_url: ig.profile_picture_url ?? null,
                  // IG publish uses the *page* access token
                  access_token_enc: encryptToken(page.access_token),
                  scopes: "instagram_basic instagram_content_publish",
                  token_expires_at: userExp
                    ? new Date(Date.now() + userExp * 1000).toISOString()
                    : null,
                  status: "active",
                  last_error: null,
                  metadata: { page_id: page.id, ig_user_id: ig.id, username: ig.username },
                },
                { onConflict: "user_id,provider,external_id" },
              );
            }
          }

          return htmlRedirect(target("/scheduler?connected=meta"), "Connecting Meta");
        } catch (e) {
          const msg = e instanceof Error ? e.message : "unknown";
          console.error("oauth callback error", msg);
          return htmlRedirect(
            target(`/scheduler?connect_error=connection_failed`),
            "Connection failed",
          );
        }
      },
    },
  },
});
