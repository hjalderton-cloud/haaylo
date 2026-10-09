# Campaign asset grid, timeline rail, Mailchimp and Gojiberry

First step: publish the current work so the live site matches the preview (the Briefing Room brief, the "Built by Haaylo" panel and plan-week claiming).

## 1. The four-card asset row

A new horizontal row of four rounded cards, shown on the campaign Overview tab and on the Briefing Room straight after a campaign finishes building. The existing square tiles stay underneath, so nothing is lost.

- **Email** — "✉ EMAIL" tag in small caps, the real subject line as the title, three fading skeleton lines for the body, and the campaign's own call-to-action as a solid button.
- **Social** — "🔗 SOCIAL" tag, a round avatar with your brand name, the real caption hook, and a quiet bottom row with heart and comment counts (illustrative, clearly not live figures).
- **Image** — "🖼 IMAGE" tag, a fixed-shape media block with the generated visual, and the campaign headline set over it in your brand colours and type.
- **Blog** — "📝 BLOG" tag, a tinted banner, the article title, and "5 MIN READ".

Cards show a calm loading state while an asset is still being written, and a short "not built yet" line with a build button when an asset was never requested. Clicking a card opens that asset's tab.

## 2. Blog writing (new)

Campaigns gain a blog article: one 700–900 word piece in your voice, built from the same campaign brief as everything else, with a title and read time. It appears as a new asset alongside posts, page, guide, emails and images — in the build checklist, the asset row and the Content tab, where it can be edited, rewritten and saved like any other asset. Existing campaigns simply show it as not built.

## 3. Timeline rail

Under the cards, a single horizontal track of milestone chips joined by chevrons:

```text
[ SEND ] > [ DRAFT ] > [ READY ] > [ APPROVED ] > [ SCHEDULED · TUE 9:02 AM ]
```

Chips reflect the campaign's real state: completed ones carry a tick, the current one lights up in the brand tone with a soft hover, later ones stay grey. The scheduled chip shows the actual next send time when one exists.

## 4. Mailchimp: draft and schedule

In the Email view, each generated email sits inside a clean, responsive Mailchimp-style layout box. A "⚡ Sync & Schedule in Mailchimp" button pushes it to your Mailchimp account as a campaign and sets the send time.

Because this reaches your audience, it goes through the existing approval step: you see the subject, audience and send time, then approve it once. Nothing sends without that. It uses the Mailchimp key you have already connected; if none is set, the button explains how to connect one.

## 5. Gojiberry inbound leads

A new endpoint accepts contacts from a connected Gojiberry account and drops them straight into the Lead Tracker, tagged as coming from the Gojiberry Intent Agent, and synced on to Mailchimp like any other lead.

Since there are no Gojiberry credentials yet, the connection is set up from your side: a Connections panel gives you a unique webhook address and secret to paste into Gojiberry. Only requests carrying that secret are accepted. If the payload shape from Gojiberry turns out to differ once you have an account, adjusting the field mapping is a small follow-up.

## Technical notes

- Additive migration only: `campaigns.has_blog boolean not null default false`; `landing_page_leads.source_platform text null`; new `inbound_webhook_tokens` table (user_id, project_id, platform, token hash, landing_page_id, created_at) with RLS scoped to `auth.uid()` and the usual grants. No existing column, table, route or module is changed or removed.
- Blog generation reuses `campaign-generate.functions.ts` and the shared `brief()` + `briefContext()` prompt path; the article is stored as a `content_bank_items` row (kind `blog`) linked to the campaign, with `asset_status.blog` tracking progress.
- The asset row is a new `src/components/campaign/CampaignAssetGrid.tsx` plus `CampaignTimelineRail.tsx`, fed by the existing `listCampaignAssets` server function extended with the blog row and the next scheduled time. Styling comes from `src/lib/theme.ts` tokens.
- Mailchimp push is a new `mailchimp-campaign.functions.ts` server function using the stored per-user key (`mailchimp_settings`), registered in the tool registry as a HIGH-risk action so it runs through `requestToolApproval`/`approveAndRun`.
- Gojiberry listener is `src/routes/api/public/gojiberry-lead.ts`, modelled on `embed-lead.ts`: token lookup, Zod validation, insert into `landing_page_leads` with `source_platform: 'Gojiberry Intent Agent'` against the workspace's capture page, then the existing Mailchimp upsert.
- Checks before done: typecheck, registry tests, the campaign page and Briefing Room rendered at desktop and mobile widths, and the Gojiberry endpoint exercised with a signed and an unsigned request.
