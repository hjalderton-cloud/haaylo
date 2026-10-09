// Single Haaylo membership pricing stages. Server-side source of truth.
export type MembershipType = "founding_early" | "founding_launch" | "standard";

export function currentStage(now: Date = new Date()): {
  membershipType: MembershipType;
  priceId: string | undefined;
  amountLabel: string;
} {
  const t = now.getTime();
  const LAUNCH_START = Date.UTC(2026, 10, 1); // 1 Nov 2026
  const STANDARD_START = Date.UTC(2027, 0, 1); // 1 Jan 2027

  if (t < LAUNCH_START) {
    return {
      membershipType: "founding_early",
      priceId: Deno.env.get("STRIPE_FOUNDING_EARLY_PRICE_ID"),
      amountLabel: "£49",
    };
  }
  if (t < STANDARD_START) {
    return {
      membershipType: "founding_launch",
      priceId: Deno.env.get("STRIPE_FOUNDING_LAUNCH_PRICE_ID"),
      amountLabel: "£99",
    };
  }
  return {
    membershipType: "standard",
    priceId: Deno.env.get("STRIPE_STANDARD_MONTHLY_PRICE_ID"),
    amountLabel: "£49",
  };
}

export function membershipTypeForPrice(priceId: string | null | undefined): MembershipType {
  if (!priceId) return "standard";
  if (priceId === Deno.env.get("STRIPE_FOUNDING_EARLY_PRICE_ID")) return "founding_early";
  if (priceId === Deno.env.get("STRIPE_FOUNDING_LAUNCH_PRICE_ID")) return "founding_launch";
  return "standard";
}

export function isFoundingPrice(priceId: string | null | undefined): boolean {
  const t = membershipTypeForPrice(priceId);
  return t === "founding_early" || t === "founding_launch";
}
