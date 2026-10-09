# Roadmap

- [x] AI Marketing Agent tier: agent_settings/runs/learnings tables, weekly plan engine (Review mode), settings UI at /agent, Expert-tier gating, pg_cron Monday 08:00 sweep at /api/public/cron/agent-run.

- [x] Agent integrations (MCP): OAuth-protected MCP server exposing clients, Brain, posts.
- [ ] Publish nav: Social Calendar + Performance Analytics tabs (Social Calendar done; rename/confirm Analytics tab).
- [ ] Zernio scheduling: "Schedule" button on content cards posting caption, ISO datetime and media URLs to Zernio.
  - Blocked: needs a server-side secret (not a VITE_ variable) and Zernio's documented endpoint. Key pasted in chat must be rotated first.
- [x] Calendar post editor: lead-capture shortcut so a scheduled post triggers its automation on publish.
- [x] Home dashboard: "New leads today" tile with keyword, reply status and quick reply.
- [x] Lead nurture sequence: welcome DM, timed follow-up, then a lead handoff email to the owner.
- [x] Workspace isolation: one validated selected workspace, with strict plan and campaign reads and no default-workspace fallback.

## Agent-first platform (Round 1) — done
- [x] Stage 1 Tool Registry: central src/lib/tool-registry catalogue of 17 agent actions, workspace-scoped, risk/approval policies.
- [x] Stage 2 Approval workflow: Approvals tab under AI Agent; MEDIUM/HIGH tools gated, wording-locked, 24h, single-use.
- [x] Briefing Room at /home: Agent box, chips, staged loader, brand-DNA gap questions, blueprint, live build checklist.
- [x] Campaign workbench tabs + per-asset actions (regenerate, shorter, conversational, CTA, approve & schedule).
- [x] "+ New Campaign" de-emphasised; empty state leads with "Build with Haaylo".

## Light theme pass (Round 2) — done
- [x] Foundation: src/lib/theme.ts, light :root tokens, Poppins root link + body font, light Toaster.
- [x] Chrome: AppShell, WorkflowNav, ContextBar, MobileTabs, AccountMenu, ComingSoon.
- [x] Campaign workbench: campaign.$id, campaign.index, CampaignAssetPanels, CampaignSwitcher, CampaignEngineModal.
- [x] Older screens: all converted (scheduler, calendar, brain.setup, bank, landing.$id, account, snippets, funnel, welcome, hashtags, image, personas, caption-variator, plan, landing.index, repurpose, brand-assets, agent/*, competitors, ideas, tools, automations, analytics, admin.codes, trends, campaign-posts, projects, history) + shared components (GraphicStudio, brand-dna/fields, MagnetEngine, EbookPreview, WorkbenchTabs, LinkInjector, ChannelConnect, connect).
- [x] Verify: tsgo --noEmit passes; Playwright screenshots of all 24 screens confirmed light.

## Design studio → calendar (2 Sep)
- [x] Save Design studio export into the calendar post editor media so it schedules with the post
- [x] Images nav: remove "Soon", link to /image (studio + AI generator)
- [x] Analytics: recognise connected LinkedIn account
- [x] Template Library: upload own brand templates for Design studio

## Goal agent (Round 3) — final verification in progress
- [x] agent_goals + agent_goal_steps tables (RLS, grants, run trail).
- [x] Streaming /api/agent-goal route: registry tools, capped at 12 steps, workspace fixed server-side.
- [x] Goals tab under AI Agent: start a goal, live step trail, inline approve / turn down.
- [x] Stop pauses a run; paused or stopped goals can be picked back up with Continue.
- [ ] Finish Round 3: visible Goals/Approvals menu links, safe approval hand-off, Stop/Continue and browser verification.
- The previous AI-credit blocker was incorrect and has been withdrawn.


### Round 3 correction verification
- Goals and Approvals are now in the shared Agent navigation; Goals follows Home.
- Pending approvals pause goals; continuation reads saved outcomes; approval execution uses an atomic single-use claim.
- Opening history no longer automatically starts a run.
- 29 targeted tests passed. Full lint remains failing on repository-wide issues.
- Desktop/mobile browser interaction and published-site verification remain pending; no release was performed.

## Strategy organisation and Content Bank archive
- [x] Group the strategy by month and week, preserving editing and campaign links.
- [x] Add a derived 30-day archive with future scheduled posts kept active.
- [x] Verify date boundaries, grouping, workspace separation and browser layouts (60 tests passed; archive editing, remembered months and phone layouts checked).

## On-brand carousel system
- [x] Audit carousel generation against Haaylo's saved Brand DNA and assets.
- [x] Render exact carousel copy through a fixed, editable brand layout.
- [x] Rebuild and verify the existing eight-page Haaylo carousel (64 tests; Studio save/refresh and desktop/phone layouts checked).

## Prompt-to-tweak image editing
- [x] Add one shared plain-English image tweak control.
- [x] Wire posts, carousel slides, campaign images, landing pages and lead magnets.
- [x] Verify Brand DNA scoping and persistence; typecheck and all 64 automated tests pass.
