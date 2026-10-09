# Zernio profiles per user + Connect your accounts

## The flow

1. **Sign-up** — when someone creates a Haaylo account and first lands in the app, the server quietly asks Zernio to create a profile for them and saves the returned profile id against their account. It runs once; if it fails, it retries the next time they open the Connect screen, so nobody is blocked from signing up.
2. **Connect your accounts screen** — a new page listing Instagram, Facebook, LinkedIn, YouTube and TikTok. Each row shows either "Not connected" with a Connect button, or the connected account name with a Disconnect option.
3. **Connect** — pressing Connect asks our server for a Zernio OAuth link tied to that person's own profile id, then sends them to the platform's login. Nothing sensitive touches the browser.
4. **Return** — the platform sends them back to a Haaylo return page, which refreshes the list from Zernio so the newly linked account appears straight away.
5. **Posting and analytics** — scheduling and stats calls already made on the server now send the person's own profile id, so each account posts and reports separately.

## Key rule

Your Zernio key stays a server-side secret. Every call to Zernio happens on our server; the browser only ever sees profile-free results (connection names, statuses, links).

```text
sign-up ──> server: create Zernio profile ──> save profile_id on user
Connect page ──> server: request OAuth URL (profile_id) ──> platform login
platform ──> Haaylo return page ──> server: refresh connections ──> list updates
```

## Technical detail

- Migration: add `zernio_profile_id text` (nullable, unique) to `public.profiles`; no new grants needed beyond existing ones.
- `src/lib/zernio.functions.ts` gains authenticated server functions:
  - `ensureZernioProfile` — reads/creates the profile via `POST /profiles`, upserts the id, idempotent.
  - `listZernioConnections` — `GET /profiles/:id/accounts`, returns a normalised list.
  - `startZernioConnect({ platform })` — `POST /profiles/:id/connect` (or documented equivalent) with our redirect URL, returns the auth URL for a client-side `window.location` redirect.
  - `disconnectZernioAccount({ accountId })`.
- Existing `scheduleWithZernio` and `getZernioMetrics` gain the caller's `profile_id` in their payload/query.
- New route `src/routes/_authenticated/connect.tsx` — the Connect screen, plus a return handler at `src/routes/_authenticated/connect.callback.tsx` that calls `listZernioConnections` and navigates back.
- `ensureZernioProfile` is called from the authenticated layout on first load (no protected calls in public loaders).
- Secret used: existing `ZERNIO_API_KEY`, read inside handlers only.

## Assumption to confirm

Zernio's exact endpoint paths for profile creation and OAuth connect are taken from their v1 REST shape; if their docs name them differently I'll adjust the paths only — the flow stays the same.
