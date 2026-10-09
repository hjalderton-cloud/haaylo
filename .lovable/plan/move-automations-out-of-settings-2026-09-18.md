# Move Automations out of Settings

Agreed — these aren't settings. The page is **Lead automations**: someone comments your keyword, they get a reply and a DM, and you get the lead. That's lead capture, so it belongs with the rest of the lead tools.

## Change

In the sidebar, under **Campaigns**, the list becomes:

- All Campaigns
- Lead Capture
- Lead Automations  (moved here, renamed from "Automations")
- Landing Pages
- Lead Tracker

**Settings & Integrations** is then just Account & billing, Workspaces, Integrations.

## Notes

- Nothing moves on disk and no web address changes — `/automations` still works, and any existing link or bookmark lands in the same place. Only the menu position and label change.
- The breadcrumb at the top of the page will read "Campaigns › Lead Automations".

## Technical

Single edit to `src/components/HubTabs.tsx`: move the `{ label: "Automations", to: "/automations" }` entry from the `settings` hub's `tabs` into the `campaigns` hub, relabelled "Lead Automations". `hubForPath` picks the new hub up automatically. Verify with a typecheck and a phone/desktop pass over the sidebar.
