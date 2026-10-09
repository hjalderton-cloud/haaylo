import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getBrain } from "@/lib/brain.functions";
import { brainFillScore } from "@/lib/brain-schema";
import { getMyTier } from "@/lib/tier.functions";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronRight } from "lucide-react";
import { HUBS, hubForPath } from "@/components/HubTabs";

import { useWorkspace } from "@/hooks/useActiveProject";
import {
  SURFACE,
  NAVY as THEME_NAVY,
  INDIGO,
  PURPLE,
  PINK as THEME_PINK,
  GREY as THEME_GREY,
  LINE,
  TINT,
  font,
} from "@/lib/theme";

export const NAVY = THEME_NAVY;
export const PINK = THEME_PINK;
export const MUTED = THEME_GREY;

export const CLIENT_CHANGED_EVENT = "haaylo:client-changed";

/** Which hub and tab the current page belongs to. */
export function useActiveNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return useMemo(() => hubForPath(pathname), [pathname]);
}

/** AI Agent is gated to Pro/Expert — standard users see a lock in the nav. */
export function useAgentLocked() {
  const tierFn = useServerFn(getMyTier);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user || u.user.is_anonymous) return;
        const res = await tierFn();
        if (!cancelled) setLocked(!(res.tier === "pro" || res.tier === "expert"));
      } catch { /* silent */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return locked;
}

/** Permanent main destinations, with tools in their contextual tabs. */
export function WorkflowSidebar({ onNavigate, initialHub }: { onNavigate?: () => void; initialHub?: string | null }) {
  const { hub: activeHub, tab: activeTab } = useActiveNav();
  const [openHub, setOpenHub] = useState<string | null>(initialHub ?? activeHub?.id ?? null);

  useEffect(() => {
    if (initialHub) setOpenHub(initialHub);
    else if (activeHub?.id) setOpenHub(activeHub.id);
  }, [activeHub?.id, initialHub]);

  return (
    <nav style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "4px 12px 16px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {HUBS.map((hub) => {
          const active = activeHub?.id === hub.id;
          const open = openHub === hub.id;
          const accent = hub.priority ? THEME_PINK : PURPLE;
          if (hub.tabs.length === 1) {
            return (
              <Link
                key={hub.id}
                to={hub.to}
                onClick={() => onNavigate?.()}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  padding: "13px 14px",
                  borderRadius: 12,
                  fontSize: 13.5,
                  fontWeight: 700,
                  fontFamily: font,
                  textDecoration: "none",
                  color: active || hub.priority ? accent : INDIGO,
                  background: active ? (hub.priority ? TINT.pink : TINT.purple) : hub.priority ? "rgba(229,70,131,0.06)" : "transparent",
                  border: `1px solid ${active || hub.priority ? accent : "transparent"}`,
                }}
              >
                <hub.icon size={18} strokeWidth={2.2} aria-hidden />
                <span style={{ flex: 1 }}>{hub.label}</span>
              </Link>
            );
          }
          return (
            <div key={hub.id}>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`hub-${hub.id}`}
                onClick={() => setOpenHub((current) => current === hub.id ? null : hub.id)}
                style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                width: "100%",
                padding: "13px 14px",
                borderRadius: 12,
                fontSize: 13.5,
                fontWeight: 700,
                letterSpacing: ".01em",
                fontFamily: font,
                color: active || hub.priority ? accent : INDIGO,
                background: active ? (hub.priority ? TINT.pink : TINT.purple) : hub.priority ? "rgba(229,70,131,0.06)" : "transparent",
                border: `1px solid ${active || hub.priority ? accent : "transparent"}`,
                cursor: "pointer",
              }}
            >
              <hub.icon size={18} strokeWidth={2.2} aria-hidden />
              <span style={{ minWidth: 0, flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis" }}>{hub.label}</span>
              {open ? <ChevronDown size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}
              </button>
              {open && (
                <div id={`hub-${hub.id}`} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "4px 0 8px 31px" }}>
                  {hub.tabs.map((item) => {
                    const itemActive = activeTab?.to === item.to;
                    return (
                      <Link
                        key={`${item.to}${item.hash ?? ""}`}
                        to={item.to}
                        hash={item.hash}
                        search={item.search as never}
                        onClick={() => onNavigate?.()}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          color: itemActive ? PURPLE : INDIGO,
                          background: itemActive ? TINT.purple : "transparent",
                          fontSize: 12.5,
                          fontWeight: itemActive ? 700 : 600,
                          lineHeight: 1.3,
                          textDecoration: "none",
                        }}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}


/** Client picker + breadcrumb + Brain health, shown once above the content. */
export function ContextBar() {
  const { hub, tab } = useActiveNav();
  const brainFn = useServerFn(getBrain);
  const { projects: clients, projectId: activeClient, selectProject } = useWorkspace();
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const b = await brainFn({ data: { projectId: activeClient } });
        if (!cancelled) setScore(brainFillScore(b.data));
      } catch { /* silent */ }
    })();
    const onBrainUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ score?: number }>).detail;
      if (typeof detail?.score === "number") setScore(detail.score);
    };
    window.addEventListener("brain:updated", onBrainUpdated as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener("brain:updated", onBrainUpdated as EventListener);
    };
  }, [activeClient, brainFn]);

  const crumb = hub && tab ? (hub.tabs.length === 1 ? hub.label : `${hub.label} › ${tab.label}`) : "Home";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        padding: "8px 14px",
        background: SURFACE,
        borderBottom: `1px solid ${LINE}`,
        fontSize: 12,
        color: THEME_GREY,
        fontFamily: font,
      }}
    >
      {clients.length > 0 && (
        <select
          value={activeClient}
          onChange={(e) => selectProject(e.target.value)}
          aria-label="Active client"
          style={{
            background: "#FFFFFF",
            color: INDIGO,
            border: `1px solid ${LINE}`,
            borderRadius: 999,
            padding: "5px 10px",
            fontSize: 12,
            fontWeight: 700,
            maxWidth: 200,
          }}
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id} style={{ color: THEME_NAVY }}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      <span style={{ fontWeight: 700, letterSpacing: ".02em", color: INDIGO, minWidth: 0 }}>
        {crumb}
      </span>

    </div>
  );
}

/** Permanent destinations, visible throughout the mobile workspace. */
export function MobileTabs({ onOpenHub }: { onOpenHub?: (hubId: string) => void }) {
  const { hub: activeHub } = useActiveNav();
  const navigate = useNavigate();
  return (
    <nav aria-label="Main menu" className="fixed inset-x-0 bottom-0 z-45 grid grid-cols-9 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
      {HUBS.map((hub) => (
        <button
          type="button"
          key={hub.id}
          aria-label={hub.label}
          aria-current={activeHub?.id === hub.id ? "page" : undefined}
          onClick={() => {
            if (hub.tabs.length === 1) navigate({ to: hub.to });
            else onOpenHub?.(hub.id);
          }}
          className="flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 px-0.5 py-2 text-center text-[9.5px] leading-tight font-semibold text-foreground aria-[current=page]:bg-accent aria-[current=page]:text-primary"
        >
          <hub.icon className="size-5 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">{hub.mobileLabel ?? hub.label}</span>
        </button>
      ))}
    </nav>
  );
}

/** Bottom-left account menu: avatar/initials with Profile, Settings, Billing, Sign out. */
export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const [initials, setInitials] = useState("?");
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        const email = u.user?.email ?? "";
        const name = (u.user?.user_metadata?.full_name as string | undefined) ?? "";
        const src = name || email;
        if (src) {
          const parts = src.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
          setInitials(parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?");
        }
      } catch { /* silent */ }
    })();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function signOut() {
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    window.location.href = "/";
  }

  const itemStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "9px 12px",
    fontSize: 13,
    fontWeight: 700,
    color: INDIGO,
    background: "none",
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
    textDecoration: "none",
    fontFamily: font,
  };

  return (
    <div ref={ref} style={{ position: "relative", padding: "10px 12px", borderTop: `1px solid ${LINE}` }}>
      {open && (
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            left: 12,
            right: 12,
            marginBottom: 6,
            padding: 6,
            borderRadius: 14,
            background: "#FFFFFF",
            border: `1px solid ${LINE}`,
            boxShadow: "0 18px 40px rgba(20,20,40,0.16)",
            display: "flex",
            flexDirection: "column",
            gap: 2,
            zIndex: 90,
          }}
        >
          <Link to="/account" style={itemStyle} onClick={() => setOpen(false)}>Profile</Link>
          <Link to="/account" style={itemStyle} onClick={() => setOpen(false)}>Settings</Link>
          <Link to="/account" style={itemStyle} onClick={() => setOpen(false)}>Billing</Link>
          <button type="button" style={{ ...itemStyle, color: PINK }} onClick={signOut}>Sign out</button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 4,
          width: "100%",
        }}
      >
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: TINT.pink,
            border: `1px solid ${PINK}`,
            color: TINT.pinkInk,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          {initials}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: MUTED, fontFamily: font }}>Account</span>
      </button>
    </div>
  );
}
