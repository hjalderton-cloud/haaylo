import { Home, Megaphone, Target, Sparkles, CalendarDays, Mail, ChartNoAxesCombined, Brain, Settings, type LucideIcon } from "lucide-react";

export type HubTab = {
  label: string;
  to: string;
  hash?: string;
  search?: Record<string, string>;
  /** Extra paths that should light this item up. */
  match?: string[];
};

export type Hub = {
  id: string;
  label: string;
  mobileLabel?: string;
  icon: LucideIcon;
  to: string;
  tabs: HubTab[];
  /** Core intelligent experiences, highlighted in the menu. */
  priority?: boolean;
};

/** One source of truth for the main menu: nine flat destinations. */
export const HUBS: Hub[] = [
  {
    id: "home",
    label: "Home",
    icon: Home,
    to: "/home",
    tabs: [{ label: "Home", to: "/home" }],
  },
  {
    id: "campaigns",
    label: "Campaigns",
    mobileLabel: "Camps",
    icon: Megaphone,
    to: "/campaign",
    tabs: [
      {
        label: "Campaigns",
        to: "/campaign",
        match: ["/campaign-posts", "/landing", "/funnel", "/magnet", "/build-marketing"],
      },
    ],
  },
  {
    id: "strategy",
    label: "Strategy",
    mobileLabel: "Plan",
    icon: Target,
    to: "/plan",
    tabs: [{ label: "Strategy", to: "/plan", match: ["/content-plan"] }],
  },
  {
    id: "create",
    label: "Create",
    icon: Sparkles,
    to: "/tools",
    tabs: [
      {
        label: "Create",
        to: "/tools",
        match: ["/ideas", "/first-post", "/repurpose", "/caption-variator", "/hashtags", "/image", "/snippets", "/bank", "/history", "/engine"],
      },
    ],
  },
  {
    id: "calendar",
    label: "Calendar",
    mobileLabel: "Cal",
    icon: CalendarDays,
    to: "/calendar",
    tabs: [{ label: "Calendar", to: "/calendar", match: ["/scheduler"] }],
  },
  {
    id: "emails",
    label: "Emails",
    mobileLabel: "Mail",
    icon: Mail,
    to: "/email",
    tabs: [{ label: "Emails", to: "/email" }],
  },
  {
    id: "insights",
    label: "Insights",
    mobileLabel: "Stats",
    icon: ChartNoAxesCombined,
    to: "/analytics/campaigns",
    tabs: [
      {
        label: "Insights",
        to: "/analytics/campaigns",
        match: ["/analytics", "/leads", "/trends", "/competitors", "/agent/analytics"],
      },
    ],
  },
  {
    id: "brand",
    label: "Brand",
    icon: Brain,
    to: "/brain/setup",
    tabs: [{ label: "Brand", to: "/brain/setup", match: ["/brain", "/brand-assets", "/personas"] }],
  },
  {
    id: "settings",
    label: "Settings",
    mobileLabel: "Setup",
    icon: Settings,
    to: "/account",
    tabs: [
      {
        label: "Settings",
        to: "/account",
        match: ["/projects", "/connect", "/automations", "/agent/settings"],
      },
    ],
  },
];

function pathsFor(tab: HubTab): string[] {
  return [tab.to, ...(tab.match ?? [])];
}

/** Longest-prefix match so exactly one menu item lights up per page. */
export function hubForPath(pathname: string): { hub: Hub | null; tab: HubTab | null } {
  let best: { hub: Hub; tab: HubTab; len: number } | null = null;
  for (const hub of HUBS) {
    for (const tab of hub.tabs) {
      for (const p of pathsFor(tab)) {
        if (pathname === p || pathname.startsWith(`${p}/`)) {
          if (!best || p.length > best.len) best = { hub, tab, len: p.length };
        }
      }
    }
  }
  if (!best) return { hub: null, tab: null };
  return { hub: best.hub, tab: best.tab };
}

/** Page-level pills were replaced by the shared expandable sidebar. */
export function HubTabs() { return null; }
