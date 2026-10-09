import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { generateEmails, getFunnel, getFunnelOverview, saveFunnel } from "@/lib/funnel.functions";
import { syncSequenceToMailchimp } from "@/lib/mailchimp-sync.functions";
import { listCampaigns } from "@/lib/campaigns.functions";
import { getCampaignFunnelContext, getCampaignFunnelLinks } from "@/lib/magnet.functions";
import { MAGNET_FONTS, fontKey } from "@/lib/magnet-tokens";
import { pushLeadsToMailchimp, getLeadSyncStatus } from "@/lib/mailchimp-leads.functions";
import { saveMailchimpSettings } from "@/lib/mailchimp.functions";
import { NAVY, INDIGO, PINK, GREY, LINE, TINT, SURFACE, font } from "@/lib/theme";

import { AppShell } from "@/components/AppShell";
import { MagnetEngine } from "@/components/magnet/MagnetEngine";
import { useWorkspace } from "@/hooks/useActiveProject";
import {
  getInboundWebhook,
  createInboundWebhook,
  type InboundWebhook,
} from "@/lib/inbound-webhooks.functions";
import { GenLoading } from "@/components/GenLoading";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowRight,
  Check,
  Code2,
  Copy,
  Download,
  FileText,
  Inbox,
  LayoutTemplate,
  Mail,
  Pencil,
  Sparkles,
} from "lucide-react";

const MUTED = GREY;
const STANDALONE = "standalone";
/** Embeds always point at the published site, never the preview address. */
const EMBED_ORIGIN = "https://haaylo.com";

export const Route = createFileRoute("/_authenticated/funnel")({
  head: () => ({
    meta: [
      { title: "Lead Funnel — Haaylo" },
      {
        name: "description",
        content: "Build your lead magnet, opt-in page and nurture email sequence — all in your voice.",
      },
      { property: "og:title", content: "Lead Funnel — Haaylo" },
      {
        property: "og:description",
        content: "Your opt-in page, downloadable guide and nurture emails, built together.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { campaign?: string } =>
    typeof search.campaign === "string" ? { campaign: search.campaign } : {},
  component: FunnelPage,
});

function FunnelPage() {
  const queryClient = useQueryClient();
  const fetchFunnel = useServerFn(getFunnel);
  const fetchOverview = useServerFn(getFunnelOverview);
  const runEmails = useServerFn(generateEmails);
  const runSave = useServerFn(saveFunnel);
  const runMailchimpSync = useServerFn(syncSequenceToMailchimp);

  const { projectId } = useWorkspace();
  const scope = { projectId };

  const funnelQuery = useQuery({
    queryKey: ["funnel", projectId],
    queryFn: () => fetchFunnel({ data: scope }),
  });
  const overviewQuery = useQuery({ queryKey: ["funnel-overview"], queryFn: () => fetchOverview() });

  // The campaign this funnel is currently building for — or a standalone
  // freebie, which is tied to no calendar at all.
  const campaignsQuery = useQuery({
    queryKey: ["funnel-campaigns", projectId],
    queryFn: () => listCampaigns({ data: scope }),
  });
  const campaigns = useMemo(() => campaignsQuery.data ?? [], [campaignsQuery.data]);
  const [choice, setChoice] = useState<string | null>(null);
  useEffect(() => {
    setChoice(null);
    setEmailsDraft(null);
  }, [projectId]);
  // Links from a campaign (e.g. the launch guide) pass ?campaign= so the
  // funnel opens on that campaign rather than the first in the list.
  const search = Route.useSearch();
  const selected = choice ?? search.campaign ?? campaigns[0]?.id ?? STANDALONE;
  const selectedCampaignId = selected === STANDALONE ? null : selected;

  const campaignContext = useQuery({
    queryKey: ["funnel-campaign-context", projectId ?? "default", selectedCampaignId ?? "standalone"],
    queryFn: () =>
      getCampaignFunnelContext({
        data: { ...scope, ...(selectedCampaignId ? { campaignId: selectedCampaignId } : {}) },
      }),
  });
  const selectedCampaign = campaignContext.data?.campaign ?? null;
  const savedKit = campaignContext.data?.saved_kit ?? null;

  // The campaign's own brand design drives this page, so the funnel, the
  // opt-in page and the guide all look like one thing.
  const brand = campaignContext.data?.brand;
  const brandFont = MAGNET_FONTS[fontKey(brand?.font_preference)];
  const accent = brand?.primary_color || PINK;
  const accent2 = brand?.secondary_color || "#7c3aed";
  const ctaStyle = { background: `linear-gradient(135deg, ${accent} 0%, ${accent2} 100%)`, color: "#fff" };

  // Sign-ups reach the owner's real email list, not just the guide page.
  const syncStatusFn = useServerFn(getLeadSyncStatus);
  const pushLeadsFn = useServerFn(pushLeadsToMailchimp);
  const saveMailchimp = useServerFn(saveMailchimpSettings);
  const syncQuery = useQuery({
    queryKey: ["lead-sync", selectedCampaignId ?? "all"],
    queryFn: () => syncStatusFn({ data: selectedCampaignId ? { campaignId: selectedCampaignId } : {} }),
  });
  const sync = syncQuery.data;
  const [sending, setSending] = useState(false);
  const sendLeads = useCallback(async () => {
    setSending(true);
    try {
      const res = await pushLeadsFn({ data: selectedCampaignId ? { campaignId: selectedCampaignId } : {} });
      toast.success(
        res.sent > 0
          ? `${res.sent} ${res.sent === 1 ? "lead" : "leads"} sent to your email list.`
          : "Nothing new to send — your list is up to date.",
      );
      if (res.failed > 0) toast.error(`${res.failed} couldn't be added — check the addresses.`);
      await syncQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't reach your email list.");
    } finally {
      setSending(false);
    }
  }, [pushLeadsFn, selectedCampaignId, syncQuery]);

  // Connecting a list is one field: the key carries its own server code, so
  // nothing has to be mapped by hand.
  const [apiKey, setApiKey] = useState("");
  const connectList = useMutation({
    mutationFn: async () => {
      const key = apiKey.trim();
      const prefix = key.split("-")[1] ?? "";
      if (!key || !prefix) throw new Error("That key doesn't look right — it should end in something like -us14.");
      await saveMailchimp({ data: { mailchimp_api_key: key, mailchimp_server_prefix: prefix } });
      return pushLeadsFn({ data: selectedCampaignId ? { campaignId: selectedCampaignId } : {} });
    },
    onSuccess: async (res) => {
      setApiKey("");
      toast.success(
        res.sent > 0 ? `List connected — ${res.sent} existing sign-ups sent across.` : "List connected.",
      );
      await syncQuery.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't connect that list."),
  });

  const fetchLinks = useServerFn(getCampaignFunnelLinks);
  const linksQuery = useQuery({
    queryKey: ["funnel-links", selectedCampaignId ?? "none"],
    queryFn: () => fetchLinks({ data: { campaignId: selectedCampaignId! } }),
    enabled: !!selectedCampaignId,
  });
  const links = linksQuery.data;
  // A standalone freebie has no campaign to look its page up from, so the page
  // the engine just built is held here instead.
  const [standalonePage, setStandalonePage] = useState<{ id: string; slug: string } | null>(null);
  // No mount-time reset here: the engine below re-reports the remembered page
  // (or null) whenever the workspace or selection changes, so it stays the
  // single source. A reset on load used to wipe the page it had just restored.
  const optinPage = selectedCampaignId
    ? (links?.page ?? null)
    : standalonePage
      ? { id: standalonePage.id, slug: standalonePage.slug, status: "draft" }
      : null;
  const pageSlug = optinPage?.slug ?? null;

  const loaded = funnelQuery.data?.funnel;
  const [emailsDraft, setEmailsDraft] = useState<string | null>(null);
  const emailsText = emailsDraft ?? loaded?.email_output ?? "";
  const overview = overviewQuery.data;

  // The wording behind the emails comes from the campaign, with the saved
  // funnel only filling gaps — nothing to fill in by hand.
  const emailInputs = {
    problem: selectedCampaign?.theme || loaded?.problem || "",
    offer: selectedCampaign?.headline || loaded?.offer || "",
    magnetType: loaded?.magnet_type || "PDF guide / checklist",
    price: loaded?.price ?? "",
  };

  const [engineBusy, setEngineBusy] = useState(false);

  const campaignScope = selectedCampaignId ? { campaignId: selectedCampaignId } : {};

  const emailsMutation = useMutation({
    mutationFn: () => runEmails({ data: { ...emailInputs, ...scope, ...campaignScope } }),
    onSuccess: async (r) => {
      toast.success("Email sequence written — saved to your funnel");
      setEmailsDraft(r.output);
      await queryClient.invalidateQueries({ queryKey: ["funnel-overview"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "That didn't work — try again"),
  });
  const mailchimpMutation = useMutation({
    mutationFn: () =>
      runMailchimpSync({
        data: {
          subject: `${emailInputs.offer?.trim() || "Your"} nurture sequence`.slice(0, 150),
          body: emailsText,
        },
      }),
    onSuccess: (r) => toast.success(`Sent to Mailchimp as a draft campaign for ${r.audience}`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't reach Mailchimp — try again"),
  });

  const saveEmails = useMutation({
    mutationFn: () =>
      runSave({ data: { ...emailInputs, ...scope, ...campaignScope, emailOutput: emailsText } }),
    onSuccess: async () => {
      toast.success("Saved to your funnel");
      await queryClient.invalidateQueries({ queryKey: ["funnel"] });
    },
    onError: () => toast.error("Couldn't save — try again"),
  });

  // Whatever the engine writes is kept on the funnel record too.
  const saveMagnetText = useMutation({
    mutationFn: (text: string) =>
      runSave({ data: { ...emailInputs, ...scope, ...campaignScope, magnetOutput: text } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["funnel-overview"] });
    },
  });

  const copy = (text: string, what: string) => {
    void navigator.clipboard.writeText(text).then(
      () => toast.success(`${what} copied`),
      () => toast.error("Couldn't copy — select the text manually"),
    );
  };

  return (
    <AppShell title="Lead Funnel">
      <div
        className="mx-auto max-w-3xl space-y-8 pb-20"
        style={
          {
            fontFamily: brandFont.body,
            "--funnel-accent": accent,
            "--funnel-accent-2": accent2,
          } as React.CSSProperties
        }
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight" style={{ color: NAVY, fontFamily: font }}>
              Lead Funnel
            </h1>
            <p className="mt-1 text-sm" style={{ color: MUTED }}>
              Your opt-in page and guide are written and designed the moment you land here — pick a
              campaign, or build a freebie on its own.
            </p>
          </div>
          <div className="min-w-[220px] space-y-1.5">
            <Label htmlFor="funnel-campaign">Building for</Label>
            <select
              id="funnel-campaign"
              className="w-full rounded-md border px-3 py-2 text-sm"
              style={{ border: `1px solid ${LINE}`, color: NAVY, background: "#FFFFFF" }}
              value={selected}
              onChange={(e) => setChoice(e.target.value)}
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.campaign_title}
                </option>
              ))}
              <option value={STANDALONE}>Standalone freebie (no calendar)</option>
            </select>
            <p className="text-xs" style={{ color: MUTED }}>
              {selectedCampaign
                ? `${selectedCampaign.duration === "30-day" ? "30-day launch" : "90-day system"} — wording comes from this campaign.`
                : "A one-off freebie, built from your Brand DNA and tied to no schedule."}
            </p>
          </div>
        </div>

        {/* Funnel stage overview */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StageCard
            icon={<FileText className="h-4 w-4" />}
            label="1. Lead magnet"
            done={overview?.magnetDone ?? false}
            hint={overview?.magnetDone ? "Designed" : "Building"}
          />
          <StageCard
            icon={<LayoutTemplate className="h-4 w-4" />}
            label="2. Opt-in page"
            done={links ? links.page?.status === "live" : (overview?.landingPages ?? []).some((p) => p.status === "live")}
            hint={
              links
                ? links.page
                  ? links.page.status === "live"
                    ? "Live"
                    : "Draft"
                  : "Not yet"
                : (overview?.landingPages.length ?? 0) > 0
                  ? `${overview!.landingPages.length} page${overview!.landingPages.length === 1 ? "" : "s"}`
                  : "Not yet"
            }
          />
          <StageCard
            icon={<Mail className="h-4 w-4" />}
            label="3. Email sequence"
            done={overview?.emailsDone ?? false}
            hint={overview?.emailsDone ? "Written" : "Not yet"}
          />
          <StageCard
            icon={<Inbox className="h-4 w-4" />}
            label="4. Leads"
            done={(links?.leads ?? overview?.leadsCaptured ?? 0) > 0}
            hint={`${links?.leads ?? overview?.leadsCaptured ?? 0} captured`}
          />
        </div>

        {/* The designed kit: cover style, previews, text controls, PDF */}
        <section
          id="designed-kit"
          className="space-y-5 rounded-2xl border p-6"
          style={{
            borderColor: `${accent}55`,
            background: `linear-gradient(135deg, ${accent}14 0%, ${accent2}10 100%)`,
          }}
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2
                className="text-lg"
                style={{ color: NAVY, fontFamily: brandFont.heading, fontWeight: brandFont.headingWeight }}
              >
                {selectedCampaign?.title ? `${selectedCampaign.title} funnel` : "Your freebie"}
              </h2>
              <p className="mt-0.5 text-xs" style={{ color: MUTED }}>
                Page and guide are written together and share the same colours and type.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {[accent, accent2, brand?.accent_color || accent].map((c, i) => (
                <span
                  key={i}
                  className="h-5 w-5 rounded-full border"
                  style={{ background: c, border: `1px solid ${LINE}` }}
                />
              ))}
            </div>
          </div>

          <MagnetEngine
            key={selected}
            campaignId={selectedCampaignId}
            campaignHasCopy={selectedCampaign?.has_copy ?? false}
            savedKit={savedKit}
            hasPage={!!optinPage}
            contextReady={
              !campaignContext.isLoading && (selectedCampaignId ? !linksQuery.isLoading : true)
            }
            onGeneratingChange={setEngineBusy}
            onPageBuilt={(page) => {
              if (!selectedCampaignId) setStandalonePage(page);
              void linksQuery.refetch();
              void queryClient.invalidateQueries({ queryKey: ["funnel-overview"] });
            }}
            onKitGenerated={(text) => saveMagnetText.mutate(text)}
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <FunnelPiece
              icon={<LayoutTemplate className="h-4 w-4" />}
              title="Opt-in page"
              status={optinPage ? (optinPage.status === "live" ? "Live" : "Draft") : "Not built yet"}
              accent={accent}
              primaryHref={pageSlug ? `/p/${pageSlug}` : undefined}
              primaryLabel="View page"
              editLink={
                optinPage ? (
                  <Link to="/landing/$id" params={{ id: optinPage.id }} style={{ color: accent }}>
                    Edit page
                  </Link>
                ) : (
                  <Link to="/landing" style={{ color: accent }}>
                    Build page
                  </Link>
                )
              }
            />
            <FunnelPiece
              icon={<FileText className="h-4 w-4" />}
              title="Magnet guide"
              status={links?.guideReady ? "Ready" : selectedCampaignId ? "Building" : "Standalone"}
              accent={accent}
              primaryHref={links?.guideReady && selectedCampaignId ? `/guide/${selectedCampaignId}` : undefined}
              primaryLabel="Read guide"
              editLink={
                <a href="#designed-kit" style={{ color: accent }}>
                  Edit guide
                </a>
              }
            />
            <FunnelPiece
              icon={<Mail className="h-4 w-4" />}
              title="Email sequence"
              status={emailsText ? "Written" : "Not written yet"}
              accent={accent}
              editLink={
                <a href="#email-sequence" style={{ color: accent }}>
                  Open sequence
                </a>
              }
            />
          </div>
        </section>

        {/* Embed & connect */}
        <EmbedPanel slug={pageSlug} accent={accent} onCopy={copy} />

        <GojiberryPanel projectId={projectId} accent={accent} onCopy={copy} />

        {/* Where the sign-ups actually land */}
        <section
          className="space-y-3 rounded-2xl border p-6"
          style={{ border: `1px solid ${LINE}`, background: SURFACE }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: NAVY }}>Email list</p>
            <p className="mt-0.5 text-xs" style={{ color: MUTED }}>
              {!sync
                ? "Checking your email list…"
                : !sync.connected
                  ? "Paste your Mailchimp key below and every sign-up goes across automatically, tagged with this campaign."
                  : sync.pending > 0
                    ? `${sync.synced} already on your list, ${sync.pending} waiting to be sent.`
                    : `All ${sync.synced} sign-ups are on your list, tagged with this campaign.`}
            </p>
          </div>
          {sync?.connected ? (
            <Button onClick={() => void sendLeads()} disabled={sending} style={ctaStyle}>
              {sending ? "Sending…" : sync.pending > 0 ? `Send ${sync.pending} to my list` : "Re-check"}
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Mailchimp API key (ends in -us14)"
                className="max-w-xs"
              />
              <Button
                onClick={() => connectList.mutate()}
                disabled={connectList.isPending || !apiKey.trim()}
                style={ctaStyle}
              >
                {connectList.isPending ? "Connecting…" : "Connect my list"}
              </Button>
            </div>
          )}
        </section>

        {/* Email generation */}
        <section
          id="email-sequence"
          className="space-y-4 rounded-2xl border p-6"
          style={{ border: `1px solid ${LINE}`, background: SURFACE }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold" style={{ color: NAVY }}>
                Nurture email sequence
              </h2>
              <p className="text-xs" style={{ color: MUTED }}>
                Five ready-to-send emails: welcome → value → problem → proof → offer.
              </p>
            </div>
            <Button
              onClick={() => emailsMutation.mutate()}
              disabled={emailsMutation.isPending || engineBusy}
              style={ctaStyle}
            >
              <Sparkles className="mr-1.5 h-4 w-4" />
              {emailsMutation.isPending ? "Writing…" : emailsText ? "Regenerate emails" : "Write my sequence"}
            </Button>
            {emailsText ? (
              <Button
                variant="outline"
                onClick={() => mailchimpMutation.mutate()}
                disabled={mailchimpMutation.isPending}
                style={{ border: `1px solid ${LINE}`, color: NAVY, background: "transparent" }}
              >
                <Mail className="mr-1.5 h-4 w-4" />
                {mailchimpMutation.isPending ? "Syncing…" : "Sync sequence to Mailchimp"}
              </Button>
            ) : null}
          </div>

          {emailsMutation.isPending && (
            <GenLoading label="Writing your nurture emails…" estimate="Usually takes about 30 seconds" />
          )}
          {emailsText ? (
            <OutputBlock
              text={emailsText}
              onChange={(v) => setEmailsDraft(v)}
              onCopy={() => copy(emailsText, "Email sequence")}
              onSave={() => saveEmails.mutate()}
              saving={saveEmails.isPending}
            />
          ) : (
            <p className="text-sm" style={{ color: MUTED }}>
              Nothing yet. Press Write my sequence and it follows the same campaign wording.
            </p>
          )}
          
        </section>
      </div>
    </AppShell>
  );
}

/** The address and secret to paste into a Gojiberry account. */
function GojiberryPanel({
  projectId,
  accent,
  onCopy,
}: {
  projectId: string | null;
  accent: string;
  onCopy: (text: string, what: string) => void;
}) {
  const getFn = useServerFn(getInboundWebhook);
  const createFn = useServerFn(createInboundWebhook);
  const [hook, setHook] = useState<InboundWebhook | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let live = true;
    void (async () => {
      try {
        const row = await getFn({ data: { workspaceId: projectId, platform: "gojiberry" } });
        if (live) setHook(row);
      } catch {
        /* the rest of the page still works */
      }
    })();
    return () => {
      live = false;
    };
  }, [projectId, getFn]);

  async function create() {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      const row = await createFn({ data: { workspaceId: projectId, platform: "gojiberry" } });
      setHook(row);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const url = `${EMBED_ORIGIN}/api/public/gojiberry-lead`;

  return (
    <section
      className="space-y-3 rounded-2xl border p-6"
      style={{ border: `1px solid ${LINE}`, background: SURFACE }}
    >
      <div className="flex items-center gap-2">
        <Code2 className="h-4 w-4" style={{ color: accent }} />
        <h2 className="font-semibold" style={{ color: NAVY }}>
          Gojiberry contacts
        </h2>
      </div>
      <p className="text-xs" style={{ color: MUTED }}>
        Paste this address and secret into Gojiberry. Contacts it sends arrive in your Lead Tracker,
        marked as coming from the Gojiberry Intent Agent, and go on to your email list.
      </p>
      {!hook ? (
        <>
          <Button size="sm" onClick={() => void create()} disabled={busy || !projectId}>
            {busy ? "Setting it up…" : "Set up the connection"}
          </Button>
          {error && (
            <p className="text-xs" style={{ color: accent }}>
              {error}
            </p>
          )}
        </>
      ) : (
        <>
          <pre
            className="overflow-x-auto rounded-xl border p-4 text-[11px] leading-relaxed"
            style={{ border: `1px solid ${LINE}`, color: NAVY, background: SURFACE }}
          >
            {`POST ${url}\nx-haaylo-token: ${hook.token}\n{ "email": "name@example.com", "firstName": "Sam" }`}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onCopy(url, "Webhook address")}>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy address
            </Button>
            <Button size="sm" variant="outline" onClick={() => onCopy(hook.token, "Secret")}>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy secret
            </Button>
            <Button size="sm" variant="outline" onClick={() => void create()} disabled={busy}>
              {busy ? "Working…" : "Replace secret"}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

/** One line of code the owner drops onto their own website. */
function EmbedPanel({
  slug,
  accent,
  onCopy,
}: {
  slug: string | null;
  accent: string;
  onCopy: (text: string, what: string) => void;
}) {
  const [mode, setMode] = useState<"inline" | "popup">("inline");
  const snippet = slug
    ? mode === "inline"
      ? `<div id="haaylo-form"></div>\n<script src="${EMBED_ORIGIN}/api/public/embed.js?p=${slug}&mode=inline" async></script>`
      : `<script src="${EMBED_ORIGIN}/api/public/embed.js?p=${slug}&mode=popup" async></script>`
    : "";

  return (
    <section
      className="space-y-3 rounded-2xl border p-6"
      style={{ border: `1px solid ${LINE}`, background: SURFACE }}
    >
      <div className="flex items-center gap-2">
        <Code2 className="h-4 w-4" style={{ color: accent }} />
        <h2 className="font-semibold" style={{ color: NAVY }}>
          Embed &amp; connect
        </h2>
      </div>
      <p className="text-xs" style={{ color: MUTED }}>
        Add this to your own website and sign-ups land in your Lead Tracker, then go to your email list.
      </p>
      {!slug ? (
        <p className="text-sm" style={{ color: MUTED }}>
          Your opt-in page is still being built — the code appears here once it exists.
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            {(["inline", "popup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize"
                style={{
                  borderColor: mode === m ? accent : LINE,
                  color: mode === m ? accent : MUTED,
                }}
              >
                {m === "inline" ? "Inline form" : "Pop-up"}
              </button>
            ))}
          </div>
          <pre
            className="overflow-x-auto rounded-xl border p-4 text-[11px] leading-relaxed"
            style={{ border: `1px solid ${LINE}`, color: NAVY, background: SURFACE }}
          >
            {snippet}
          </pre>
          <Button size="sm" variant="outline" onClick={() => onCopy(snippet, "Embed code")}>
            <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy code
          </Button>
        </>
      )}
    </section>
  );
}

function FunnelPiece({
  icon,
  title,
  status,
  accent,
  primaryHref,
  primaryLabel,
  editLink,
}: {
  icon: React.ReactNode;
  title: string;
  status: string;
  accent: string;
  primaryHref?: string;
  primaryLabel?: string;
  editLink: React.ReactNode;
}) {
  return (
    <div
      className="flex h-full flex-col justify-between gap-3 rounded-xl border p-4"
      style={{ border: `1px solid ${LINE}`, background: "#FFFFFF" }}
    >
      <div>
        <div className="flex items-center gap-2">
          <span style={{ color: accent }}>{icon}</span>
          <p className="text-sm font-semibold" style={{ color: NAVY }}>
            {title}
          </p>
        </div>
        <p className="mt-1 text-xs" style={{ color: MUTED }}>
          {status}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
        {primaryHref ? (
          <a href={primaryHref} target="_blank" rel="noreferrer" style={{ color: accent }}>
            {primaryLabel}
          </a>
        ) : null}
        {editLink}
      </div>
    </div>
  );
}

function StageCard({
  icon,
  label,
  done,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  done: boolean;
  hint: string;
}) {
  return (
    <div
      className="rounded-2xl border p-4"
      style={{ border: done ? `1px solid ${TINT.greenInk}55` : `1px solid ${LINE}`, background: SURFACE }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color: done ? TINT.greenInk : MUTED }}>{done ? <Check className="h-4 w-4" /> : icon}</span>
        <p className="text-xs font-semibold" style={{ color: NAVY }}>
          {label}
        </p>
      </div>
      <p className="mt-1.5 text-xs" style={{ color: done ? TINT.greenInk : MUTED }}>
        {hint}
      </p>
    </div>
  );
}

function renderInline(s: string): React.ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} style={{ color: NAVY }}>
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function MarkdownView({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flushList = (key: string) => {
    if (list.length === 0) return;
    const items = list;
    blocks.push(
      <ul key={key} className="list-disc space-y-1 pl-5">
        {items.map((item, i) => (
          <li key={i} className="text-sm leading-relaxed" style={{ color: NAVY }}>
            {renderInline(item)}
          </li>
        ))}
      </ul>,
    );
    list = [];
  };
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) {
      flushList(`ul-${i}`);
      return;
    }
    if (line.startsWith("- ") || line.startsWith("• ")) {
      list.push(line.slice(2));
      return;
    }
    flushList(`ul-${i}`);
    if (line.startsWith("## ")) {
      blocks.push(
        <h3 key={i} className="pt-3 text-sm font-semibold tracking-wide uppercase" style={{ color: PINK }}>
          {line.slice(3)}
        </h3>,
      );
    } else if (line.startsWith("# ")) {
      blocks.push(
        <h3 key={i} className="pt-2 text-base font-semibold" style={{ color: NAVY }}>
          {line.slice(2)}
        </h3>,
      );
    } else {
      blocks.push(
        <p key={i} className="text-sm leading-relaxed" style={{ color: NAVY }}>
          {renderInline(line)}
        </p>,
      );
    }
  });
  flushList("ul-end");
  return <div className="space-y-2.5">{blocks}</div>;
}

function OutputBlock({
  text,
  onChange,
  onCopy,
  onSave,
  saving,
}: {
  text: string;
  onChange: (v: string) => void;
  onCopy: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="space-y-3">
      {editing ? (
        <Textarea
          rows={16}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-xs leading-relaxed"
        />
      ) : (
        <div
          className="max-h-[480px] overflow-y-auto rounded-xl border p-5"
          style={{ border: `1px solid ${LINE}`, background: "#FFFFFF" }}
        >
          <MarkdownView text={text} />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setEditing((e) => !e)}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" /> {editing ? "Done editing" : "Edit"}
        </Button>
        <Button size="sm" variant="outline" onClick={onCopy}>
          <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
        </Button>
        {editing && (
          <Button size="sm" variant="outline" onClick={onSave} disabled={saving}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> {saving ? "Saving…" : "Save edits"}
          </Button>
        )}
      </div>
    </div>
  );
}
