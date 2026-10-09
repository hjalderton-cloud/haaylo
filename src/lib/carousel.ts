/**
 * Slide parsing for carousel posts.
 * Recognises "Slide 1 — ...", "Page 2: ...", and "1. ..." style scripts.
 */

export type ParsedSlide = { heading: string; body: string };

const MARKER = /^\s*(?:slide|page|card)\s*#?\s*(\d{1,2})\s*[—\-–:.)]*\s*(.*)$/i;
const NUMBERED = /^\s*(\d{1,2})\s*[.)]\s+(.*)$/;

export function parseSlides(text: string): ParsedSlide[] {
  const lines = (text ?? "").split(/\r?\n/);
  const slides: ParsedSlide[] = [];
  let current: ParsedSlide | null = null;
  let sawMarker = false;

  for (const line of lines) {
    const m = MARKER.exec(line);
    const n = m ? null : NUMBERED.exec(line);
    const hit = m ?? n;
    if (hit) {
      sawMarker = sawMarker || Boolean(m);
      if (current) slides.push(current);
      current = { heading: (hit[2] ?? "").trim(), body: "" };
      continue;
    }
    if (current) {
      const t = line.trim();
      if (!t) continue;
      current.body = current.body ? `${current.body}\n${t}` : t;
    }
  }
  if (current) slides.push(current);

  // A plain numbered list only counts when it reads like slides (3+ entries).
  if (!sawMarker && slides.length < 3) return [];
  if (slides.length < 2) return [];

  return slides
    .map((s, i) => ({
      heading: s.heading || `Slide ${i + 1}`,
      body: s.body.trim(),
    }))
    .slice(0, 10);
}

export function hasSlides(text: string): boolean {
  return parseSlides(text).length >= 2;
}
