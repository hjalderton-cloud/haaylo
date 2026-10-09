import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getBrain } from "@/lib/brain.functions";
import { brainFillScore } from "@/lib/brain-schema";
import { supabase } from "@/integrations/supabase/client";
import { ensureZernioProfile } from "@/lib/zernio.functions";

import { WorkflowSidebar, ContextBar, MobileTabs, AccountMenu } from "@/components/WorkflowNav";
import { HubTabs } from "@/components/HubTabs";

import wordmarkAsset from "@/assets/haaylo-logo-2026.png.asset.json";
import brainHealthAsset from "@/assets/brain-mascot-transparent.png.asset.json";
import { BG, SURFACE, NAVY, INDIGO, PINK, GREY, LINE, TINT, font } from "@/lib/theme";

const SIDEBAR_WIDTH = 260;

/** Creates the signed-in user's own Zernio profile once, quietly, on first load. */
function useEnsureZernioProfile() {
  const ensureFn = useServerFn(ensureZernioProfile);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("haaylo.zernio.ensured") === "1") return;
    void (async () => {
      try {
        const res = await ensureFn({ data: undefined });
        if (res.ok) sessionStorage.setItem("haaylo.zernio.ensured", "1");
      } catch {
        /* retried on the Connect screen */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function AppShell({
  title,
  children,
  flush = false,
}: {
  title: string;
  children: ReactNode;
  /** Full-bleed content (used by the Engine iframe) */
  flush?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileHub, setMobileHub] = useState<string | null>(null);
  useEnsureZernioProfile();




  return (
    <div
      style={{
        minHeight: "100vh",
        background: BG,
        color: NAVY,
        fontFamily: font,
        display: "flex",
      }}
    >
      {/* Desktop sidebar */}
      <aside
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: SIDEBAR_WIDTH,
          background: "#FFFFFF",
          borderRight: `1px solid ${LINE}`,
          flexDirection: "column",
          zIndex: 40,
          paddingTop: "max(16px, env(safe-area-inset-top))",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        className="hidden md:flex"
      >
        <div style={{ padding: "22px 20px 14px" }}>
          <Wordmark />
        </div>

        {pathname.startsWith("/brain") && <BrainHealthWidget />}

        <WorkflowSidebar />

        <AccountMenu />
      </aside>

      {/* Mobile overlay sidebar */}
      {mobileOpen && (
        <div
          className="md:hidden"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(20,20,40,0.4)",
            zIndex: 50,
          }}
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className="flex md:hidden"
        style={{
          position: "fixed",
          top: 0,
          left: mobileOpen ? 0 : "-88vw",
          bottom: 0,
          width: "min(86vw, 300px)",
          maxWidth: 300,
          background: "#FFFFFF",
          borderRight: `1px solid ${LINE}`,
          flexDirection: "column",
          zIndex: 60,
          transition: "left 0.25s ease",
          overflowY: "auto",
          paddingTop: "max(16px, env(safe-area-inset-top))",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            padding: "16px 16px 12px",
          }}
        >
          <button
            onClick={() => setMobileOpen(false)}
            style={{ color: GREY, fontSize: 18, background: "none", border: "none", cursor: "pointer" }}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        {pathname.startsWith("/brain") && <BrainHealthWidget />}

        <WorkflowSidebar onNavigate={() => setMobileOpen(false)} initialHub={mobileHub} />

        <div style={{ marginTop: "auto" }}>
          <AccountMenu />
        </div>
      </aside>

      {/* Main content area */}
      <style>{`@media (min-width: 768px){.appshell-main{margin-left:${SIDEBAR_WIDTH}px;}}`}</style>
      <div
        className="appshell-main"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        {/* Mobile header with hamburger */}
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 30,
            background: "rgba(255,255,255,0.9)",
            backdropFilter: "blur(10px)",
            borderBottom: `1px solid ${LINE}`,
            padding: "10px 16px",
            paddingTop: "max(10px, env(safe-area-inset-top))",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden"
              style={{
                background: "none",
                border: "none",
                color: NAVY,
                fontSize: 18,
                cursor: "pointer",
                padding: 0,
              }}
              aria-label="Open menu"
            >
              ☰
            </button>
            <BackButton />
          </div>


          <h1
            style={{
              fontFamily: font,
              fontSize: 14,
              letterSpacing: ".04em",
              color: PINK,
              margin: 0,
              fontWeight: 700,
            }}
          >
            {title.toUpperCase()}
          </h1>

          <div className="hidden md:block" />
        </header>

        <ContextBar />

        

        <main
          style={{
            maxWidth: flush ? "none" : 880,
            margin: "0 auto",
            padding: flush ? 0 : "20px 16px 32px",
            paddingBottom: "calc(32px + env(safe-area-inset-bottom) + 72px)",
            width: "100%",
            flex: 1,
          }}
        >
          {!flush && <HubTabs />}
          {children}
        </main>
      </div>

      <MobileTabs onOpenHub={(hubId) => { setMobileHub(hubId); setMobileOpen(true); }} />
    </div>
  );
}

const NAV_STACK_KEY = "haaylo.navstack";

/** In-app page trail, so Back always means "the previous screen you were on in Haaylo". */
function useNavStack(pathname: string) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(NAV_STACK_KEY);
      const stack: string[] = raw ? JSON.parse(raw) : [];
      if (stack[stack.length - 1] === pathname) return;
      if (stack[stack.length - 2] === pathname) {
        // Went back (browser/phone gesture or our own Back): drop the page we left
        // instead of recording it as a new forward step.
        stack.pop();
      } else {
        stack.push(pathname);
      }
      sessionStorage.setItem(NAV_STACK_KEY, JSON.stringify(stack.slice(-30)));
    } catch {
      /* storage unavailable */
    }
  }, [pathname]);
}

function previousPath(): string | null {
  try {
    const raw = sessionStorage.getItem(NAV_STACK_KEY);
    const stack: string[] = raw ? JSON.parse(raw) : [];
    stack.pop(); // current page
    const prev = stack.pop() ?? null;
    sessionStorage.setItem(NAV_STACK_KEY, JSON.stringify(stack));
    return prev;
  } catch {
    return null;
  }
}

/** Goes back one step within the app; falls back to Home only when there is no in-app step. */
function BackButton() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useNavStack(pathname);
  if (pathname === "/engine" || pathname === "/") return null;
  return (
    <button
      type="button"
      onClick={() => {
        const prev = previousPath();
        if (prev && prev !== pathname) {
          // Dynamic runtime path — validated against our own in-app trail above.
          void navigate({ to: prev } as never);
        } else {
          void navigate({ to: "/home" });
        }
      }}
      aria-label="Go back"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: SURFACE,
        border: `1px solid ${LINE}`,
        color: INDIGO,
        borderRadius: 9,
        padding: "6px 12px",
        fontSize: 13,
        fontWeight: 600,
        fontFamily: font,
        cursor: "pointer",
      }}
    >
      ← Back
    </button>
  );
}


function Wordmark() {
  return (
    <Link to="/home" style={{ display: "block" }} aria-label="Haaylo home">
      <img
        src={wordmarkAsset.url}
        alt="Haaylo"
        style={{
          display: "block",
          width: "100%",
          maxWidth: 320,
          height: "auto",
          filter: "drop-shadow(0 4px 10px rgba(229,70,131,0.18))",
        }}
      />
    </Link>
  );
}

function BrainHealthWidget() {
  const brainFn = useServerFn(getBrain);
  const [score, setScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user || u.user.is_anonymous) {
          setLoading(false);
          return;
        }
        const b = await brainFn({ data: {} });
        if (!cancelled) setScore(brainFillScore(b.data));
      } catch {
        /* silent */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    // Live updates: brain.setup dispatches `brain:updated` with the latest score on every edit/save.
    const onBrainUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ score?: number }>).detail;
      if (typeof detail?.score === "number") setScore(detail.score);
    };
    window.addEventListener("brain:updated", onBrainUpdated as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener("brain:updated", onBrainUpdated as EventListener);
    };
  }, []);

  if (loading || score === null) return null;

  const displayScore = Math.max(0, Math.min(100, Math.round(score)));

  return (
    <Link
      to="/brain/setup"
      style={{
        display: "block",
        textDecoration: "none",
        padding: "8px 12px 16px",
        margin: "0 12px 8px",
        borderRadius: 14,
        background: "transparent",
        border: "none",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{ position: "relative", width: "100%", maxWidth: 220 }}
          aria-label={`Brain health ${displayScore}%`}
        >
          {/* Grey brain background */}
          <img
            src={brainHealthAsset.url}
            alt=""
            style={{
              display: "block",
              width: "100%",
              height: "auto",
              filter: "grayscale(100%) brightness(1.1) opacity(0.25)",
            }}
          />

          {/* Colored brain fill */}
          <img
            src={brainHealthAsset.url}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              clipPath: `inset(${100 - displayScore}% 0 0 0)`,
            }}
          />

          {/* Percentage + label */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                fontFamily: font,
                fontSize: 34,
                fontWeight: 700,
                color: NAVY,
                textShadow: "0 2px 10px rgba(255,255,255,0.8)",
                lineHeight: 1,
              }}
            >
              {displayScore}%
            </div>
            <div
              style={{
                fontSize: 10,
                color: INDIGO,
                letterSpacing: ".1em",
                textTransform: "uppercase",
                fontWeight: 800,
                marginTop: 4,
              }}
            >
              Brain Health
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

export const CARD: React.CSSProperties = {
  background: SURFACE,
  border: `1px solid ${LINE}`,
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 12px 28px -6px rgba(20,20,40,0.10), 0 4px 8px -2px rgba(85,62,162,0.10)",
};
