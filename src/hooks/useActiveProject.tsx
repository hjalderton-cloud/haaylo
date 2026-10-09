import { createContext, useCallback, useContext, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listProjects } from "@/lib/brain.functions";

/** localStorage key written by the client switcher in the nav. */
export const ACTIVE_PROJECT_KEY = "ie-active-project";
/** Same string as CLIENT_CHANGED_EVENT in WorkflowNav (kept local to avoid a component import). */
export const ACTIVE_PROJECT_EVENT = "haaylo:client-changed";

export type Workspace = { id: string; name: string; is_default: boolean };

type ActiveProjectContextValue = {
  projectId: string;
  projectName: string;
  projects: Workspace[];
  ready: true;
  selectProject: (projectId: string) => void;
};

const ActiveProjectContext = createContext<ActiveProjectContextValue | null>(null);

export function readActiveProjectId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_PROJECT_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * The client (project) currently selected in the nav switcher.
 * Re-renders whenever the user picks a different client.
 */
export function useActiveProject(): string | null {
  return useActiveProjectState().projectId;
}

/**
 * Same as useActiveProject, plus `ready`: false until localStorage has been read
 * on the client. Use it to hold off workspace-scoped fetches, otherwise the first
 * request runs with no workspace and the server falls back to the default one.
 */
export function useActiveProjectState(): { projectId: string | null; projectName: string; ready: boolean } {
  const shared = useContext(ActiveProjectContext);
  if (shared) return shared;

  const [projectId, setProjectId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setProjectId(readActiveProjectId());
    setReady(true);
    const onChange = (e: Event) => {
      const id = (e as CustomEvent<{ projectId?: string }>).detail?.projectId;
      setProjectId(id ?? readActiveProjectId());
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVE_PROJECT_KEY) setProjectId(e.newValue || null);
    };
    window.addEventListener(ACTIVE_PROJECT_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(ACTIVE_PROJECT_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return { projectId, projectName: "", ready };
}

export function useWorkspace(): ActiveProjectContextValue {
  const value = useContext(ActiveProjectContext);
  if (!value) throw new Error("Workspace state is unavailable.");
  return value;
}

/** Loads and validates the selected workspace once before any signed-in screen renders. */
export function ActiveProjectProvider({ children }: { children: ReactNode }) {
  const projectsFn = useServerFn(listProjects);
  const [projects, setProjects] = useState<Workspace[]>([]);
  const [projectId, setProjectId] = useState("");
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = (await projectsFn()) as Workspace[];
        if (cancelled) return;
        const stored = readActiveProjectId();
        const selected = rows.find((project) => project.id === stored)
          ?? rows.find((project) => project.is_default)
          ?? rows[0];
        setProjects(rows);
        setProjectId(selected?.id ?? "");
        setLoadError(rows.length === 0 ? "No workspace found for this account." : null);
        if (selected) {
          try { window.localStorage.setItem(ACTIVE_PROJECT_KEY, selected.id); } catch { /* ignore */ }
        }
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        // Signed-out visitors land here (the server fn requires auth) — send them to sign in.
        if (/unauthor|401|no authorization/i.test(message)) {
          const redirect = `${window.location.pathname}${window.location.search}${window.location.hash}`;
          window.location.assign(`/auth?redirect=${encodeURIComponent(redirect)}`);
          return;
        }
        setLoadError("We couldn't load your workspaces.");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [projectsFn, attempt]);

  const selectProject = useCallback((nextId: string) => {
    if (!projects.some((project) => project.id === nextId)) return;
    setProjectId(nextId);
    try { window.localStorage.setItem(ACTIVE_PROJECT_KEY, nextId); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent(ACTIVE_PROJECT_EVENT, { detail: { projectId: nextId } }));
  }, [projects]);

  const selected = projects.find((project) => project.id === projectId);
  const value = useMemo<ActiveProjectContextValue | null>(() => {
    if (!ready || !selected) return null;
    return {
      projectId: selected.id,
      projectName: selected.name,
      projects,
      ready: true,
      selectProject,
    };
  }, [projects, ready, selectProject, selected]);

  if (!value) {
    const shell: CSSProperties = {
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      background: "#141B3D",
      color: "#C9CDE6",
      textAlign: "center",
      padding: 24,
    };
    if (ready && loadError) {
      return (
        <div style={shell}>
          <div style={{ display: "grid", gap: 12, justifyItems: "center" }}>
            <p style={{ margin: 0 }}>{loadError}</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => { setReady(false); setLoadError(null); setAttempt((n) => n + 1); }}
                style={{ padding: "8px 14px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "#F5F3FF", cursor: "pointer" }}
              >
                Try again
              </button>
              <a
                href="/auth"
                style={{ padding: "8px 14px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.2)", color: "#F5F3FF", textDecoration: "none" }}
              >
                Sign in
              </a>
            </div>
          </div>
        </div>
      );
    }
    return <div style={shell}>Loading workspace…</div>;
  }

  return <ActiveProjectContext.Provider value={value}>{children}</ActiveProjectContext.Provider>;
}
