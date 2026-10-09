# Persona Builder

Replace the placeholder Persona Builder page under Strategy with a working screen that builds a buyer persona from the selected client's Brand DNA audience data, then lets you save, edit and reuse up to five personas.

## What you'll be able to do

- Press **Generate persona from my Strategy Profile** and get a full persona card back in about 20 seconds, with a loading message while it works.
- See the persona as a card: name, illustrated avatar, age range, job title and industry, three goals, three pain points, a short paragraph on the content they engage with, platform pills for where they spend time, and a first-person quote.
- **Regenerate** for a different angle on the same audience data, **Edit manually** to unlock every field, and **Save persona** to keep it.
- See your saved personas in a grid below (name, role, two pain points) with Edit and Delete on each, capped at five per client with a clear message when full.

## Data

New table `personas`: `id`, `user_id`, `project_id`, `persona_name`, `persona_data` (jsonb), `created_at`, `updated_at`, with row-level security so each account only sees its own, and access grants. Personas are scoped to the client you have selected in the sidebar, matching how the rest of the app works.

## Technical detail

- Migration `0017_create_personas.sql`: table above, `GRANT` for authenticated and service role, RLS policy on `auth.uid() = user_id`, index on `(user_id, project_id, created_at desc)`.
- `src/lib/personas.functions.ts` (authenticated server functions, same shape as `competitors.functions.ts`):
  - `generatePersona` — resolves the project id, loads `business_brains.data` with `brand_brain` fallback (audience, pain points, niche, offer, voice), plus existing plan pillars for context, and asks Lovable AI for strict JSON: `persona_name`, `age_range`, `role`, `industry`, `goals[3]`, `pain_points[3]`, `content_engagement`, `platforms[]`, `quote`. Prompt enforces UK English, the banned-word list and the understated house voice. Nothing is written to the database at this stage.
  - `savePersona` — inserts or updates; rejects a sixth persona per workspace with a friendly message.
  - `listPersonas`, `deletePersona`.
  - Gateway failures map to friendly messages (busy / out of credits / try again), no raw JSON shown.
- `src/routes/_authenticated/personas.tsx`: replaces `ComingSoon`. Uses `useActiveProject` so switching client reloads the saved list and clears the current draft. Card styling follows the Competitor Scan / Image Generator conventions (navy, pink accent, rounded cards, flex-wrap layouts so long text never breaks the card).
- Avatar: a generated illustrated avatar rendered in-app (inline SVG built from the persona's role and initials with the brand colours) rather than a photo or an image-generation call, so it is instant and free.
- Manual edit mode swaps the card into inputs/textareas for every field, including add/remove on goals, pain points and platforms, then saves through `savePersona`.

## Not included

No new navigation items, no change to campaign generation, and personas are not yet fed into content generation prompts — that would be a follow-up once personas exist.
