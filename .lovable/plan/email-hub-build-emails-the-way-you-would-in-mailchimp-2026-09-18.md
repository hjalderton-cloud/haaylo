# Email hub — build emails the way you would in Mailchimp

Right now the nurture sequence is one long block of text with Edit and Copy. This turns it into a proper email builder: one hub in the main menu, each email in the sequence opened and edited on its own, laid out like a Mailchimp campaign.

## What you get

**New "Email" section in the main menu**, listing every sequence you have across your campaigns and your standalone funnel. Open a sequence and you see Email 1, 2, 3… as a numbered list with subject, audience, planned send date and status, plus Edit on each.

**Each email opens in a Mailchimp-style editor** with:
- Subject line and preview text (written by Haaylo, editable) plus a "Suggest titles" button that offers a few alternatives to pick from
- Audience picker, filled with the real audience names pulled from your connected Mailchimp account
- Planned send date and time, saved in Haaylo so you can see the whole sequence timeline
- Body editor with formatting, plus an image block — generate an on-brand image or upload one
- An inbox-style preview panel showing exactly how it will land, with your brand look

**Sequence view** shows the emails in order with their planned dates side by side, so you can see the run of the campaign at a glance. Reorder by changing an email's position.

**Sync stays deliberate.** Nothing goes to Mailchimp automatically. The existing "Sync to Mailchimp" button still sends the sequence across when you choose to, using the dates and audience you set.

## Where the content comes from

Existing sequences are split into their individual emails automatically the first time you open them, so nothing you have written is lost. New sequences are written straight into the per-email format, keeping the current British voice and banned-phrase rules.

## Technical notes

- Additive only. No existing route, backend action or tier check is removed. `/funnel` keeps its sequence section, which links into the new editor.
- New sidebar hub `Email` in `src/components/HubTabs.tsx`: Sequences, plus per-campaign entry. New routes `src/routes/_authenticated/email.index.tsx` (sequence list) and `email.$id.tsx` (single email editor).
- Reuses `email_sequences`. Additive migration adds nullable columns: `preview_text`, `audience_id`, `audience_name`, `planned_send_at`, `hero_image_url`, `hero_image_path`, with GRANTs unchanged (table already has RLS + policies).
- Server functions extend `src/lib/campaign-assets.functions.ts` style: `listEmailSequences`, `getEmailSequence`, `updateEmailSequence` (extends existing `updatePhaseEmail`), `suggestSubjectLines` (Lovable AI, `openai/gpt-6-astra` on the Responses API, streamed and consumed server-side), and `splitLegacySequence` for one-off migration of `funnels.email_output` text into rows.
- Audience list: new `listMailchimpAudiences` server fn calling `GET /3.0/lists` with the stored key/prefix from `mailchimp_settings` via the existing `mailchimp-leads.server` credential helper. Falls back to a plain text field when Mailchimp is not connected.
- Image block reuses the existing content-bank image generation and `scheduler-media` upload path.
- All reads/writes carry the explicit `projectId`; no workspace inference.
- Light palette, Poppins, navy headings, purple primary, pink accents — no new theme tokens.

## Out of scope

Actually scheduling the send inside Mailchimp, and sending from Haaylo. Dates are planning only until you press Sync.
