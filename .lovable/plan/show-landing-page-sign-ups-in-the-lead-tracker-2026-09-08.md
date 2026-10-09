# Show landing page sign-ups in the Lead Tracker

Your lead did save. I found it in the database: `hjalderton@gmail.com`, captured at 15:37 today from your published page.

The problem is where it landed. There are currently two separate lead lists in the app:

- **Landing page sign-ups** (the contact box on your published page) — saved, but only visible as a count on the Landing Pages screen and inside the funnel.
- **Social comment leads** (people commenting on posts, picked up by the automations) — this is the only thing the Lead Tracker screen shows today.

So the Lead Tracker was never looking at landing page sign-ups at all.

## What I'll change

Make the Lead Tracker the single place all leads show up.

- Add a source filter at the top: **All / Landing pages / Social comments**, defaulting to All.
- Landing page sign-ups appear in the same list with: name, email, company, phone, which page and campaign they came from, when they signed up, and whether they reached your email list.
- Sort everything newest first, and scope it to the client currently selected in the picker, so Paymentsave leads don't appear under Haaylo.
- Each landing page lead links through to the page it came from.
- Add a **Download CSV** button so you can pull the list out.
- Keep the existing social comment rows and their reply/retry actions exactly as they are.
- Update the counts at the top of the screen so they cover both kinds of lead.

## Technical notes

- New authenticated server function in `src/lib/leads.functions.ts` reading `landing_page_leads` joined to `landing_pages`, filtered by `user_id` and the active `project_id` (keeping legacy rows with no project, as the dashboard already does).
- `src/routes/_authenticated/leads.tsx` merges the two sources into one typed list with a `source` discriminator; existing `Capture` handling stays untouched.
- No schema changes and no changes to how leads are captured or synced to Mailchimp.
