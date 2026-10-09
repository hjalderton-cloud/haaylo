# Wire "Generate Page & Asset" to the built-in AI, fed by your Strategy Profile

The Lead Magnet Engine already generates with Lovable's built-in AI (no external key, no OpenAI billing). What it doesn't yet do is pull your saved Strategy Profile automatically — you retype the goal, audience and offer each time — and its picture prompts are short, so covers come back generic.

This plan keeps the built-in AI and closes those three gaps so you can test the full visual flow now.

## 1. Prefill the brief from your Strategy Profile

When the Lead Magnet page opens, it reads your saved profile (business, brand, audience, offer sections) and fills in:

- Main goal — from your business goals
- Target audience — from your ideal customer and pain points
- Main offer — from your live offer or products and services
- Tone — from your tone of voice
- Visual style — from your brand's saved style notes, if any

Each field stays editable, with a small line saying it came from your Strategy Profile and a "reset to profile" link. If a section is blank, the field stays empty as it is today.

## 2. Better picture prompts

The AI writing pass will be asked for richer, camera-style image briefs (subject, setting, lighting, composition, mood, colour direction) rather than a one-line description, and will be told to keep every image free of text and logos. Those briefs feed straight into the image generation calls, so hero, cover and the three feature graphics all come back on-brand instead of stock-looking.

## 3. Brand colours on the covers

All three cover styles (Minimalist, Bold, Tech) will read your saved brand colours and apply them to the cover background, accent rules, title colour and the page furniture in the guide — with automatic light/dark text so titles stay readable on any colour. Change a colour on your Account page and the preview restyles instantly, no regeneration.

## 4. Button and feedback

- The generate button is labelled "Generate Page & Assets" and the follow-up run reads "Regenerate".
- Progress messages match what's actually happening (reading profile, writing copy, painting hero, framing cover).
- If credits run out or the service is busy, you get a plain message saying which, not a silent failure.

## Technical notes

- `src/lib/magnet.functions.ts`: extend the prompt to request structured `image_prompt` objects; append brand hex codes and style to every image call; keep `google/gemini-2.5-flash` for copy and `google/gemini-2.5-flash-image` for imagery via the Lovable AI Gateway (no OpenAI/DALL-E key involved).
- New server fn (or extend `getBrandBrain` read) to return the Strategy Profile fields needed for prefill; map them into `StrategyProfileInput` on mount in `src/routes/_authenticated/magnet.tsx`.
- `src/components/magnet/EbookPreview.tsx` and `LandingPreview.tsx`: drive the three cover templates from `config.brand.primary_color` / `secondary_color` using existing `withAlpha` / `readableOn` helpers.
- No schema changes, no new tables, no API-call changes to Mailchimp or the funnel.
