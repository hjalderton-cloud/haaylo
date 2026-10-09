# Fix the Lead Funnel: wrong workspace, blank brief, stuck PDF

Three separate faults, all confirmed by reading the code and the data.

## 1. The app quietly uses the wrong client

The client picker in the top bar shows a name on load, but it only *saves* your
choice when you actively change the dropdown. If you haven't switched clients in
that browser, nothing is saved, and every page falls back to whichever workspace
is marked as the default — which for this account is Haaylo. That is why the
nurture emails come out full of Haaylo material while the screen says Paymentsave.

Fix:
- Save the client shown in the picker as soon as it is resolved, and announce the
  change, so every screen and every generation call uses the same client.
- Stop the silent "use the default client" fallback on the funnel, magnet and
  email generation paths: if no client is supplied the request uses the one the
  picker resolved rather than the account default.
- Show the client name next to the Generate buttons on the funnel, so it is
  obvious what the copy will be built from before you press it.

Note: this account has two workspaces both named "Paymentsave", one of which has
no Strategy Profile filled in. The picker will show a short tag so they can be
told apart.

## 2. The brief doesn't fill itself in

The brief only fills from the Strategy Profile, only once per page load, and only
where a field is blank. After switching client or campaign it never refills, and
if that client's profile has no offer saved the offer stays empty.

Fix:
- Refill the brief whenever the client or the selected campaign changes.
- Fall back in order: the campaign's own theme, problem and offer, then the
  client's Strategy Profile, then the account brand notes.
- If nothing can be found, show a short prompt with a link to Brand DNA instead
  of leaving silent empty boxes.

## 3. "Export as Designed PDF" hangs

The export renders whatever is currently on screen and waits on remote images and
modern colour values that the PDF renderer cannot read, so it sits on
"Building PDF…" forever with no error.

Fix:
- Always export the guide layout (not the landing preview), from a dedicated
  print layout rendered off-screen at A4 width.
- Wait for images with a timeout, skipping any that fail, and convert colours to
  plain hex before rendering.
- Add a hard timeout with a clear message and a "print instead" fallback, and
  clear the button state on failure.

## Technical notes

- `src/components/WorkflowNav.tsx` — `ContextBar` persists the resolved project id
  to `ie-active-project` and dispatches `CLIENT_CHANGED_EVENT` on first resolve;
  duplicate project names get a disambiguating suffix.
- `src/lib/funnel.functions.ts`, `src/lib/magnet.functions.ts` — keep
  `resolveProjectId` but stamp and return the resolved project so the client can
  display it; funnel rows and email output stay scoped by `project_id`.
- `src/lib/magnet.functions.ts` `getMagnetPrefill` — accept `campaignId` and layer
  campaign theme/problem/offer over the brain values; return a `source` flag.
- `src/components/magnet/MagnetEngine.tsx` — refill on `activeProjectId`/
  `campaignId` change; separate always-mounted export node for the ebook;
  `exportPdf` gains image preloading, colour sanitising, `catch`, and a timeout.
- No schema changes.
