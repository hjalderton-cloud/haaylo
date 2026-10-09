// Single Haaylo membership — pricing stages. Client-safe (no secrets).

export type MembershipType = "founding_early" | "founding_launch" | "standard";

export const LAUNCH_START_UTC = Date.UTC(2026, 10, 1); // 1 Nov 2026
export const STANDARD_START_UTC = Date.UTC(2027, 0, 1); // 1 Jan 2027

export interface Stage {
  membershipType: MembershipType;
  /** Headline price the customer pays today, e.g. "£49". */
  amount: string;
  /** Card heading. */
  title: string;
  /** Price line, e.g. "£49 for your first year". */
  priceLine: string;
  /** Mandatory disclosure line. */
  disclosure: string;
  /** Offer deadline copy, empty for the standard stage. */
  deadline: string;
  cta: string;
}

export function stageForDate(now: Date = new Date()): Stage {
  const t = now.getTime();
  if (t < LAUNCH_START_UTC) {
    return {
      membershipType: "founding_early",
      amount: "£99",
      title: "Founding Member – Early Access",
      priceLine: "£99 for your first year",
      disclosure: "£99 for your first 12 months, then £49/month.",
      deadline: "Early Founding Member price ends 31 October 2026.",
      cta: "Become a Founding Member – £99",
    };
  }
  if (t < STANDARD_START_UTC) {
    return {
      membershipType: "founding_launch",
      amount: "£99",
      title: "Founding Member",
      priceLine: "£99 for your first year",
      disclosure: "£99 for your first 12 months, then £49/month.",
      deadline: "Founding Member offer ends 31 December 2026.",
      cta: "Become a Founding Member – £99",
    };
  }
  return {
    membershipType: "standard",
    amount: "£49",
    title: "haaylo Membership",
    priceLine: "£49/month",
    disclosure: "£49/month. Cancel anytime.",
    deadline: "",
    cta: "Join haaylo",
  };
}

export const MEMBERSHIP_FEATURES = [
  "Strategy Profile",
  "haaylo Engine",
  "90-Day Marketing Strategy",
  "90-Day Content Planner",
  "Content Bank",
  "Competitor Radar",
  "Multi-platform content creation",
  "First access to new features",
];

export const MEMBERSHIP_LABEL: Record<MembershipType, string> = {
  founding_early: "Founding Member – Early Access",
  founding_launch: "Founding Member",
  standard: "haaylo Membership",
};

export const FOUNDING_RATE_LABEL: Record<MembershipType, string> = {
  founding_early: "£99 first year",
  founding_launch: "£99 first year",
  standard: "£49/month",
};

export function statusLabel(status: string | null | undefined): string {
  switch (status) {
    case "active":
    case "trialing":
      return "Active";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "Payment issue";
    case "canceled":
      return "Cancelled";
    default:
      return "No membership";
  }
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
