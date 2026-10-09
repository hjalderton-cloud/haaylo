# Haaylo — Light Theme Pass (Round 2)

Visual only. No functionality, database, routes, navigation, tier, or behaviour changes. Strictly additive — nothing is removed or renamed. The only goal: the signed-in app looks like the Briefing Room (`/home`) and the approved light palette, instead of the current dark navy.

## Scope

Convert the **app chrome** and the **signed-in app screens** to the light palette. Keep everything working exactly as it does today.

**In scope** — the screens and chrome listed below.

**Out of scope (deliberately untouched this round)** — these keep their current styling and can be a later pass:
- Public marketing pages: `pricing`, `waitlist`, `auth`, `p.$slug`, `guide.$campaignId`, `unsubscribe`, `[.]lovable.oauth.consent`
- Transactional email templates (`src/lib/email-templates/*`)
- The legacy Engine iframe (`/engine`, the Content Hub `/tools` shell) — a separate bundled surface; flagged for a later round
- `theme-color` meta stays navy for now (only changes when public pages convert)

## The palette (already used by `/home`)

From `src/components/agent/theme.ts`, now the single source for the whole app:

| Current dark value | New light value | Use |
|---|---|---|
| `#141B3D` navy bg | `#FAFAFC` (BG) | page background |
| `#1B2350` / `rgba(20,27,61,…)` cards | `#F6F7FA` (SURFACE) / `#FFFFFF` | cards, surfaces |
| `#F5F3FF` / `#C9CDE6` / `#DCE1F5` text | `#171D41` (NAVY) / `#2D2964` (INDIGO) | headings / secondary |
| `#7A82A6` muted | `#CECDD4` (GREY) | inactive, captions |
| `#FF5C93` pink | `#E54683` (PINK) | accent only: active tab, link, small icon |
| purple `#9B5CFF` | `#553EA2` (PURPLE) | primary buttons |
| `rgba(255,255,255,0.08)` borders | `#E6E6EC` (LINE) | card / divider borders |
| `rgba(255,255,255,0.04–0.06)` subtle fill | `#F6F7FA` | hovered rows, inputs |
| `rgba(255,92,147,0.10–0.12)` active tint | `#EEEAF7` (TINT.purple) | active nav / chip |
| status pills | green `#E8F5EE`/`#1E7A4E`, pink `#FDEAF1`/`#B32C61`, purple `#EEEAF7`/`#4A3690`, blue `#EDEFF5`/`#3A4266` | scheduled / draft / strategy / campaign |
| `rgba(0,0,0,0.45)` shadow | soft grey `0 12px 28px -6px rgba(20,20,40,0.12)` | card depth |

Accents stay accents — buttons, active tabs, links, small icons only. Flat, 12–16px radius, no gradients or glow. Poppins throughout (600/700 headings, 400/500 body).

## How it's applied

1. **Fonts & tokens.** Add Poppins to the root route font link in `src/routes/__root.tsx` (alongside the existing families) and set Poppins as the app body font. Rewrite the `:root` block in `src/styles.css` to the light values above so every utility-class component (`bg-card`, `text-foreground`, `bg-background`, `border`, shadcn primitives) also renders light. The `.dark` block stays defined but unused this round.
2. **Shared palette module.** Promote `theme.ts` constants to a shared import (`src/lib/theme.ts` re-export, or keep `components/agent/theme.ts` and import) so every chrome/screen file imports `BG, SURFACE, NAVY, INDIGO, PURPLE, PINK, GREY, LINE, TINT, font`. The chrome's exported `NAVY/PINK/MUTED/CARD` constants switch to these.
3. **Chrome conversion** — `AppShell.tsx` (root bg, sidebar, mobile header, `BackButton`, `Wordmark` filter, `BrainHealthWidget`, `CARD`), `WorkflowNav.tsx` (sidebar, group buttons, flyout submenus, `ContextBar`, `MobileTabs`, `AccountMenu`), `ComingSoon.tsx`.
4. **Campaign workbench** — `campaign.$id.tsx` (tiles, tab bar), `campaign.index.tsx` (empty state already light-touched), `CampaignAssetPanels.tsx`, `CampaignEngineModal.tsx`, `CampaignSwitcher.tsx`, `first-post.tsx`.
5. **Older signed-in screens** — `brain.setup.tsx`, `brand-assets.tsx`, `brand-dna/fields.tsx`, `plan` (90-day), `competitors`, `personas`, `bank`, `tools`, `ideas`, `repurpose`, `caption-variator`, `hashtags`, `snippets`, `automations`, `calendar`, `scheduler`, `analytics.campaigns`, `analytics.content`, `analytics.leads`, `image`, `account`, `admin.codes`, `welcome`, `agent/*` (home, queue, calendar, analytics, settings, approvals).

## What I'll check

- `bunx tsgo --noEmit` after the edits.
- Playwright screenshots of each converted screen (signed in to Haaylo) to confirm contrast, borders, shadows and status pills read correctly — not just that it compiles. The Briefing Room already sets the bar; these should match it.
- The `Toaster` switches to `theme="light"` so toasts stay legible on the light background.

## Risks & how I'll handle them

- **Contrast on converted inline styles** — many values were tuned for dark (white-at-low-opacity borders/fills, dark shadows). I'll map each to its light equivalent per the table, not a blanket swap, and screenshot-verify.
- **Branded artwork** — the wordmark and nav icons are dark-theme assets. The wordmark already has a pink glow filter; I'll keep the pink monogram/wordmark but recolour any inline tint that clashes. Nav PNG icons stay (they read fine on light at full opacity).
- **Public-facing contrast** — out-of-scope pages keep the dark chrome tokens, so they remain self-consistent; no half-and-half within a page.
- **No functional drift** — this is a style-only sweep; no props, handlers, queries, or routes change.

## Not in this round

Converting the public marketing pages and the legacy Engine iframe to light, vector search, pricing/tier changes, and any new agent capability.
