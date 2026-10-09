import { createFileRoute, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listContentPosts, saveContentPost, deleteContentPost, importContentPosts, setContentStatus } from "@/lib/content.functions";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { listLeads, leadStats, replyToLead } from "@/lib/leads.functions";
import { getDashboardSnapshot } from "@/lib/dashboard.functions";
import { toast } from "sonner";

import wordmarkAsset from "@/assets/haaylo-logo-2026.png.asset.json";
import iconBrainstorm from "@/assets/nav-brainstorm.png";
import { getBrain, getDirector, listProjects, updateBrain } from "@/lib/brain.functions";
import { getMyPlanUsage } from "@/lib/tier.functions";
import { createMembershipCheckout } from "@/lib/billing.functions";
import { stageForDate, MEMBERSHIP_FEATURES } from "@/lib/pricing";

import { saveToBank } from "@/lib/bank.functions";
import { getStrategyPlan, saveStrategyPlan } from "@/lib/strategy.functions";
import { ActiveProjectProvider } from "@/hooks/useActiveProject";
import { generatePostGraphic, refinePostGraphic } from "@/lib/image.functions";
import { brainFillScore, BRAIN_SECTIONS, type BrainData } from "@/lib/brain-schema";
import {
  WorkflowSidebar,
  ContextBar,
  MobileTabs,
  CLIENT_CHANGED_EVENT,
} from "@/components/WorkflowNav";


const searchSchema = z.object({
  session_id: z.string().optional(),
  canceled: z.string().optional(),
});

export const Route = createFileRoute("/engine")({
  validateSearch: searchSchema,
  ssr: false,
  head: () => ({
    meta: [
      { title: "haaylo — Your whole marketing operation, in one place" },
      { name: "description", content: "Brand Voice, Strategy, Content, Funnel and SEO — the haaylo.com AI Inbound Engine, powered by Gemini 3 Flash. £49/month subscription." },
      { property: "og:title", content: "Engine — haaylo.com" },
      { property: "og:description", content: "Brand Voice, Strategy, Content, Funnel & SEO — your AI inbound marketing engine." },
      { property: "og:url", content: "https://haaylo.com/" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "canonical", href: "https://haaylo.com/" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Service",
          name: "haaylo.com Inbound Engine",
          description: "AI inbound marketing engine with Brand Voice, Strategy, Content, Funnel and SEO modules powered by Gemini 3 Flash.",
          provider: { "@type": "Organization", name: "haaylo.com" },
          areaServed: "Worldwide",
          offers: { "@type": "Offer", price: "49", priceCurrency: "GBP", category: "Subscription" },
        }),
      },
    ],
  }),
  component: EngineRoute,
});

/** The tools screen shares the same single selected-workspace state as the app. */
function EngineRoute() {
  return (
    <ActiveProjectProvider>
      <EnginePage />
    </ActiveProjectProvider>
  );
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

type GateState = "loading" | "unlocked" | "trial" | "locked" | "error";

type Rec = { title: string; why: string; module: string; cta: string; href: string; effort: string };

function EnginePage() {
  const navigate = useNavigate();
  const { session_id, canceled } = Route.useSearch();
  const [state, setState] = useState<GateState>("loading");
  const [lockedReason, setLockedReason] = useState<string | null>(null);

  const [freeRemaining, setFreeRemaining] = useState<number>(5);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [isAnonymous, setIsAnonymous] = useState<boolean>(true);
  const [verifying, setVerifying] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileHub, setMobileHub] = useState<string | null>(null);

  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [brainScore, setBrainScore] = useState<number | null>(null);
  const [brainData, setBrainData] = useState<BrainData | null>(null);
  const [defaultProjectId, setDefaultProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Array<{ id: string; name: string; is_default: boolean }>>([]);
  const [topRecs, setTopRecs] = useState<Rec[]>([]);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const mountedRef = useRef(true);
  const brainFn = useServerFn(getBrain);
  const directorFn = useServerFn(getDirector);
  const projectsFn = useServerFn(listProjects);
  const saveBankFn = useServerFn(saveToBank);
  const strategyPlanFn = useServerFn(getStrategyPlan);
  const saveStrategyPlanFn = useServerFn(saveStrategyPlan);
  const listContentFn = useServerFn(listContentPosts);
  const setContentStatusFn = useServerFn(setContentStatus);
  const saveContentFn = useServerFn(saveContentPost);
  const generateGraphicFn = useServerFn(generatePostGraphic);
  const refineGraphicFn = useServerFn(refinePostGraphic);
  const deleteContentFn = useServerFn(deleteContentPost);
  const importContentFn = useServerFn(importContentPosts);
  const updateBrainFn = useServerFn(updateBrain);
  const membershipCheckoutFn = useServerFn(createMembershipCheckout);
  const planUsageFnRaw = useServerFn(getMyPlanUsage);
  const listLeadsFn = useServerFn(listLeads);
  const leadStatsFn = useServerFn(leadStats);
  const dashboardFn = useServerFn(getDashboardSnapshot);
  const replyToLeadFn = useServerFn(replyToLead);

  const planUsageFn = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error("no-session");
    return planUsageFnRaw();
  };

  /** Push the workspace's saved 90-Day Plan into the tools screen. */
  async function sendStrategy(projectId?: string | null) {
    const pid = projectId ?? defaultProjectId;
    if (!pid) return;
    try {
      const res = await strategyPlanFn({ data: { projectId: pid } });
      iframeRef.current?.contentWindow?.postMessage(
        { type: "engine:strategy", projectId: pid, plan: res?.plan ?? null },
        "*",
      );
    } catch { /* silent — the tools screen falls back to its local copy */ }
  }

  async function refreshProjectContext(projectId: string) {
    setDefaultProjectId(projectId);
    setBrainData(null);
    setBrainScore(null);
    try { window.localStorage.setItem("ie-active-project", projectId); } catch { /* ignore */ }
    iframeRef.current?.contentWindow?.postMessage(
      { type: "engine:projects", projects, activeProjectId: projectId },
      "*",
    );
    iframeRef.current?.contentWindow?.postMessage(
      { type: "engine:brain-score", score: 0, ready: false, loaded: false, isAnonymous },
      "*",
    );

    try {
      const brain = await brainFn({ data: { projectId } });
      if (!mountedRef.current) return;
      const activeId = brain.projectId || projectId;
      setDefaultProjectId(activeId);
      setBrainData(brain.data);
      setBrainScore(brainFillScore(brain.data));
      try { window.localStorage.setItem("ie-active-project", activeId); } catch { /* ignore */ }
      iframeRef.current?.contentWindow?.postMessage(
        { type: "engine:projects", projects, activeProjectId: activeId },
        "*",
      );
      iframeRef.current?.contentWindow?.postMessage(
        { type: "engine:brain", projectId: activeId, data: brain.data },
        "*",
      );
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: "engine:brain-score",
          score: brainFillScore(brain.data),
          ready: computeBrainReady(brain.data),
          loaded: true,
          isAnonymous,
        },
        "*",
      );

      try {
        const rows = await listContentFn({ data: { projectId: activeId } });
        iframeRef.current?.contentWindow?.postMessage({ type: "engine:content-data", projectId: activeId, posts: rows }, "*");
      } catch { /* silent */ }
      try {
        const plan = await planUsageFn();
        iframeRef.current?.contentWindow?.postMessage({ type: "engine:plan", ...plan }, "*");
      } catch { /* silent */ }
      void sendStrategy(activeId);
    } catch {
      if (!mountedRef.current) return;
      setBrainData(null);
      setBrainScore(0);
      iframeRef.current?.contentWindow?.postMessage(
        { type: "engine:brain-score", score: 0, ready: false, loaded: true, isAnonymous },
        "*",
      );
    }
  }


  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Load Brain + Director (only signed-in non-anon users)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || u.user.is_anonymous) return;
      try {
        const stored = typeof window !== "undefined" ? window.localStorage.getItem("ie-active-project") : null;
        const b = await brainFn({ data: stored ? { projectId: stored } : {} });
        if (cancelled) return;
        setBrainData(b.data);
        setDefaultProjectId(b.projectId);
        setBrainScore(brainFillScore(b.data));
        try { if (b.projectId) window.localStorage.setItem("ie-active-project", b.projectId); } catch { /* ignore */ }
        // Director temporarily disabled
        void directorFn;
        try {
          const list = await projectsFn();
          if (cancelled) return;
          setProjects(list.map((p) => ({ id: p.id, name: p.name, is_default: !!p.is_default })));
        } catch { /* silent */ }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [isAnonymous]);

  useEffect(() => {
    if (canceled) {
      toast.info("Payment canceled.");
      navigate({ to: "/engine", search: {}, replace: true });
    }
  }, [canceled, navigate]);

  async function ensureSession() {
    const { data } = await supabase.auth.getUser();
    if (data.user && !data.user.is_anonymous) return data.user;
    // No anonymous accounts: send signed-out visitors to the sign-in page.
    if (typeof window !== "undefined") {
      const redirect = window.location.pathname + window.location.search;
      window.location.assign(`/auth?redirect=${encodeURIComponent(redirect)}`);
    }
    throw new Error("not_signed_in");
  }


  async function refreshGate() {
    const user = await ensureSession();
    if (!mountedRef.current) return;
    setUserEmail(user?.email ?? null);
    // Prefer real name from user metadata (Google full_name/name, or explicit first_name)
    const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
    const metaName = [meta.first_name, meta.given_name, meta.full_name, meta.name]
      .find((v): v is string => typeof v === "string" && v.trim().length > 0);
    setUserName(metaName ? String(metaName).trim() : null);
    setIsAnonymous(Boolean(user?.is_anonymous));
    try {
      const plan = await planUsageFn();
      if (!mountedRef.current) return;
      const remaining = plan.limit == null ? 999999 : Math.max(0, plan.limit - plan.used);
      setFreeRemaining(plan.tier === "none" ? remaining : 0);
      // The Engine is members-only. The single free generation lives on /first-post,
      // so anyone without a plan sees the membership offer here — never the app.
      setState(plan.tier === "none" ? "locked" : "unlocked");
      iframeRef.current?.contentWindow?.postMessage({ type: "engine:plan", ...plan }, "*");
    } catch {
      if (!mountedRef.current) return;
      setFreeRemaining(0);
      setState("locked");
    }
  }


  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (session_id) {
        setVerifying(true);
        try {
          const { data: s } = await supabase.auth.getSession();
          const token = s.session?.access_token;
          const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-engine-payment`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ session_id }),
          });
          const body = await res.json();
          if (!body.paid) toast.error("Payment not completed.");
        } catch {
          toast.error("Could not verify payment.");
        } finally {
          if (!cancelled) {
            setVerifying(false);
            navigate({ to: "/engine", search: {}, replace: true });
          }
        }
      }
      if (!cancelled) {
        try {
          await refreshGate();
        } catch (err) {
          // "not_signed_in" means a redirect to /auth is already in flight — stay on the loader.
          if (!cancelled && (err as Error)?.message !== "not_signed_in") setState("locked");
        }
      }

    })();
    return () => { cancelled = true; };
  }, [session_id, navigate]);

  // Listen for paywall trigger from inside the iframe
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const data = e.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "engine:ready") { sendToken(); sendProjects(); sendBrainScore(); sendUser(); sendPlan(); void sendStrategy(); }
      if (data.type === "engine:strategy-request") { void sendStrategy(); }
      if (data.type === "engine:strategy-add-topic" && typeof data.topic === "string") {
        const topic = data.topic.slice(0, 200).trim();
        const pillarName = typeof data.pillar === "string" ? data.pillar.trim() : "";
        (async () => {
          if (!defaultProjectId || !topic) return;
          try {
            const res = await strategyPlanFn({ data: { projectId: defaultProjectId } });
            const plan = res?.plan;
            if (!plan || !Array.isArray(plan.pillars) || plan.pillars.length === 0) {
              toast.error("Build your 90-Day Plan first, then you can pin posts to it.");
              return;
            }
            const idx = Math.max(
              0,
              plan.pillars.findIndex((p) => p.name.trim().toLowerCase() === pillarName.toLowerCase()),
            );
            const already = plan.pillars[idx]!.topics.some(
              (t) => t.trim().toLowerCase() === topic.toLowerCase(),
            );
            if (already) { toast.success("Already in your 90-Day Plan"); return; }
            const next = {
              ...plan,
              pillars: plan.pillars.map((p, i) =>
                i === idx ? { ...p, topics: [...p.topics, topic].slice(0, 10) } : p,
              ),
            };
            await saveStrategyPlanFn({ data: { projectId: defaultProjectId, plan: next } });
            toast.success("Added to your 90-Day Plan");
            void sendStrategy();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not add that to your plan");
          }
        })();
      }
      if (data.type === "engine:plan-refresh" || data.type === "engine:generation-complete") {
        // A generation just completed — re-read usage so the ⚡ coin decrements.
        window.setTimeout(() => { void sendPlan(); }, 1200);
        window.setTimeout(() => { void sendPlan(); }, 5000);
      }
      if (data.type === "engine:token-request") {
        (async () => {
          // Force a refresh if the session is stale/expired, then send the current token.
          try {
            const { data: s } = await supabase.auth.getSession();
            const expMs = (s.session?.expires_at ?? 0) * 1000;
            if (!s.session || expMs - Date.now() < 60_000) {
              await supabase.auth.refreshSession();
            }
          } catch { /* fall through to sendToken which will try again */ }
          const requestId = typeof data.requestId === "string" ? data.requestId : undefined;
          await sendToken(requestId);
        })();
      }
      if (data.type === "engine:paywall") {
        // The free generation has already happened by the time this fires —
        // show the membership offer in place instead of bouncing to /pricing.
        setState("locked");
        setLockedReason(typeof data.message === "string" ? data.message : null);
        try { window.scrollTo({ top: 0 }); } catch { /* ignore */ }
      }

      if (data.type === "engine:generate-graphic" && typeof data.caption === "string") {
        const requestId = typeof data.requestId === "string" ? data.requestId : "";
        (async () => {
          try {
            const out = await generateGraphicFn({
              data: {
                caption: data.caption.slice(0, 8000),
                title: typeof data.title === "string" ? data.title.slice(0, 200) : undefined,
                projectId: defaultProjectId ?? undefined,
              } as never,
            });
            iframeRef.current?.contentWindow?.postMessage(
              { type: "engine:graphic-ready", requestId, url: out.url, path: out.path },
              "*",
            );
            toast.success("Graphic ready — attached to this post");
          } catch (err) {
            const message = err instanceof Error ? err.message : "Could not generate the graphic";
            iframeRef.current?.contentWindow?.postMessage(
              { type: "engine:graphic-error", requestId, message },
              "*",
            );
            toast.error(message);
          }
        })();
      }

      if (data.type === "engine:refine-graphic" && typeof data.instruction === "string") {
        const requestId = typeof data.requestId === "string" ? data.requestId : "";
        (async () => {
          try {
            const out = await refineGraphicFn({
              data: {
                instruction: data.instruction.slice(0, 500),
                imagePath: typeof data.imagePath === "string" ? data.imagePath : undefined,
                imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : undefined,
                projectId: defaultProjectId ?? undefined,
              } as never,
            });
            iframeRef.current?.contentWindow?.postMessage(
              { type: "engine:graphic-ready", requestId, url: out.url, path: out.path },
              "*",
            );
            toast.success("Graphic refined — updated on this post");
          } catch (err) {
            const message = err instanceof Error ? err.message : "Could not refine the graphic";
            iframeRef.current?.contentWindow?.postMessage(
              { type: "engine:graphic-error", requestId, message },
              "*",
            );
            toast.error(message);
          }
        })();
      }

      if (data.type === "engine:schedule" && typeof data.caption === "string") {
        const caption = data.caption.slice(0, 2800);
        (async () => {
          try {
            await saveContentFn({
              data: {
                projectId: defaultProjectId ?? undefined,
                caption,
                title: typeof data.title === "string" ? data.title.slice(0, 200) : undefined,
                media_url: typeof data.mediaUrl === "string" && data.mediaUrl ? data.mediaUrl.slice(0, 2000) : null,
                media_path: typeof data.mediaPath === "string" && data.mediaPath ? data.mediaPath.slice(0, 500) : null,
                status: "approved",
              } as never,
            });
            toast.success("Approved — find it in the Content Calendar dropdown");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not approve this post");
          }
        })();
      }
      if ((data.type === "engine:navigate" || data.type === "engine:navigate-parent") && typeof data.to === "string") {
        // The Engine may pass a query string (e.g. /calendar?review=1); the
        // router wants path and search separately.
        const [path, qs] = data.to.split("?");
        const search = qs
          ? Object.fromEntries(new URLSearchParams(qs).entries())
          : undefined;
        navigate(search ? ({ to: path, search } as never) : ({ to: path } as never));
      }
      // Module routing: the Engine asks us to reflect its current module in the
      // browser URL so Back / Forward and bookmarking work.
      if (data.type === "engine:set-hash" && typeof data.page === "string") {
        const hash = `#m=${data.page}`;
        if (window.location.hash !== hash) {
          // Go through the router so its location (and therefore sidebar links
          // and the hash watcher below) stays in sync with the Engine.
          navigate({ to: "/engine", hash: `m=${data.page}`, replace: !!data.replace });
        }

      }
      if (data.type === "engine:history-back") {
        window.history.back();
      }

      if (data.type === "engine:save-bank") {
        (async () => {
          try {
            if (!defaultProjectId) {
              toast.error("Sign in and set up a workspace first.");
              return;
            }
            const kind = (typeof data.kind === "string" ? data.kind : "post") as
              | "post"|"blog"|"email"|"headline"|"hook"|"cta"|"campaign"|"idea"|"image_prompt"|"other";
            let tags = Array.isArray(data.tags)
              ? data.tags.slice(0, 10).map((t: unknown) => String(t).slice(0, 40))
              : undefined;
            let collection = typeof data.collection === "string" ? data.collection.slice(0, 80) : undefined;
            // Posts written from the 90-day strategy file themselves under the
            // strategy's name and carry its pillar, so they can be filtered later.
            if (data.source === "strategy-captions") {
              let strategyName = "";
              try {
                const res = await strategyPlanFn({ data: { projectId: defaultProjectId } });
                strategyName = (res?.plan?.name ?? "").trim();
              } catch { /* fall back to the generic tag */ }
              const pillar = typeof data.pillar === "string" ? data.pillar.slice(0, 40) : "";
              tags = Array.from(
                new Set([...(tags ?? []), "90-day strategy", ...(pillar ? [pillar] : [])]),
              ).slice(0, 10);
              collection = collection ?? (strategyName ? strategyName.slice(0, 80) : "90-Day Strategy");
            }
            await saveBankFn({
              data: {
                projectId: defaultProjectId,
                kind,
                title: typeof data.title === "string" ? data.title.slice(0, 200) : undefined,
                body: typeof data.body === "string" ? data.body.slice(0, 20000) : undefined,
                tags,
                collection,
              },
            });
            toast.success("⭐ Saved to Content Bank");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Save failed");
          }
        })();
      }
      if (data.type === "engine:get-brain") {
        (async () => {
          try {
            const pid = typeof data.projectId === "string" ? data.projectId : undefined;
            const b = await brainFn({ data: pid ? { projectId: pid } : {} });
            iframeRef.current?.contentWindow?.postMessage(
              { type: "engine:brain", projectId: b.projectId, data: b.data },
              "*",
            );
           } catch { /* silent */ }
         })();
      }
      if (data.type === "engine:brain-append") {
        (async () => {
          try {
            const section = String(data.section || "");
            const field = String(data.field || "");
            const text = String(data.text || "").trim().slice(0, 4000);
            if (!section || !field || !text) return;
            const pid = typeof data.projectId === "string" ? data.projectId : defaultProjectId;
            const b = await brainFn({ data: pid ? { projectId: pid } : {} });
            const current = b.data as unknown as Record<string, Record<string, string | undefined>>;
            const existing = (current?.[section]?.[field] ?? "").toString().trim();
            const next = {
              ...current,
              [section]: { ...(current?.[section] ?? {}), [field]: existing ? `${existing}\n\n${text}` : text },
            };
            await updateBrainFn({ data: { projectId: b.projectId || undefined, data: next as unknown as BrainData } });
            toast.success("🧠 Saved to your Strategy Profile");
            iframeRef.current?.contentWindow?.postMessage({ type: "engine:brain", projectId: b.projectId, data: next }, "*");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Save failed");
          }
        })();
      }
      // Content lifecycle: the Engine stores written posts in the database so
      // they follow the user across devices and feed the Planner calendar.
      if (data.type === "engine:content-list") {
        (async () => {
          try {
            const pid = typeof data.projectId === "string" ? data.projectId : defaultProjectId;
            const rows = await listContentFn({ data: { projectId: pid ?? null } });
            iframeRef.current?.contentWindow?.postMessage({ type: "engine:content-data", projectId: pid ?? null, posts: rows }, "*");
          } catch { /* silent */ }
        })();
      }
      if (data.type === "engine:content-save" && data.post && typeof data.post === "object") {
        (async () => {
          try {
            const p = data.post as Record<string, unknown>;
            const saved = await saveContentFn({
              data: {
                ...(typeof p['id'] === "string" ? { id: p['id'] as string } : {}),
                project_id: typeof data.projectId === "string" ? data.projectId : defaultProjectId ?? null,
                caption: String(p['caption'] ?? p['body'] ?? "").slice(0, 20000),
                title: typeof p['title'] === "string" ? p['title'].slice(0, 300) : null,
                platform: String(p['platform'] ?? "linkedin").slice(0, 40),
                pillar: typeof p['pillar'] === "string" ? p['pillar'].slice(0, 120) : null,
                status: (["draft", "approved", "scheduled", "published"] as const).includes(p['status'] as never)
                  ? (p['status'] as "draft" | "approved" | "scheduled" | "published")
                  : "draft",
                plan_slot: typeof p['plan_slot'] === "string" ? p['plan_slot'].slice(0, 200) : null,
                hashtags: Array.isArray(p['hashtags']) ? (p['hashtags'] as unknown[]).slice(0, 40).map((h) => String(h).slice(0, 80)) : [],
                meta: {},
              },
            });
            iframeRef.current?.contentWindow?.postMessage({ type: "engine:content-saved", post: saved }, "*");
            window.dispatchEvent(new CustomEvent("ie:written-updated"));
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not save the post");
          }
        })();
      }
      if (data.type === "engine:content-delete" && typeof data.id === "string") {
        (async () => {
          try {
            await deleteContentFn({ data: { id: data.id as string } });
            window.dispatchEvent(new CustomEvent("ie:written-updated"));
          } catch { /* silent */ }
        })();
      }
      if (data.type === "engine:content-import" && Array.isArray(data.posts)) {
        (async () => {
          try {
            const posts = (data.posts as Record<string, unknown>[]).slice(0, 200).map((p) => ({
              project_id: typeof data.projectId === "string" ? data.projectId : defaultProjectId ?? null,
              caption: String(p['caption'] ?? p['body'] ?? "").slice(0, 20000),
              title: typeof p['title'] === "string" ? p['title'].slice(0, 300) : null,
              platform: String(p['platform'] ?? "linkedin").slice(0, 40),
              pillar: typeof p['pillar'] === "string" ? p['pillar'].slice(0, 120) : null,
              status: "draft" as const,
              hashtags: [],
              meta: {},
            }));
            const res = await importContentFn({ data: { posts } });
            if (res.imported > 0) toast.success(`Moved ${res.imported} saved post${res.imported === 1 ? "" : "s"} into your account`);
            const pid = typeof data.projectId === "string" ? data.projectId : defaultProjectId;
            const rows = await listContentFn({ data: { projectId: pid ?? null } });
            iframeRef.current?.contentWindow?.postMessage({ type: "engine:content-data", projectId: pid ?? null, posts: rows }, "*");
          } catch { /* silent */ }
        })();
      }
      // Home dashboard snapshot: real content counts + the most recently edited post.
      if (data.type === "engine:home-snapshot") {
        (async () => {
          try {
            const pid = typeof data.projectId === "string" ? data.projectId : defaultProjectId;
            const rows = await listContentFn({ data: { projectId: pid ?? null } });
            const now = Date.now();
            const weekEnd = now + 7 * 86400000;
            const drafted = rows.filter((r) => r.status === "draft").length;
            const approved = rows.filter((r) => r.status === "approved").length;
            const published = rows.filter((r) => r.status === "published").length;
            const scheduledThisWeek = rows.filter((r) => {
              if (r.status !== "scheduled" || !r.scheduled_at) return false;
              const t = new Date(r.scheduled_at).getTime();
              return t >= now && t <= weekEnd;
            }).length;

            // 90-day plan progress: measured from the first post created against a plan slot.
            const planRows = rows.filter((r) => !!r.plan_slot);
            let planDay: number | null = null;
            if (planRows.length) {
              const start = Math.min(...planRows.map((r) => new Date(r.created_at).getTime()));
              planDay = Math.min(90, Math.max(1, Math.floor((now - start) / 86400000) + 1));
            }

            const sorted = [...rows].sort(
              (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
            );
            const last = sorted[0];
            const recent = last
              ? {
                  id: last.id,
                  title: last.title,
                  caption: (last.caption || "").slice(0, 180),
                  platform: last.platform,
                  status: last.status,
                  updated_at: last.updated_at,
                }
              : null;

            iframeRef.current?.contentWindow?.postMessage(
              {
                type: "engine:home-snapshot-data",
                snapshot: { drafted, approved, published, scheduledThisWeek, planDay, planPosts: planRows.length, total: rows.length, recent },
              },
              "*",
            );
          } catch { /* snapshot is optional on the dashboard */ }
        })();
      }
      // Rich home dashboard: counts, channels, landing-page leads.
      if (data.type === "engine:dashboard") {
        (async () => {
          try {
            const pid = typeof data.projectId === "string" ? data.projectId : defaultProjectId;
            const snap = await dashboardFn({ data: { projectId: pid ?? null } });
            iframeRef.current?.contentWindow?.postMessage(
              { type: "engine:dashboard-data", dashboard: snap },
              "*",
            );
          } catch { /* dashboard extras are optional */ }
        })();
      }
      if (data.type === "engine:leads-list") {

        (async () => {
          try {
            const [res, stats] = await Promise.all([listLeadsFn({ data: { limit: 20 } }), leadStatsFn()]);
            iframeRef.current?.contentWindow?.postMessage(
              { type: "engine:leads", leads: res.leads, today: stats.today, total: stats.total },
              "*",
            );
          } catch { /* leads are optional on the dashboard */ }
        })();
      }
      if (data.type === "engine:lead-reply" && typeof data.id === "string" && typeof data.message === "string") {
        (async () => {
          try {
            const out = await replyToLeadFn({ data: { id: data.id as string, message: (data.message as string).slice(0, 500) } });
            if (out.ok) toast.success("Reply sent");
            else toast.error(out.error);
            const [res, stats] = await Promise.all([listLeadsFn({ data: { limit: 20 } }), leadStatsFn()]);
            iframeRef.current?.contentWindow?.postMessage(
              { type: "engine:leads", leads: res.leads, today: stats.today, total: stats.total },
              "*",
            );
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not send that reply");
          }
        })();
      }
      if (data.type === "engine:get-plan" || data.type === "engine:generation-complete") {
        (async () => {
          try {
            const p = await planUsageFn();
            if (mountedRef.current && p.tier === "none") {
              setFreeRemaining(p.limit == null ? 999999 : Math.max(0, p.limit - p.used));
            }
            iframeRef.current?.contentWindow?.postMessage({ type: "engine:plan", ...p }, "*");
          } catch { /* silent */ }
        })();
      }

    }
    window.addEventListener("message", onMsg);
    // Also proactively push a fresh token whenever Supabase refreshes/rotates it.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN" || event === "USER_UPDATED") {
        sendToken();
      }
    });
    return () => {
      window.removeEventListener("message", onMsg);
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultProjectId]);

  // Forward hash / history changes (e.g. /engine#m=voice) to the iframe so the
  // browser Back and Forward buttons move between Engine modules.
  useEffect(() => {
    function forward(fromHistory: boolean) {
      const m = /m=([a-z]+)/i.exec(window.location.hash || "");
      const page = m ? m[1]!.toLowerCase() : "home";
      iframeRef.current?.contentWindow?.postMessage(
        { type: "engine:nav", page, fromHistory },
        "*",
      );
    }
    const onHash = () => forward(true);
    const onPop = () => forward(true);
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  // Sidebar links navigate through the router (pushState), which never fires a
  // native `hashchange` — so watch the router's own hash and forward that too.
  const routerHash = useRouterState({ select: (s) => s.location.hash });
  useEffect(() => {
    const m = /m=([a-z]+)/i.exec(routerHash || "");
    const page = m ? m[1]!.toLowerCase() : "home";
    iframeRef.current?.contentWindow?.postMessage({ type: "engine:nav", page, fromHistory: true }, "*");
  }, [routerHash]);

  // The unified context bar owns client selection — forward it to the Engine.
  useEffect(() => {
    const onClient = (e: Event) => {
      const pid = (e as CustomEvent<{ projectId?: string }>).detail?.projectId;
      if (!pid) return;
      iframeRef.current?.contentWindow?.postMessage(
        { type: "engine:switch-project", projectId: pid },
        "*",
      );
      void refreshProjectContext(pid);
    };
    window.addEventListener(CLIENT_CHANGED_EVENT, onClient as EventListener);
    return () => window.removeEventListener(CLIENT_CHANGED_EVENT, onClient as EventListener);
  }, []);




  async function sendToken(requestId?: string) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    iframeRef.current?.contentWindow?.postMessage(
      { type: "engine:auth", token, requestId },
      "*",
    );
  }

  function sendProjects() {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "engine:projects", projects, activeProjectId: defaultProjectId },
      "*",
    );
  }

  // A user's Brain is "ready" (State B) once the essential fields are filled.
  // These three fields are the minimum needed for the AI to produce on-brand
  // output. We check them explicitly instead of relying on the % score so the
  // switch is deterministic and doesn't drift as we add more optional fields.
  function computeBrainReady(d: BrainData | null): boolean {
    if (!d) return false;
    const trimmed = (v?: string) => (v ?? "").trim();
    const hasName = trimmed(d.business?.name).length > 0;
    const hasVoice = trimmed(d.brand?.tone_of_voice).length > 0;
    const hasAudience = trimmed(d.audience?.ideal_customer).length > 0;
    return hasName && hasVoice && hasAudience;
  }

  function sendBrainScore() {
    if (!iframeRef.current?.contentWindow) return;
    const loaded = brainScore !== null;
    iframeRef.current.contentWindow.postMessage(
      {
        type: "engine:brain-score",
        score: brainScore ?? 0,
        ready: computeBrainReady(brainData),
        loaded,
        isAnonymous,
      },
      "*",
    );
  }

  async function sendPlan() {
    try {
      const p = await planUsageFn();
      iframeRef.current?.contentWindow?.postMessage({ type: "engine:plan", ...p }, "*");
    } catch { /* silent */ }
  }

  function sendUser() {
    if (!iframeRef.current?.contentWindow) return;
    // Prefer explicit metadata name; else derive a nice-looking name from the email local-part.
    // Reject junk like "info", "hello", "admin", "team" which aren't personal names.
    const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
    let firstName = "";
    if (userName) {
      firstName = cap(userName.split(/\s+/)[0]);
    } else if (userEmail) {
      const local = userEmail.split("@")[0].replace(/[._\-+]+/g, " ").trim();
      const first = local.split(/\s+/)[0] || "";
      const junk = new Set(["info","hello","hi","admin","team","contact","support","sales","noreply","no-reply","mail"]);
      if (first && !junk.has(first.toLowerCase()) && !/^\d/.test(first) && first.length >= 2) {
        firstName = cap(first);
      }
    }
    iframeRef.current.contentWindow.postMessage(
      { type: "engine:user", firstName, email: userEmail, isAnonymous },
      "*",
    );
  }

  // Re-broadcast projects + brain score + user identity to the iframe whenever they change
  useEffect(() => {
    sendProjects();
    sendBrainScore();
    sendUser();
    // Push initial plan/usage snapshot (counter widget)
    void sendPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, defaultProjectId, brainScore, brainData, userEmail, userName, isAnonymous]);


  async function startCheckout(creds?: { email: string; password: string }) {
    setCheckoutBusy(true);
    try {
      // If the user is anonymous, upgrade them with email+password first so
      // their membership is permanently tied to a real account.
      if (isAnonymous) {
        if (!creds?.email || !creds?.password) {
          throw new Error("Enter an email and password to save your membership.");
        }
        const { error: upErr } = await supabase.auth.updateUser({
          email: creds.email,
          password: creds.password,
        });
        if (upErr) throw upErr;
        setUserEmail(creds.email);
        setIsAnonymous(false);
      }
      const res = await membershipCheckoutFn({ data: { origin: window.location.origin } });
      if (res.url) window.location.href = res.url;
      else throw new Error(res.error || "Could not start checkout");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setCheckoutBusy(false);
    }
  }


  async function signOut() {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") window.location.assign("/");
  }


  if (state === "loading" || verifying) {
    return <Shell>{verifying ? "Verifying payment…" : "Loading your Engine…"}</Shell>;
  }
  if (state === "error") return <Shell>Couldn't load your access. Try refreshing.</Shell>;

  if (state === "locked") {
    return (
      <Shell>
        <Paywall
          onCheckout={startCheckout}
          busy={checkoutBusy}
          email={userEmail}
          isAnonymous={isAnonymous}
          onSignOut={signOut}
          headline="THAT'S YOUR"
          headlineAccent="FREE GENERATION."
          sub={
            lockedReason ??
            "You've seen what haaylo writes with your Brain behind it. Join to keep the Engine, your strategy and your planner."
          }
          showHome
        />
      </Shell>
    );
  }



  // unlocked or trial → render iframe with a slim top status bar so nothing
  // overlaps the engine's own header on mobile.
  return (
    <>
      {/* One unified grouped menu, shared with the rest of the app */}
      <aside
        className="hidden md:flex"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: 260,
          background: "#FFFFFF",
          borderRight: "1px solid #E6E6EC",
          flexDirection: "column",
          zIndex: 40,
          paddingTop: "max(16px, env(safe-area-inset-top))",
        }}
      >
        <div style={{ padding: "22px 20px 14px" }}>
          <Link to="/engine" aria-label="Haaylo home" style={{ display: "block" }}>
            <img
              src={wordmarkAsset.url}
              alt="Haaylo"
              style={{
                display: "block",
                width: "100%",
                maxWidth: 320,
                height: "auto",
                filter: "drop-shadow(0 4px 10px rgba(255,92,147,0.25))",
              }}
            />
          </Link>
        </div>
        <WorkflowSidebar />
      </aside>

      {menuOpen && (
        <div
          className="md:hidden"
          style={{ position: "fixed", inset: 0, background: "rgba(23,29,65,0.28)", zIndex: 50 }}
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        className="flex md:hidden"
        style={{
          position: "fixed",
          top: 0,
          left: menuOpen ? 0 : -280,
          bottom: 0,
          width: 240,
          background: "#FFFFFF",
          borderRight: "1px solid #E6E6EC",
          flexDirection: "column",
          zIndex: 60,
          transition: "left .25s ease",
          paddingTop: "max(16px, env(safe-area-inset-top))",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 4px" }}>
          <Link to="/engine" aria-label="Haaylo home" style={{ display: "block", maxWidth: 150 }}>
            <img
              src={wordmarkAsset.url}
              alt="Haaylo"
              style={{ display: "block", width: "100%", height: "auto" }}
            />
          </Link>
          <button
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
            style={{ background: "none", border: "none", color: "#171D41", fontSize: 18, cursor: "pointer" }}
          >
            ✕
          </button>
        </div>
        <WorkflowSidebar onNavigate={() => setMenuOpen(false)} initialHub={mobileHub} />
      </aside>

    <div
      className="eng-shell"
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,

        background: "#FAFAFC",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Poppins', sans-serif",
      }}
    >
      <h1 className="sr-only">haaylo.com Inbound Engine — Brand Voice, Strategy, Content, Funnel & SEO</h1>
      <style>{`
        .eng-topbar-logo{ height:64px; }
        .eng-beta-full{ display:inline; }
        .eng-beta-short{ display:none; }
        .eng-shell{ left:0; }
        @media (min-width: 768px){ .eng-shell{ left:260px; } }
        @media (max-width: 767px){ .eng-shell{ padding-bottom: calc(56px + env(safe-area-inset-bottom)); } }
        @media (max-width: 640px){
          .eng-topbar-logo{ height:40px; }
          .eng-beta-full{ display:none; }
          .eng-beta-short{ display:inline; }
          .eng-brain-banner-wrap{ font-size:12px !important; padding:8px 12px !important; }
        }
        /* Floating Brainstorm button: icon + label on desktop, icon-only on phones */
        .eng-fab-chat{ transition: transform .15s ease, box-shadow .15s ease; }
        .eng-fab-chat:hover{ transform: translateY(-1px); }
        @media (max-width: 640px){
          .eng-fab-label{ display:none; }
          .eng-fab-chat{ padding:12px; }
        }
      `}</style>

      <div
        style={{
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "8px 14px",
          paddingTop: "max(8px, env(safe-area-inset-top))",
          background: "#FFFFFF",
          borderBottom: "1px solid #E6E6EC",
          color: "#171D41",
          fontSize: 12,
          fontWeight: 600,
          minHeight: 56,
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            className="md:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            style={{ background: "none", border: "none", color: "#171D41", fontSize: 18, cursor: "pointer", padding: 0 }}
          >
            ☰
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {!isAnonymous && (
            <Link to="/brain/setup" style={pill("#A855F7")}>Brain</Link>
          )}







          {isAnonymous ? (
            <Link
              to="/auth"
              style={{
                background: "transparent",
                color: "#553EA2",
                border: "1px solid #B9ADDA",
                padding: "6px 12px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              Sign in
            </Link>
          ) : (
            <button
              onClick={signOut}
              style={{
                background: "transparent",
                color: "#171D41",
                border: "1px solid #CECDD4",
                padding: "6px 12px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Sign out
            </button>
          )}
        </div>

      </div>

      <ContextBar />






      {false && topRecs.length > 0 && null /* Director suggests strip hidden */}

      {/* iOS Safari renders <iframe flex:1> at 0 height inside a position:fixed
          flex column. Wrap in a positioned container and absolutely fill it. */}
      <div style={{ flex: 1, position: "relative", minHeight: 0, width: "100%", background: "#FAFAFC" }}>
        <iframe
          ref={iframeRef}
          title="haaylo.com Engine"
          src={`/engine/index.html?v=20260918-light${typeof window !== "undefined" && window.location.hash ? window.location.hash : ""}`}
          onLoad={() => { sendToken(); sendProjects(); sendBrainScore(); sendUser(); }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, display: "block", background: "#FAFAFC" }}
          allow="clipboard-read; clipboard-write"
        />
      </div>

      {/* Always-visible floating Brainstorm button — opens the chat module
          without digging through the side menu. */}
      <button
        onClick={() => navigate({ to: "/engine", hash: "m=chat" })}
        aria-label="Open Brainstorm chat"
        style={{
          position: "fixed",
          right: "max(16px, env(safe-area-inset-right))",
          bottom: "calc(72px + env(safe-area-inset-bottom))",
          zIndex: 45,
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "#553EA2",
          color: "#fff",
          border: "1px solid #553EA2",
          borderRadius: 8,
          padding: "10px 16px 10px 12px",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: "0 8px 24px rgba(23,29,65,0.16)",
        }}
        className="eng-fab-chat"
      >
        <img src={iconBrainstorm} alt="" style={{ width: 20, height: 20 }} />
        <span className="eng-fab-label">Brainstorm</span>
      </button>

    </div>

    <MobileTabs onOpenHub={(hubId) => { setMobileHub(hubId); setMenuOpen(true); }} />
    </>
  );

}

function pill(color: string): React.CSSProperties {
  return {
    background: "transparent",
    color,
    border: `1px solid ${color}66`,
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    textDecoration: "none",
    whiteSpace: "nowrap",
  };
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "#FAFAFC", color: "#171D41", fontFamily: "'Poppins', system-ui, sans-serif" }}
    >
      {typeof children === "string" ? <div style={{ opacity: 0.75 }}>{children}</div> : children}
    </div>
  );
}

function Paywall({
  onCheckout,
  busy,
  email,
  isAnonymous,
  onSignOut,
  headline = "ONE MEMBERSHIP.",
  headlineAccent = "EVERYTHING UNLOCKED.",
  sub = "Strategy Profile, Engine, strategy, planner and content — all in one membership. Cancel anytime.",
  showHome = false,
}: {
  onCheckout: (creds?: { email: string; password: string }) => void;
  busy: boolean;
  email: string | null;
  isAnonymous: boolean;
  onSignOut: () => void;
  headline?: string;
  headlineAccent?: string;
  sub?: string;
  showHome?: boolean;
}) {
  const stage = stageForDate();
  const [pwEmail, setPwEmail] = useState("");
  const [pwPass, setPwPass] = useState("");
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isAnonymous) onCheckout({ email: pwEmail, password: pwPass });
    else onCheckout();
  }
  return (
    <div
      className="w-full max-w-xl rounded-3xl p-6 sm:p-8 text-center"
      style={{
        background: "#FFFFFF",
        border: "1px solid #E6E6EC",
        boxShadow: "0 24px 70px rgba(23,29,65,0.14)",
      }}
    >
      <h1
        className="text-[24px] sm:text-[32px]"
        style={{ fontFamily: "'Poppins', sans-serif", lineHeight: 1.1, marginBottom: 8, color: "#171D41" }}
      >
        {headline} <span style={{ color: "#FF5C93" }}>{headlineAccent}</span>
      </h1>
      <p className="text-sm" style={{ color: "#171D41", marginBottom: 18, lineHeight: 1.5 }}>{sub}</p>

      <div
        className="rounded-2xl p-4 text-left"
        style={{ background: "rgba(255,92,147,0.10)", border: "2px solid #FF5C93", marginBottom: 18 }}
      >
        <div style={{ fontWeight: 900, fontSize: 13, letterSpacing: ".06em", color: "#FF5C93", textTransform: "uppercase" }}>
          {stage.title}
        </div>
        <div style={{ fontFamily: "'Poppins', sans-serif", fontSize: 34, color: "#171D41", lineHeight: 1.1, marginTop: 6, fontWeight: 700 }}>
          {stage.amount}
          <span style={{ fontSize: 12, color: "#171D41", fontWeight: 400, marginLeft: 6 }}>
            {stage.membershipType === "standard" ? "/month" : "for your first year"}
          </span>
        </div>
        <div style={{ fontSize: 12, color: "#FBCFE8", fontWeight: 700, marginTop: 6 }}>{stage.disclosure}</div>
        {stage.deadline && (
          <div style={{ fontSize: 11.5, color: "#171D41", marginTop: 2 }}>{stage.deadline}</div>
        )}
        <ul style={{ marginTop: 12, fontSize: 12.5, color: "#171D41", lineHeight: 1.6, paddingLeft: 0, listStyle: "none" }}>
          {MEMBERSHIP_FEATURES.map((f) => (
            <li key={f}>✓ {f}</li>
          ))}
        </ul>
      </div>


      <form onSubmit={submit} className="space-y-3 text-left">
        {isAnonymous && (
          <>
            <p style={{ color: "#171D41", fontSize: 12, textAlign: "center", marginBottom: 4 }}>
              Create an account so your plan is saved to you.
            </p>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={pwEmail}
              onChange={(e) => setPwEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl outline-none"
              style={{ background: "#FFFFFF", border: "1px solid #CECDD4", color: "#171D41" }}
            />
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              placeholder="Password (min 6 chars)"
              value={pwPass}
              onChange={(e) => setPwPass(e.target.value)}
              className="w-full px-4 py-3 rounded-xl outline-none"
              style={{ background: "#FFFFFF", border: "1px solid #CECDD4", color: "#171D41" }}
            />
          </>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full py-4 rounded-xl font-bold transition disabled:opacity-50"
          style={{
            background: "#553EA2",
            color: "#FFFFFF",
            fontSize: 16,
          }}
        >
          {busy ? "Opening checkout…" : `${stage.cta} →`}

        </button>
      </form>

      {showHome && (
        <div className="mt-4 text-xs" style={{ color: "#171D41" }}>
          Not ready yet?{" "}
          <Link to="/" style={{ color: "#A855F7", fontWeight: 700 }}>Back to home</Link>
        </div>
      )}



      {!isAnonymous && (
        <div className="mt-5 flex items-center justify-between gap-3 text-xs" style={{ color: "#171D41" }}>
          <span className="truncate">{email}</span>
          <button onClick={onSignOut} className="shrink-0" style={{ color: "#A855F7" }}>Sign out</button>
        </div>
      )}
      {isAnonymous && (
        <p className="mt-4 text-xs" style={{ color: "#171D41" }}>
          Already have an account?{" "}
          <a href="/auth" style={{ color: "#A855F7", fontWeight: 700 }}>Sign in</a>
        </p>
      )}
    </div>
  );
}

function pickNextNudge(brain: BrainData): string | null {
  for (const s of BRAIN_SECTIONS) {
    const sect = (brain as Record<string, Record<string, string | undefined>>)[s.key];
    for (const f of s.fields) {
      const v = sect?.[f.key];
      if (!v || !String(v).trim()) return f.label.toLowerCase();
    }
  }
  return null;
}
