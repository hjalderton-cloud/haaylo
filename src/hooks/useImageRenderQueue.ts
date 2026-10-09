import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateCampaignImage } from "@/lib/campaign-assets.functions";

export type RenderState = { status: string; url: string | null; path: string | null; error: string | null };
type Item = { id: string; imageStatus?: string | undefined; url: string | null };

/**
 * Renders queued image-pack briefs one at a time (stale "generating" items are
 * picked up too), and exposes retry/generate for failed or brief-only items.
 */
export function useImageRenderQueue(items: Item[], onDone?: () => void) {
  const render = useServerFn(generateCampaignImage);
  const [state, setState] = useState<Record<string, RenderState>>({});
  const started = useRef(new Set<string>());
  const busy = useRef(false);
  const queue = useRef<string[]>([]);

  const pump = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    while (queue.current.length) {
      const id = queue.current.shift()!;
      setState((s) => ({ ...s, [id]: { status: "generating", url: null, path: null, error: null } }));
      try {
        const res = await render({ data: { id } });
        setState((s) => ({ ...s, [id]: { status: res.status, url: res.url, path: res.path, error: res.error } }));
      } catch (e) {
        setState((s) => ({ ...s, [id]: { status: "failed", url: null, path: null, error: e instanceof Error ? e.message : "Image generation failed." } }));
      }
    }
    busy.current = false;
    onDone?.();
  }, [render, onDone]);

  const enqueue = useCallback((id: string) => {
    if (!queue.current.includes(id)) queue.current.push(id);
    setState((s) => ({ ...s, [id]: { status: "queued", url: null, path: null, error: null } }));
    void pump();
  }, [pump]);

  useEffect(() => {
    for (const it of items) {
      const st = it.imageStatus;
      if ((st === "queued" || st === "generating") && !it.url && !started.current.has(it.id)) {
        started.current.add(it.id);
        enqueue(it.id);
      }
    }
  }, [items, enqueue]);

  const view = (it: Item): RenderState =>
    state[it.id] ?? { status: it.url ? "ready" : (it.imageStatus ?? "brief"), url: it.url, path: null, error: null };

  return { view, retry: enqueue };
}
