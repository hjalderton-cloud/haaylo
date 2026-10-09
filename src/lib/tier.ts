// Pricing-tier feature matrix. Client-safe: no server imports.

export type Tier = "none" | "starter" | "pro" | "expert";

export type FeatureKey =
  | "brain"
  | "analytics"
  | "assistant" // Home dashboard AI: Quick Wins, Momentum, KPIs, suggestions
  | "images"
  | "voice"
  | "plan"
  | "posts"
  | "competitors"
  | "funnel"
  | "keywords"
  | "agent"; // AI Marketing Agent: scheduled plan runs in Review mode

export const TIER_FEATURES: Record<Tier, Record<FeatureKey, boolean>> = {
  none: {
    brain: false,
    analytics: false,
    assistant: false,
    images: false,
    voice: true,
    plan: true,
    posts: true,
    competitors: true,
    funnel: true,
    keywords: true,
    agent: false,
  },
  starter: {
    brain: false,
    analytics: false,
    assistant: false,
    images: false,
    voice: true,
    plan: true,
    posts: true,
    competitors: true,
    funnel: true,
    keywords: true,
    agent: false,
  },
  pro: {
    brain: true,
    analytics: true,
    assistant: true,
    images: false,
    voice: true,
    plan: true,
    posts: true,
    competitors: true,
    funnel: true,
    keywords: true,
    agent: true,
  },

  expert: {
    brain: true,
    analytics: true,
    assistant: true,
    images: true, // still shows "Coming soon" badge in UI
    voice: true,
    plan: true,
    posts: true,
    competitors: true,
    funnel: true,
    keywords: true,
    agent: true,
  },
};

// Which tier unlocks a locked feature — used for tooltips.
export const FEATURE_UNLOCK_TIER: Record<FeatureKey, Tier> = {
  brain: "pro",
  analytics: "pro",
  assistant: "pro",
  images: "expert",
  voice: "starter",
  plan: "starter",
  posts: "starter",
  competitors: "starter",
  funnel: "starter",
  keywords: "starter",
  agent: "pro",
};

export const TIER_LABEL: Record<Tier, string> = {
  none: "Free",
  starter: "Starter",
  pro: "Pro",
  expert: "Expert",
};

// Monthly generation cap per tier. `null` = unlimited.
export const TIER_GENERATION_LIMIT: Record<Tier, number | null> = {
  none: 1,       // one free generation total before joining the membership
  starter: 150,
  pro: 500,
  expert: null,
};

export function canUse(tier: Tier, feature: FeatureKey): boolean {
  return TIER_FEATURES[tier][feature];
}
