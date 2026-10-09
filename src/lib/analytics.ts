// Lightweight GA4 helper — safe to call before gtag has loaded.
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export const GA4_ID = "G-P5X4HF0GSG";

export function gaEvent(name: string, params?: Record<string, unknown>) {
  try {
    if (typeof window === "undefined") return;
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag === "function") {
      window.gtag("event", name, params ?? {});
    } else {
      window.dataLayer.push({ event: name, ...(params ?? {}) });
    }
  } catch {
    /* silent */
  }
}

export function gaPageView(path: string, title?: string) {
  try {
    if (typeof window === "undefined") return;
    if (typeof window.gtag === "function") {
      window.gtag("event", "page_view", {
        page_path: path,
        page_title: title ?? document.title,
        page_location: window.location.href,
      });
    }
  } catch {
    /* silent */
  }
}

/** Fire callback exactly once per browser (keyed in localStorage). */
export function gaOnce(key: string, cb: () => void) {
  try {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(key) === "1") return;
    localStorage.setItem(key, "1");
    cb();
  } catch {
    cb();
  }
}
