# One Combined Build: Navigation, Scheduler & Content Lifecycle

Everything from both audits, built in one sequence. Nothing here has been implemented yet — the last completed work was the launch-readiness/security sweep.

## 1. Navigation that actually works

- Every Engine module writes its own URL (`/engine#m=<module>`), mirrored into the browser address bar by the parent route, so modules are bookmarkable and survive refresh.
- Browser Back and Forward move between modules via `hashchange`/`popstate` instead of ejecting you from the Engine.
- The in-app "← Back" becomes a real history back (falls back to Home) instead of walking down a hard-coded list.
- Per-module scroll positions are remembered and restored on back-navigation; the force-scroll-to-top hack is removed.

## 2. One sidebar, one product

The outer app owns the only menu, grouped by workflow, replacing both the flat 6-item outer menu and the Engine's 10-item inner sidebar:

```text
SET UP      Business Brain · Clients
RESEARCH    Competitor Radar · SEO & Keywords · Brainstorm
STRATEGY    Brand Voice · 90-Day Plan
CREATE      Posts & Captions · Lead Funnels
PUBLISH     Planner · Content Bank · History
MEASURE     Analytics (Coming soon)
```

- Groups collapse/expand, remember their state, and auto-expand around the active item.
- The Engine iframe becomes a pure content pane — its sidebar and bottom nav are removed.
- A persistent context bar sits above the content: client/workspace picker, breadcrumb (`Strategy › 90-Day Plan`), and Brain health. Per-module workspace pickers are removed so the client is chosen once.
- Engine and Brain get the same visual shell, so the seam disappears.

## 3. One content lifecycle (database-backed)

Today the 90-day plan, written posts, Content Bank and scheduler each keep their own browser-only store, so nothing follows you across devices and the same post exists in three unrelated states.

- New `content_posts` table holding one record per generated post: caption, pillar, platform, status, scheduled time, media, links back to the plan slot and the client.
- Status chain: **Draft → Approved → Scheduled → Published**, shown as the same badge everywhere.
- Plan, Content Bank and Calendar become three views of the same list, all using the shared content card.
- One-time import of existing browser-stored posts on first load so nothing is lost.
- Fixes the orphaned "write this post" hand-off: the draft spec becomes a real Draft record immediately, so closing the tab no longer loses it.

## 4. Scheduler: honest two-mode publishing

- **Auto mode (LinkedIn)** — unchanged. It genuinely works: live connections, and the every-minute publish worker is healthy.
- **Manual mode (Instagram / Facebook / TikTok / other)** — the calendar still plans the slot, but marks it "Post manually" and gives everything needed on a phone: one-tap copy caption + hashtags, image download, and a per-post `.ics` reminder.
- Monthly calendar becomes the default view, colour-coded by pillar to match the 90-day plan, each cell showing pillar dot, platform icon, time and truncated caption.
- Pillar and platform filters across the top, plus a month/quarter toggle so all 90 days can be seen at once.
- Export the month as CSV (date, time, platform, pillar, caption, hashtags), ICS, and a printable PDF calendar.

## 5. Meta connect: stop the dead end

- Connecting from the preview domain currently sends Meta an unrecognised redirect URI. The app will detect a non-live origin and explain that connecting must happen on the live site, instead of dumping the user into a Meta error page.
- Raw error codes replaced with plain English ("Meta needs the app approved — use Manual mode for now").
- Missing Meta app configuration fails with a readable message rather than a malformed sign-in link.
- Fix the misleading Instagram token expiry copied from the user token.
- Instagram/Facebook are presented as "Manual for now — auto-posting coming once Meta approves the app", with a small "Try connecting Meta" link shown only on the live domain.

## 6. Analytics: greyed out and honest

- Analytics is locked to a non-interactive "Coming soon" state with a short note that daily social analytics sync is on the way.
- The connect-account affordance stays visible so accounts can be linked now, but no metrics dashboard is shown until daily scheduled sync and LinkedIn analytics permissions are in place.

## 7. Mobile

- The 10-item bottom bar drops to 4 tabs: Home, Create, Plan, More. "More" opens the grouped menu as a sheet.
- The whole grouped sidebar and context bar are usable on small screens.

## Build order

1. Navigation fixes (self-contained, no visual change)
2. Grouped sidebar + context bar, retiring the inner Engine menu
3. `content_posts` table + lifecycle unification across Plan / Bank / Calendar
4. Scheduler manual mode, pillar calendar, CSV/ICS/PDF export
5. Meta connect messaging + Analytics coming-soon lock
6. Mobile nav restructure

## Technical notes

- Steps 1–2 touch `public/engine/index.html` (page state, hash sync, `goBack`, nav removal), `src/routes/engine.tsx` (hash mirroring, iframe messaging), `src/components/AppShell.tsx` (grouped nav + context bar). Cross-frame navigation keeps using the existing `engine:nav` / `engine:navigate` postMessage channel.
- Step 3 needs one migration: `content_posts` with RLS scoped to the owner plus the required grants, and an accessor that replaces the `ie-written-posts`, strategy-plan, bank and scheduler stores.
- Steps 4–5 touch `src/routes/scheduler.tsx`, `src/lib/scheduler.functions.ts` (redirect-base guard, error mapping), and `src/routes/api/public/oauth/callback.ts` (error mapping, IG token expiry).
- No change to the cron publisher — it is healthy and stays as-is.
- Only step 3 has a database change; the rest is frontend and server-function work.
