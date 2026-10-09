// Shared shape for the Strategy Profile. Stored as jsonb on business_brains.data.

export type BrainData = {
  business?: {
    name?: string;
    website?: string;
    vision?: string;
    industry?: string;
    industry_descriptors?: string;
    products_services?: string;
    unavailable_or_planned?: string;
    location?: string;
    years_trading?: string;
  };
  brand?: {
    words_always_use?: string;
    tone_of_voice?: string;
    mission?: string;
    values?: string;
    usp?: string;
    colors?: string;
    fonts?: string;
    primary_color?: string;
    secondary_color?: string;
    accent_color?: string;
    font_preference?: string;

  };
  audience?: {
    ideal_customer?: string;
    pain_points?: string;
    goals?: string;
    objections?: string;
    buying_triggers?: string;
  };
  marketing?: {
    business_goals?: string;
    competitors?: string;
    keywords?: string;
    channels?: string;
    budget?: string;
  };
  content?: {
    post_length?: string;
    cta_style?: string;
    emoji_preference?: string;
    formality?: string;
    preferred_platforms?: string;
  };
  proof?: {
    testimonials?: string;
    case_studies?: string;
    notable_clients?: string;
    awards_press?: string;
    owned_stats?: string;
  };
  founder?: {
    name_role?: string;
    origin_story?: string;
    hot_takes?: string;
    signature_phrases?: string;
    banned_words?: string;
    sample_posts?: string;
  };
  ctas?: {
    primary?: string;
    secondary?: string;
    alternative?: string;
    offer?: string;
    current_offer?: string;
    bridge_line?: string;
    comment_cta?: string;
    lead_magnets?: string;
  };

  preferences?: {
    language?: string;
    timezone?: string;
    country?: string;
  };
};

export const BRAIN_SECTIONS: ReadonlyArray<{
  key: keyof BrainData;
  title: string;
  fields: ReadonlyArray<{ key: string; label: string; multiline?: boolean; placeholder?: string; hint?: string }>;
}> = [
  {
    key: "business",
    title: "Business information",
    fields: [
      { key: "name", label: "Business name", placeholder: "e.g. haaylo.com Ltd", hint: "The trading name customers see — exactly how you'd write it on an invoice." },
      { key: "website", label: "Website", placeholder: "https://contentcollectiv.co.uk", hint: "Full URL including https://. Leave blank if you don't have one yet." },
      { key: "vision", label: "Company vision", multiline: true, placeholder: "Where is this business going in 3–5 years?", hint: "The bigger picture the day-to-day work is building towards." },
      { key: "industry", label: "Market niche", placeholder: "e.g. Female founders, Fitness coaches, eCommerce brands", hint: "One short sentence — niche it down (\"vegan skincare\" beats \"beauty\")." },
      { key: "industry_descriptors", label: "Industry descriptors", placeholder: "e.g. B2B SaaS, Personal brand, Local service", hint: "Up to 5 short labels, comma-separated." },
      { key: "products_services", label: "Products & services", multiline: true, placeholder: "1. 1:1 coaching — £495/mo\n2. Done-for-you content — from £1,500/mo\n3. Free brand voice audit", hint: "List the main offers, prices and what each one delivers. Bullet points are fine." },
      { key: "unavailable_or_planned", label: "Coming soon / not offered", multiline: true, placeholder: "e.g.\n- Canva integration (coming soon)\n- Mailchimp integration (coming soon)\n- Same-day fitting (not offered)", hint: "Features, integrations or services that are planned or that you do not offer. Haaylo will never describe these as available now. You can also tag lines above with [beta], [coming soon] or [unavailable]." },
      { key: "location", label: "Location & market", placeholder: "e.g. Manchester, UK (serve UK & EU)", hint: "Where you're based and where your customers are — also sets currency, spelling and local references." },
      { key: "years_trading", label: "Years trading", placeholder: "e.g. 4", hint: "Rough number — helps the AI judge tone (scrappy startup vs established brand)." },
    ],
  },
  {
    key: "brand",
    title: "Brand",
    fields: [
      { key: "tone_of_voice", label: "Tone of voice", placeholder: "e.g. Warm, direct, a bit cheeky. No jargon. Like a smart friend explaining things over coffee.", hint: "3–5 adjectives, your formality level (casual vs formal) and a 'we do / we don't' rule. Drives every word the AI writes." },
      { key: "mission", label: "Mission", multiline: true, placeholder: "e.g. Help SME founders win back 10 hours a week from marketing busywork.", hint: "One sentence: who you help, how, and the outcome." },
      { key: "values", label: "Brand values", multiline: true, placeholder: "e.g. Plain English. Show the work. No dark patterns. Customer outcomes over vanity metrics.", hint: "3–5 values you genuinely operate by — used to filter ideas the AI suggests." },
      { key: "usp", label: "Unique selling point", multiline: true, placeholder: "e.g. The only AI marketing tool built around the founder's brain, not a blank prompt.", hint: "What you do that competitors can't or won't. Be specific." },
      { key: "words_always_use", label: "Words to always use", placeholder: "e.g. Community, Strategy, Real results", hint: "Comma-separated. The AI will work these in where they fit." },
      { key: "primary_color", label: "Primary brand colour", placeholder: "#FF5C93", hint: "HEX code — used for buttons and headings on your public pages." },
      { key: "secondary_color", label: "Secondary brand colour", placeholder: "#141B3D", hint: "HEX code — used for backgrounds and accents on your public pages." },
      { key: "accent_color", label: "Accent colour", placeholder: "#4ADE80", hint: "HEX code — used for highlights and small details." },
      { key: "font_preference", label: "Font style", placeholder: "e.g. Modern, Classic serif, Bold display", hint: "Sets the typeface on your landing pages and guides." },
    ],
  },

  {
    key: "audience",
    title: "Target audience",
    fields: [
      { key: "ideal_customer", label: "Ideal customer", multiline: true, placeholder: "e.g. UK-based service business founder, 35–55, £250k–£2m turnover, 1–10 staff, does their own marketing.", hint: "One detailed persona beats five vague ones. Include demographics + situation." },
      { key: "pain_points", label: "Customer pain points", multiline: true, placeholder: "e.g. No time to post. Sounds boring on LinkedIn. Doesn't know what to write. Leads have dried up.", hint: "Their actual complaints — use the words they use." },
      { key: "goals", label: "Customer goals", multiline: true, placeholder: "e.g. Predictable inbound leads. Look credible online. Stop chasing strangers on cold DMs.", hint: "The outcome they want — not your feature list." },
      { key: "objections", label: "Common objections", multiline: true, placeholder: "e.g. \"AI content sounds generic.\" \"I don't have time to learn another tool.\" \"Tried it, didn't work.\"", hint: "The hesitations that stop them buying. Each one becomes content the AI can write." },
      { key: "buying_triggers", label: "Buying triggers", multiline: true, placeholder: "e.g. Lost a big client. Hired first salesperson. Launched a new service. Got told off by their accountant.", hint: "Life events that make them ready to buy right now." },
    ],
  },
  {
    key: "marketing",
    title: "Marketing",
    fields: [
      { key: "business_goals", label: "Business goals", multiline: true, placeholder: "e.g. 30 qualified demos / month by Q4. £15k MRR by year end. Launch course in March.", hint: "Numbers + dates. The AI uses these to prioritise what to post about." },
      { key: "competitors", label: "Competitors", placeholder: "e.g. Jasper, Copy.ai, HubSpot Content Hub", hint: "2–5 brands you're compared to — used for positioning and gap analysis." },
      { key: "keywords", label: "Keywords", placeholder: "e.g. ai marketing for sme, inbound engine, content planner uk", hint: "Search terms you'd love to rank for. Comma-separated." },
      { key: "channels", label: "Current marketing channels", placeholder: "e.g. LinkedIn (main), email newsletter, occasional Instagram", hint: "Where you actually post today and which is working best." },
      { key: "budget", label: "Budget", placeholder: "e.g. £500/mo ads, no agency", hint: "Roughly what you can spend on marketing each month." },
    ],
  },
  {
    key: "content",
    title: "Content preferences",
    fields: [
      { key: "post_length", label: "Preferred post length", placeholder: "e.g. Short (under 150 words) for LinkedIn, long-form for blog", hint: "Stops the AI defaulting to walls of text." },
      { key: "emoji_preference", label: "Emoji preference", placeholder: "e.g. Sparingly — 1 per post max, never in headlines", hint: "None / sparingly / freely — your call." },
      { key: "preferred_platforms", label: "Preferred platforms", placeholder: "e.g. LinkedIn personal, LinkedIn company, email", hint: "Where the content is actually published." },
    ],
  },
  {
    key: "proof",
    title: "Testimonials & proof",
    fields: [
      { key: "testimonials", label: "Testimonials", multiline: true, placeholder: "e.g.\n\"Booked 3 new clients in the first fortnight — this thing pays for itself.\" — Sarah, founder, Loop Studio\n\n\"Finally sounds like me, not a robot.\" — James, coach", hint: "Paste raw customer quotes — one per block. Real words beat polished summaries. Attribution optional but helpful." },
      { key: "case_studies", label: "Case study results", multiline: true, placeholder: "e.g.\n- Acme Ltd: 3x demo bookings in 6 weeks\n- Loop Studio: went from 0 to 400 LinkedIn followers in 30 days\n- Northside Dental: 12 new patients from one campaign", hint: "Client + what changed + numbers. The AI will weave these into content as proof." },
      { key: "notable_clients", label: "Notable clients / logos", placeholder: "e.g. BBC, Monzo, Innocent Drinks, King's College London", hint: "Comma-separated. Recognisable names lend credibility to posts." },
      { key: "awards_press", label: "Awards & press", multiline: true, placeholder: "e.g.\n- Featured in The Times, March 2025\n- Winner, UK SME Marketing Awards 2024\n- Certified B Corp", hint: "Awards, features, certifications — anything a stranger would recognise." },
      { key: "owned_stats", label: "Owned stats & data points", multiline: true, placeholder: "e.g.\n- 87% of our users post weekly within 30 days\n- Average customer sees 2.4x more inbound leads in 90 days\n- We've generated 1.2M impressions for clients in 2025", hint: "Proprietary numbers you can cite. Specific stats stop content sounding generic." },
    ],
  },
  {
    key: "founder",
    title: "Founder voice & story",
    fields: [
      { key: "name_role", label: "Founder name & role", placeholder: "e.g. Alex Rivera, Founder & CEO", hint: "Who's the human voice behind the brand." },
      { key: "origin_story", label: "Why you started", multiline: true, placeholder: "e.g. I spent 8 years in agency-land watching SMEs get charged £5k/mo for content nobody read. Built this because founders deserve better than a junior in Shoreditch guessing at their voice.", hint: "The origin story, in your own words. Powers 'why we exist' posts and About-page copy." },
      { key: "hot_takes", label: "Personal beliefs / hot takes", multiline: true, placeholder: "e.g.\n- Most 'thought leadership' is just recycled LinkedIn slop\n- You don't need a funnel — you need one good offer and 90 days of showing up\n- AI content is fine. Boring content isn't.", hint: "3–5 opinions you'll defend publicly. Fuels punchy, scroll-stopping posts." },
      { key: "signature_phrases", label: "Signature phrases", multiline: true, placeholder: "e.g.\n- \"Show the work.\"\n- \"Boring is a choice.\"\n- \"Founders first.\"", hint: "Words and expressions you actually use. The AI will pattern-match your voice." },
      { key: "banned_words", label: "Banned words & phrases", multiline: true, placeholder: "e.g. delve, unlock, in today's fast-paced world, game-changer, synergy, leverage (as a verb), utilise, revolutionise, cutting-edge, world-class, — (em-dash overuse)", hint: "The 'never say' list. Instantly de-slops AI output — this is the single biggest quality lever." },
      { key: "sample_posts", label: "Sample posts that sound like you", multiline: true, placeholder: "e.g. Paste 3–5 real posts you've written and are proud of, separated by blank lines.\n\n---\n\nMost 'AI content' fails because…\n\n---\n\nI turned down a £30k client last week. Here's why…", hint: "Paste real posts you've written. The AI will study rhythm, length and voice patterns." },
    ],
  },
  {
    key: "ctas",
    title: "Calls to action",
    fields: [
      { key: "primary", label: "Primary CTA", placeholder: "e.g. Book your free home consultation today.", hint: "The main action you want every piece of content to drive. The AI will use this by default." },
      { key: "secondary", label: "Secondary CTA", placeholder: "e.g. Call 01702 233601", hint: "A backup call — often a phone number or direct contact." },
      { key: "alternative", label: "Alternative CTA", placeholder: "e.g. Send us a DM.", hint: "A lower-friction option for social — DM, reply, follow." },
      { key: "offer", label: "Offer CTA", placeholder: "e.g. Request your free quotation.", hint: "Used on promotional or offer-driven posts." },
      { key: "current_offer", label: "Current live offer", multiline: true, placeholder: "e.g. 20% off all shutters until 31 March. Free measure & fit on orders over £1,500.", hint: "The actual promo running right now — what it is, who it's for, any deadline or terms. Leave blank if you have no live offer; the AI will never invent one." },
      { key: "bridge_line", label: "Caption-to-CTA bridge", multiline: true, placeholder: "e.g. If that sounds like what you've been looking for, here's the easiest next step:\nReady to see it in your own home?\nWant us to take it from here?", hint: "The transition sentence the AI uses BEFORE the CTA so the post doesn't jump from story straight to sales. Give 1–3 options in your voice — the AI will pick the one that fits each post." },
      { key: "comment_cta", label: "Comment CTA (only if you use one)", multiline: true, placeholder: "e.g. Comment QUOTE and we'll DM you the price list.", hint: "LEAVE BLANK unless you genuinely run comment-keyword campaigns. If empty, the AI will NEVER ask people to comment a keyword." },
      { key: "lead_magnets", label: "Downloadable assets (PDFs, guides, checklists)", multiline: true, placeholder: "e.g.\n- Free bathroom planning guide (PDF)\n- Price list on request", hint: "List anything you can genuinely send. If nothing is listed, the AI will NEVER offer a guide, PDF, checklist or download." },

    ],
  },
  {
    key: "preferences",
    title: "User preferences",
    fields: [

      { key: "language", label: "Default language", placeholder: "e.g. English (UK)", hint: "Affects spelling — colour vs color, organise vs organize." },
      { key: "timezone", label: "Time zone", placeholder: "e.g. Europe/London", hint: "Used when scheduling posts." },
    ],
  },
] as const;

/**
 * The three sections a Brain needs before haaylo can write on-brand.
 * Everything else is optional "sharpen your Brain" detail.
 */
export const ESSENTIAL_SECTION_KEYS = ["business", "brand", "audience"] as const;

/** The handful of fields that genuinely change the output. */
const ESSENTIAL_FIELDS: Record<string, string[]> = {
  business: ["name", "industry", "products_services"],
  brand: ["tone_of_voice", "usp"],
  audience: ["ideal_customer", "pain_points"],
};

const val = (data: BrainData | null | undefined, section: string, field: string) =>
  String(
    (data as Record<string, Record<string, string | undefined>> | null | undefined)?.[section]?.[field] ?? "",
  ).trim();

/** True once every essential field has something in it. */
export function brainEssentialsComplete(data: BrainData | null | undefined): boolean {
  if (!data) return false;
  return Object.entries(ESSENTIAL_FIELDS).every(([section, fields]) =>
    fields.every((f) => val(data, section, f).length > 0),
  );
}

/** How many essential fields are filled, out of how many there are. */
export function brainEssentialsProgress(data: BrainData | null | undefined): { filled: number; total: number } {
  let filled = 0;
  let total = 0;
  for (const [section, fields] of Object.entries(ESSENTIAL_FIELDS)) {
    for (const f of fields) {
      total++;
      if (val(data, section, f)) filled++;
    }
  }
  return { filled, total };
}

/** Optional sections that still have nothing in them at all. */
export function brainOptionalSectionsRemaining(data: BrainData | null | undefined): number {
  return BRAIN_SECTIONS.filter((s) => {
    if ((ESSENTIAL_SECTION_KEYS as readonly string[]).includes(String(s.key))) return false;
    return !s.fields.some((f) => val(data, String(s.key), f.key));
  }).length;
}

/**
 * Brain health, weighted so essentials carry most of the score.
 * Essentials = 70% of the total, everything else shares the remaining 30%.
 * This means finishing the wizard's core reads as "ready", not "31%".
 */
export function brainFillScore(data: BrainData | null | undefined): number {
  if (!data) return 0;

  const ess = brainEssentialsProgress(data);
  const essShare = ess.total ? (ess.filled / ess.total) * 70 : 0;

  let total = 0;
  let filled = 0;
  for (const s of BRAIN_SECTIONS) {
    for (const f of s.fields) {
      const isEssential = (ESSENTIAL_FIELDS[String(s.key)] || []).includes(f.key);
      if (isEssential) continue;
      total++;
      if (val(data, String(s.key), f.key)) filled++;
    }
  }
  const restShare = total ? (filled / total) * 30 : 0;

  return Math.round(essShare + restShare);
}


export function brainToPromptContext(data: BrainData | null | undefined): string {
  if (!data) return "";
  const lines: string[] = [];
  for (const s of BRAIN_SECTIONS) {
    const sect = (data as Record<string, Record<string, string | undefined>>)?.[s.key];
    if (!sect) continue;
    const entries = s.fields
      .map((f) => {
        const v = sect[f.key];
        return v && String(v).trim() ? `  - ${f.label}: ${String(v).trim()}` : null;
      })
      .filter(Boolean);
    if (entries.length) {
      lines.push(`${s.title}:`);
      lines.push(...(entries as string[]));
    }
  }
  if (!lines.length) return "";
  return [
    "BUSINESS BRAIN (use this context throughout; do not re-ask the user for these details):",
    ...lines,
  ].join("\n");
}

/**
 * Brand DNA — the required fields on the Strategy > Brand DNA screen.
 * Sections 1 and 2 are required; Proof and Brand Voice are optional.
 */
export const BRAND_DNA_REQUIRED: ReadonlyArray<[string, string]> = [
  ["business", "name"],
  ["business", "website"],
  ["founder", "origin_story"],
  ["business", "vision"],
  ["brand", "values"],
  ["business", "products_services"],
  ["brand", "usp"],
  ["brand", "mission"],
  ["marketing", "business_goals"],
  ["marketing", "competitors"],
  ["ctas", "primary"],
  ["audience", "ideal_customer"],
  ["business", "industry"],
  ["business", "industry_descriptors"],
  ["audience", "objections"],
  ["audience", "buying_triggers"],
];

export function brandDnaProgress(data: BrainData | null | undefined): {
  filled: number;
  total: number;
  percent: number;
} {
  const total = BRAND_DNA_REQUIRED.length;
  const filled = BRAND_DNA_REQUIRED.filter(([s, f]) => val(data, s, f).length > 0).length;
  return { filled, total, percent: total ? Math.round((filled / total) * 100) : 0 };
}
