# Organise the main menu into expandable hubs

## What will change

The main menu will have five permanent top-level sections:

1. Home
2. Campaigns
3. Content
4. Business Brain
5. Settings & Integrations

Each section will be a tidy dropdown box. Selecting its heading opens or closes the section, while its first item remains a normal link. The section containing the current page opens automatically and stays visibly highlighted.

## Dropdown contents

### Home
- Briefing Room
- AI Agent
- Goals
- Approvals
- Post Queue
- Agent Calendar
- Agent Analytics
- Agent Settings
- Campaign, content and lead insights

### Campaigns
- All Campaigns
- Lead Capture
- Landing Pages
- Lead Tracker
- Pop-up Snippets
- Lead Magnets

An open campaign keeps its existing three working tabs and asset gallery.

### Content
- Content Bank
- Content Hub
- Idea Generator
- Repurposing Suite
- Brainstorm
- Schedule & Publish
- Caption Variator
- Hashtags
- Trends
- Content History

The image generator remains inside the post editor rather than becoming a separate main-menu item.

### Business Brain
- Brand DNA
- Brand Assets
- Persona Builder
- 90-day Strategy Plan
- Competitor Radar

### Settings & Integrations
- Account & Billing
- Workspaces
- Integrations
- Automations

## Presentation

- Replace the loose page-level pill rows with the organised dropdown navigation, avoiding two competing menus.
- Use compact chevrons, clear active states and restrained spacing within the existing light Haaylo design.
- Keep the desktop sidebar fixed and scrollable when a dropdown contains many tools.
- On phones, the fixed five-item menu remains visible; tapping a section opens its matching organised tool list in the menu drawer.
- Opening one section closes the others by default, reducing clutter while keeping every tool reachable.

## Technical notes

- Keep the current routes, screens, data and permissions unchanged.
- Extend the existing shared hub map so the desktop sidebar, phone menu, breadcrumbs and active states all use one source of truth.
- Remove Content Bank as a one-page hub and replace it with the complete Content hub.
- Preserve direct links and old bookmarks; this is navigation and presentation work only.

## Checks

- Verify every listed destination opens the correct existing screen.
- Check active highlighting and automatic dropdown opening on every hub.
- Check the Briefing Room, AI Agent, Campaigns and Content Bank at desktop and phone widths.
- Confirm there is no sideways scrolling and that the phone menu stays visible.
- Run the full typecheck and relevant navigation tests.
