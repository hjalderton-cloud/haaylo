import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { voiceAndCtaPrompt } from "@/lib/brand-voice";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getBrain } from "@/lib/brain.functions";
import { saveToBank } from "@/lib/bank.functions";
import { createMembershipCheckout } from "@/lib/billing.functions";
import { stageForDate, MEMBERSHIP_FEATURES } from "@/lib/pricing";
import { supabase } from "@/integrations/supabase/client";
import type { BrainData } from "@/lib/brain-schema";
import { generateFirstPostIdeas, type FirstPostIdea } from "@/lib/first-post-ideas.functions";
import wordmark from "@/assets/haaylo-logo-2026.png.asset.json";
import { BG, SURFACE, NAVY as THEME_NAVY, INDIGO, PINK as THEME_PINK, GREY, LINE, TINT, font } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/first-post")({
  head: () => ({
    meta: [
      { title: "Write your first post — Haaylo" },
      { name: "description", content: "Turn your Strategy Profile into your first on-brand social post in one click." },
      { property: "og:title", content: "Write your first post — Haaylo" },
      { property: "og:description", content: "Turn your Strategy Profile into your first on-brand social post in one click." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FirstPostPage,
});

const NAVY = THEME_NAVY;
const PINK = THEME_PINK;

type Fmt = { id: string; label: string; format: string; rule: string };

const FORMATS: Fmt[] = [
  {
    id: "instagram",
    label: "Instagram caption",
    format: "Instagram caption",
    rule:
      "Instagram caption. STRICT maximum 70 words in the caption body (hashtags excluded). Hook on the first line, line breaks between thoughts, warm visual language, CTA on its own line, then 8–12 relevant hashtags on the final lines.",
  },
  {
    id: "tiktok",
    label: "TikTok / Reel script",
    format: "short-form video script for TikTok or Instagram Reels",
    rule:
      "Short-form video script (30–45 seconds spoken, 90–130 words). Structure it as: HOOK (0–3s), then 3–4 beats labelled with rough timings, then CTA. Write the spoken words in full plus a bracketed on-screen text line for each beat. Finish with a suggested caption of one line and 5 hashtags.",
  },
  {
    id: "linkedin",
    label: "LinkedIn post",
    format: "LinkedIn thought leadership post",
    rule:
      "LinkedIn thought leadership post. STRICT target 120 words (hard range 110–130). Line 1 = a sharp, opinionated hook. Then 2–4 short paragraphs of 1–2 sentences each, separated by blank lines. Close with one line inviting a reply, then 2–3 relevant hashtags on the final line.",
  },
  {
    id: "blog",
    label: "Blog post",
    format: "SEO blog post",
    rule:
      "SEO blog article of 500–700 words. Start with an H1 title, then a 2-sentence intro, then 3–5 H2 sections with short paragraphs and one bulleted list. Finish with a short conclusion and the call to action. Use plain markdown headings.",
  },
  {
    id: "facebook",
    label: "Facebook post",
    format: "Facebook Business Page post",
    rule:
      "Facebook Business Page post. STRICT maximum 70 words. Friendly community tone, one emoji in the opening line, short paragraphs, end with a question to drive comments. No hashtags.",
  },
  {
    id: "email",
    label: "Email to your list",
    format: "marketing email",
    rule:
      "Marketing email of 150–200 words. Give a subject line, a preview line, then the body in short paragraphs, then a single clear call to action on its own line. No hashtags, no emoji spam.",
  },
];

type Pillar = { key: "education" | "inspiration" | "entertainment"; label: string; emoji: string; blurb: string; colour: string };

const PILLARS: Pillar[] = [
  { key: "education", label: "Education", emoji: "📘", blurb: "Teach them something they can use today.", colour: "#60A5FA" },
  { key: "inspiration", label: "Inspiration", emoji: "✨", blurb: "Show what's possible and why it matters.", colour: "#FBBF24" },
  { key: "entertainment", label: "Entertainment", emoji: "🎬", blurb: "Light, human, share-worthy.", colour: "#E54683" },
];

function pickFormat(brain: BrainData): string {
  const pref = String(
    (brain as Record<string, Record<string, string | undefined>>)?.content?.preferred_platforms ?? "",
  ).toLowerCase();
  if (pref.includes("instagram")) return "instagram";
  if (pref.includes("facebook")) return "facebook";
  if (pref.includes("tiktok")) return "tiktok";
  if (pref.includes("blog")) return "blog";
  return "linkedin";
}

const SUPABASE_URL = import.meta.env["VITE_SUPABASE_URL"] as string;
const SUPABASE_KEY = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string;

function FirstPostPage() {
  const navigate = useNavigate();
  const brainFn = useServerFn(getBrain);
  const ideasFn = useServerFn(generateFirstPostIdeas);
  const bankFn = useServerFn(saveToBank);
  const checkoutFn = useServerFn(createMembershipCheckout);

  const [ideas, setIdeas] = useState<FirstPostIdea[]>([]);
  const [ideasBusy, setIdeasBusy] = useState(true);
  const [projectId, setProjectId] = useState("");
  const [topic, setTopic] = useState("");
  const [fmtId, setFmtId] = useState("linkedin");
  const [offer, setOffer] = useState("");
  const [voiceAndCta, setVoiceAndCta] = useState("");
  const [useOffer, setUseOffer] = useState(false);
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showFoundingOffer, setShowFoundingOffer] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const outRef = useRef<HTMLDivElement | null>(null);
  const draftKeyRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          const activeProject = window.localStorage.getItem("ie-active-project") ?? "default";
          const draftKey = `haaylo:first-post:${data.user.id}:${activeProject}`;
          draftKeyRef.current = draftKey;
          const savedDraft = window.sessionStorage.getItem(draftKey);
          if (savedDraft) {
            const parsed = JSON.parse(savedDraft) as { out?: string; topic?: string; fmtId?: string };
            if (typeof parsed.out === "string") setOut(parsed.out);
            if (typeof parsed.topic === "string") setTopic(parsed.topic);
            if (FORMATS.some((item) => item.id === parsed.fmtId)) setFmtId(parsed.fmtId ?? "linkedin");
          }
        }
      } catch { /* a missing draft must never hide the generated result flow */ }
      try {
        const storedProject = typeof window !== "undefined" ? window.localStorage.getItem("ie-active-project") : null;
        const b = await brainFn({ data: storedProject ? { projectId: storedProject } : {} });
        if (cancelled) return;
        setProjectId(b.projectId);
        setFmtId(pickFormat(b.data));
        setVoiceAndCta(voiceAndCtaPrompt(b.data));
        if (b.projectId) {
          const generated = await ideasFn({ data: { projectId: b.projectId } });
          if (!cancelled) setIdeas(generated.ideas);
        }
        const existing = String(
          (b.data as Record<string, Record<string, string | undefined>>)?.ctas?.current_offer ?? "",
        ).trim();
        if (existing) { setOffer(existing); setUseOffer(true); }
      } catch {
        if (!cancelled) toast.error("We couldn't prepare your topic ideas. Please refresh and try again.");
      } finally {
        if (!cancelled) setIdeasBusy(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fmt = FORMATS.find((f) => f.id === fmtId) ?? FORMATS[0]!;

  const generate = async () => {
    if (!topic.trim() || busy) return;
    setBusy(true);
    setSaved(false);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Please sign in again.");

      const system =
        "You are an expert UK content writer writing natively for one specific business. " +
        "GROUND TRUTH: every concrete detail (services, prices, guarantees, proof, CTAs) must come from the BUSINESS BRAIN context. " +
        "Never invent testimonials, statistics, offers or customer stories. Sound human, never like marketing copy. " +
        "BANNED CONSTRUCTIONS — ZERO TOLERANCE: never use antithesis / negation-then-affirmation phrasing in any form " +
        "(\"it's not X, it's Y\", \"isn't just a number, it is the oxygen\", \"not a luxury, a necessity\", \"less about A, more about B\", " +
        "\"we don't do A, we do B\", \"not only A but also B\"). Before returning, scan for \"not/isn't/aren't/doesn't/don't\" followed within " +
        "~15 words by \"it's/it is/but/;/,/—\" and rewrite every match as a plain positive statement. " +
        "Output only the finished post — no preamble, no headings, no explanation.";
      const offerText = useOffer && offer.trim() ? offer.trim() : "";
      const user = `Write a complete ${fmt.format}.

Topic: ${topic.trim()}
${offerText ? `\nCURRENT LIVE OFFER (mention this naturally near the close, exactly as stated — do not embellish, discount further or invent terms):\n${offerText}\n` : "\nThere is no live offer. Do NOT mention or invent any promotion, discount or freebie.\n"}


PLATFORM RULES (follow exactly):
${fmt.rule}

Requirements:
- Strong hook on the first line (no "I" opener, no "Are you…", no truisms)
- Teach something genuinely useful
- Use the primary CTA from the Strategy Profile; if none exists, end with a plain invitation to get in touch
- Do not open with generic brand credentials (years trading, family-run, staff count)

${voiceAndCta}`;

      const res = await fetch(`${SUPABASE_URL}/functions/v1/engine-ai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${token}`,
          ...(projectId ? { "x-project-id": projectId } : {}),
          "x-module": "content",
           "x-onboarding-first-post": "1",
        },
        body: JSON.stringify({ system, user }),
      });

      if (!res.ok || !res.body) {
        let msg = `Generation failed (${res.status})`;
        try {
          const payload = (await res.json()) as { error?: string };
          if (payload?.error) msg = payload.error;
        } catch { /* ignore */ }
        throw new Error(msg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              text += delta;
              setOut(text);
            }
          } catch { /* partial chunk */ }
        }
      }
      if (!text.trim()) throw new Error("The AI returned nothing — please try again.");
      const draftKey = draftKeyRef.current;
      if (draftKey) {
        window.sessionStorage.setItem(draftKey, JSON.stringify({ out: text, topic: topic.trim(), fmtId }));
      }
      setTimeout(() => outRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(out);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const save = async () => {
    if (!projectId) { toast.error("No workspace found"); return; }
    try {
      await bankFn({ data: { projectId, kind: "post", title: topic.slice(0, 120), body: out, tags: [fmt.id] } });
      setSaved(true);
      toast.success("Saved to your Content Bank");
      setShowFoundingOffer(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const startCheckout = async () => {
    setCheckoutBusy(true);
    try {
      const result = await checkoutFn({ data: { origin: window.location.origin } });
      if (!result.url) throw new Error(result.error || "Could not start checkout");
      window.location.assign(result.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Checkout failed");
      setCheckoutBusy(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: BG,
        color: NAVY,
        fontFamily: font,
        padding: "26px 18px 70px",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <img src={wordmark.url} alt="Haaylo" style={{ height: 38, display: "block", margin: "0 auto 22px" }} />

        <h1 style={{ fontFamily: font, fontSize: 26, lineHeight: 1.2, textAlign: "center", margin: "0 0 8px" }}>
          Your content pillars, built from your Brain
        </h1>
        <p style={{ textAlign: "center", color: GREY, fontSize: 14, margin: "0 0 22px", lineHeight: 1.55 }}>
          Here&rsquo;s what Haaylo would post for you across Education, Inspiration and Entertainment — each idea
          with the format that suits it. Pick <strong style={{ color: NAVY }}>one</strong> and we&rsquo;ll write it
          in full. That&rsquo;s your free generation.
        </p>

        <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
          {ideasBusy && <section style={card}>Creating high-quality topics from your Brain…</section>}
          {PILLARS.map((p) => {
            const list = ideas.filter((i) => i.pillar === p.key);
            if (!list.length) return null;
            return (
              <section key={p.key} style={{ ...card, borderColor: `${p.colour}44` }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 15 }}>{p.emoji}</span>
                  <span style={{ fontFamily: font, fontSize: 14, color: p.colour, letterSpacing: ".04em", textTransform: "uppercase" }}>
                    {p.label}
                  </span>
                </div>
                <p style={{ color: GREY, fontSize: 12.5, margin: "0 0 12px" }}>{p.blurb}</p>
                <div style={{ display: "grid", gap: 8 }}>
                  {list.map((idea) => {
                    const active = topic === idea.topic;
                    const ideaFmt = FORMATS.find((f) => f.id === idea.formatId);
                    return (
                      <button
                        key={idea.topic}
                        type="button"
                        onClick={() => { setTopic(idea.topic); setFmtId(idea.formatId); }}
                        style={{
                          textAlign: "left",
                          padding: "11px 13px",
                          borderRadius: 12,
                          fontSize: 14,
                          lineHeight: 1.35,
                          cursor: "pointer",
                          color: active ? "#FFFFFF" : INDIGO,
                          background: active ? PINK : SURFACE,
                          border: `1px solid ${active ? PINK : LINE}`,
                        }}
                      >
                        <div>{idea.topic}</div>
                        <div style={{ marginTop: 6, fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: active ? "#FFFFFF" : GREY }}>
                          {ideaFmt?.label ?? "Post"}{active ? " · we'll write this one" : ""}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <section style={card}>


          <label style={lbl}>Or write your own</label>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={2}
            placeholder="e.g. Why blackout blinds beat curtains in a south-facing bedroom"
            style={{
              width: "100%",
              resize: "vertical",
              borderRadius: 12,
              padding: "11px 13px",
              fontSize: 14,
              fontFamily: font,
              color: NAVY,
              background: "#FFFFFF",
              border: `1px solid ${LINE}`,
              marginBottom: 16,
            }}
          />

          <label style={lbl}>Current offer (optional)</label>
          <div
            style={{
              borderRadius: 12,
              border: `1px solid ${useOffer ? PINK : LINE}`,
              background: useOffer ? TINT.pink : SURFACE,
              padding: 12,
              marginBottom: 16,
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, cursor: "pointer", color: INDIGO }}>
              <input
                type="checkbox"
                checked={useOffer}
                onChange={(e) => setUseOffer(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: PINK }}
              />
              Include a live offer in this post
            </label>
            {useOffer && (
              <textarea
                value={offer}
                onChange={(e) => setOffer(e.target.value)}
                rows={2}
                placeholder="e.g. 20% off all shutters until 31 March — free measure & fit over £1,500"
                style={{
                  width: "100%",
                  marginTop: 10,
                  resize: "vertical",
                  borderRadius: 10,
                  padding: "10px 12px",
                  fontSize: 14,
                  fontFamily: font,
                  color: NAVY,
                  background: "#FFFFFF",
                  border: `1px solid ${LINE}`,
                }}
              />
            )}
            <p style={{ margin: "8px 0 0", fontSize: 12, color: GREY }}>
              Leave this off and the post will never mention a promotion.
            </p>
          </div>

          <label style={lbl}>Where is it going?</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
            {FORMATS.map((f) => {
              const active = f.id === fmtId;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFmtId(f.id)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 999,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    color: active ? "#FFFFFF" : INDIGO,
                    background: active ? PINK : SURFACE,
                    border: `1px solid ${active ? PINK : LINE}`,
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={generate}
            disabled={busy || !topic.trim()}
            style={{
              width: "100%",
              padding: "14px 18px",
              borderRadius: 999,
              border: "none",
              cursor: busy || !topic.trim() ? "default" : "pointer",
              opacity: busy || !topic.trim() ? 0.55 : 1,
              background: PINK,
              color: "#FFFFFF",
              fontWeight: 800,
              fontSize: 15,
              letterSpacing: ".02em",
            }}
          >
            {busy ? "Writing your post…" : "✦ Write my post"}
          </button>
        </section>

        {(out || busy) && (
          <section ref={outRef} style={{ ...card, marginTop: 16 }}>
            <div style={{ ...lbl, marginBottom: 10 }}>Your post</div>
            <div style={{ whiteSpace: "pre-wrap", fontSize: 15, lineHeight: 1.55, color: NAVY }}>
              {out || "…"}
            </div>
            {out && !busy && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
                <button type="button" onClick={copy} style={ghostBtn}>Copy</button>
                <button type="button" onClick={save} style={ghostBtn} disabled={saved}>
                  {saved ? "Saved ✓" : "Save to Content Bank"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowFoundingOffer(true)}
                  style={{ ...ghostBtn, background: PINK, color: "#FFFFFF", border: `1px solid ${PINK}`, fontWeight: 800 }}
                >
                  Go to Haaylo →
                </button>
              </div>
            )}
          </section>
        )}

        {!out && <div style={{ textAlign: "center", marginTop: 18 }}>
          <button
            type="button"
            onClick={() => navigate({ to: "/" })}
            style={{ background: "none", border: "none", color: GREY, fontSize: 13, cursor: "pointer", textDecoration: "underline" }}
          >
            Skip for now
          </button>
        </div>}
      </div>

      {showFoundingOffer && (
        <FoundingOffer
          busy={checkoutBusy}
          onCheckout={() => void startCheckout()}
        />
      )}
    </div>
  );
}

function FoundingOffer({ busy, onCheckout }: { busy: boolean; onCheckout: () => void }) {
  const stage = stageForDate();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="founding-offer-title"
      style={{
        position: "fixed", inset: 0, zIndex: 100, display: "grid", placeItems: "center",
        padding: 18, background: "rgba(20,20,40,0.4)", backdropFilter: "blur(10px)",
      }}
    >
      <section style={{ ...card, width: "min(100%, 520px)", padding: 24, background: "#FFFFFF", boxShadow: "0 28px 90px rgba(0,0,0,.2)" }}>
        <div style={{ color: PINK, fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 8 }}>
          Your free posts are ready
        </div>
        <h2 id="founding-offer-title" style={{ fontFamily: font, fontSize: 27, lineHeight: 1.15, margin: "0 0 9px" }}>
          Keep everything you created
        </h2>
        <p style={{ color: GREY, fontSize: 14, lineHeight: 1.5, margin: "0 0 17px" }}>
          Join Haaylo to access your Content Bank, strategy, planner and the full Engine.
        </p>
        <div style={{ border: `2px solid ${PINK}`, background: TINT.pink, borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ color: PINK, fontWeight: 900, fontSize: 13 }}>{stage.title}</div>
          <div style={{ fontFamily: font, fontSize: 32, marginTop: 5, color: NAVY }}>{stage.amount}</div>
          <div style={{ color: TINT.pinkInk, fontSize: 12, fontWeight: 700 }}>{stage.disclosure}</div>
          <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", color: INDIGO, fontSize: 12.5, lineHeight: 1.65 }}>
            {MEMBERSHIP_FEATURES.slice(0, 5).map((feature) => <li key={feature}>✓ {feature}</li>)}
          </ul>
        </div>
        <button type="button" onClick={onCheckout} disabled={busy} style={{ ...ghostBtn, width: "100%", padding: "14px 18px", background: PINK, color: "#FFFFFF", borderColor: PINK, opacity: busy ? .6 : 1 }}>
          {busy ? "Opening checkout…" : `${stage.cta} →`}
        </button>
        <a href="/" style={{ display: "block", textAlign: "center", color: GREY, fontSize: 13, marginTop: 15 }}>
          Back to home
        </a>
      </section>
    </div>
  );
}

const card: React.CSSProperties = {
  background: SURFACE,
  border: `1px solid ${LINE}`,
  borderRadius: 18,
  padding: 18,
  fontFamily: font,
};

const lbl: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: ".12em",
  textTransform: "uppercase",
  color: GREY,
  marginBottom: 8,
  fontFamily: font,
};

const ghostBtn: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  color: NAVY,
  background: "#FFFFFF",
  border: `1px solid ${LINE}`,
  fontFamily: font,
};
