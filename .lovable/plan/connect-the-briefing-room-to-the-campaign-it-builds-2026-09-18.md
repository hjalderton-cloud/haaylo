# Connect the Briefing Room to the campaign it builds

## What's actually happening

The two screens are connected — pressing **Build campaign** does create a real campaign and then generates each asset before dropping you into it. What is missing is the *thinking*: almost everything the agent recommended is thrown away at the moment the campaign is saved.

Today only four things survive the hand-off: the campaign name, the theme line, the length (30 or 90 day) and the ticked asset boxes. These are dropped:

- the goal
- the audience
- the channels
- the asset breakdown and the "I've based this on…" grounding line
- the brief you originally typed, and anything added via "Add something"

So the posts, emails, landing page and lead magnet are written from the title and theme alone. They read like generic campaign output rather than the plan you just approved, and the campaign page shows no sign it came from the Briefing Room. That is the disconnect.

## What I'll change

**1. Carry the brief into the campaign**
Save the approved recommendation alongside the campaign: your original brief, goal, audience, channels, theme, asset breakdown and the grounding line.

**2. Write every asset from that brief**
The post writer, email writer, landing-page copy and lead magnet all read the saved goal, audience and channels instead of just the theme. Same writing rules, same voice — the output now matches what was promised on screen.

**3. Show the link on the campaign page**
A "Built by Haaylo" panel on the campaign Overview tab showing the brief, goal, audience and channels, with the grounding line and a route back to the Briefing Room to build another. Campaign cards on /campaign get a small marker so agent-built campaigns are recognisable.

**4. Tie it to the 90-day plan where it applies**
When the recommendation is 90-day and the plan has free weeks, set the covered weeks on the campaign so the plan page shows ownership — the same badge behaviour that already exists for manually created campaigns.

## What doesn't change

Nothing is removed or rebuilt. The New Campaign wizard, existing campaigns, all current screens, tiers and data stay exactly as they are. Existing campaigns without a brief simply show no panel and generate as they do now.

## Technical notes

- Additive migration: `campaigns.agent_brief jsonb null` — no existing column touched.
- `compileBrief` passes the full blueprint through to `runCreateCampaign`, which writes `agent_brief` alongside the current fields; the tool-registry input schema gains an optional `brief` object so the goal agent benefits too.
- `campaign-generate.functions.ts`: `CAMPAIGN_COLUMNS` gains `agent_brief`; a shared `briefContext(c)` helper renders goal/audience/channels into the existing system prompts for `genSocialPosts`, `genEmailSequence`, `genLandingPage` and `genLeadMagnet`. No new generation paths.
- Overview panel added to `campaign.$id.tsx` in the existing light palette; no new routes.
- Plan-week assignment reuses the existing `plan_week_start` / `plan_week_end` fields and the current week-range validation.
- Checks: typecheck, a build run from the Briefing Room through to the campaign page, and confirmation the generated copy references the stated goal and audience.

Refactor the campaign output presentation interface to adopt a premium, high-fidelity visual asset grid modeled after our reference design.

### 1. THE HORIZONTAL ASSET ROW (The Reference Architecture)

When a campaign is generated or selected, display the outputs in a single, beautifully spaced horizontal row layout containing four distinct, rounded content cards:

- **Card 1: [ EMAIL ]**

  - Crisp header tag: "✉ EMAIL" in small caps.

  - The generated subject line as the bold H3 title.

  - A subtle 3-line skeleton text fade representing the body copy frame.

  - A prominent, primary styled action button (e.g., "Start your trial" or campaign primary CTA).

- **Card 2: [ SOCIAL ]**

  - Crisp header tag: "🔗 SOCIAL" in small caps.

  - A clean round profile avatar placeholder showing the connected brand name.

  - The generated caption text hook block below the profile.

  - A bottom utility row displaying minimalist mock engagement metrics (e.g., heart icon with '24', comment speech bubble with '6').

- **Card 3: [ IMAGE ]**

  - Crisp header tag: "🖼 IMAGE" in small caps.

  - A full-bleed, aspect-ratio locked media container displaying the generated AI visual asset.

  - The primary campaign brand colors and text typography overlays must be rendered directly on top of the image layout block to showcase the visual theme.

- **Card 4: [ BLOG ]**

  - Crisp header tag: "📝 BLOG" in small caps.

  - A light tinted banner illustration placeholder.

  - A bold, punchy article title layout text line.

  - A bottom row tracking metadata: "5 MIN READ".

### 2. THE HORIZONTAL PROGRESSION & TIMELINE RAIL

- Position a sleek, horizontal linear progression timeline track directly beneath the four asset cards.

- Layout a connected chain of chronological status milestone tags separated by clean divider chevron pointers:

  `[ 🧭 SEND ]` ➔ `[ ✓ DRAFT ]` ➔ `[ ✓ READY ]` ➔ `[ ✓ APPROVED ]` ➔ `[ 🟢 SCHEDULED · TUE 9:02 AM ]`

- Ensure the active phase chip ("SCHEDULED") lights up in our primary branding tone with smooth ambient hover transitions.

### 3. THIRD-PARTY PLATFORM CONNECTIVITY HOOKS

- **Mailchimp Production Template Wrapper:** Within the Email workspace view, nest the generated newsletter string inside an optimized, responsive layout box that mirrors a clean Mailchimp layout. Include a "⚡ Sync & Schedule in Mailchimp" action button.

- **Gojiberry Inbound Listener:** Add an integrated webhook handler in our `landing_page_leads` data table routes. When an external intent event payload hits this endpoint from a connected Gojiberry account, log the contact immediately into the Haaylo Lead Tracker tagged with `source_platform: 'Gojiberry Intent Agent'`.

&nbsp;