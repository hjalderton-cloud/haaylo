import { useEffect, useRef, useState, createContext, useContext, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Standard display for any AI-generated content across the app.
 * Collapsed: title + 1–2 line truncated preview + chevron.
 * Expanded: full content, animated height.
 * Locked: blurred real content + 🔒, click opens the upgrade modal.
 */

type AccordionCtx = {
  openId: string | null;
  expandAll: boolean;
  toggle: (id: string) => void;
};

const Ctx = createContext<AccordionCtx | null>(null);

export function GeneratedContentList({
  children,
  count,
  className,
}: {
  children: ReactNode;
  count?: number;
  className?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [expandAll, setExpandAll] = useState(false);

  return (
    <Ctx.Provider
      value={{
        openId,
        expandAll,
        toggle: (id) => {
          setExpandAll(false);
          setOpenId((cur) => (cur === id ? null : id));
        },
      }}
    >
      <div className={cn("flex flex-col gap-2", className)}>
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {count != null ? `${count} item${count === 1 ? "" : "s"}` : ""}
          </span>
          <button
            type="button"
            onClick={() => {
              setOpenId(null);
              setExpandAll((v) => !v);
            }}
            className="text-[12px] font-semibold text-primary hover:underline"
          >
            {expandAll ? "Collapse all" : "Expand all"}
          </button>
        </div>
        <div className="flex flex-col gap-1.5">{children}</div>
      </div>
    </Ctx.Provider>
  );
}

export function GeneratedContentCard({
  id,
  title,
  preview,
  children,
  locked = false,
  onLockedClick,
}: {
  id: string;
  title: string;
  preview: string;
  children: ReactNode;
  locked?: boolean;
  onLockedClick?: () => void;
}) {
  const ctx = useContext(Ctx);
  const [soloOpen, setSoloOpen] = useState(false);
  const open = locked ? false : ctx ? ctx.expandAll || ctx.openId === id : soloOpen;

  const bodyRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (bodyRef.current) setHeight(bodyRef.current.scrollHeight);
  }, [children, open]);

  return (
    <div className="rounded-xl bg-muted/40 transition-colors hover:bg-muted/60">
      <button
        type="button"
        onClick={() => (locked ? onLockedClick?.() : ctx ? ctx.toggle(id) : setSoloOpen((v) => !v))}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold tracking-tight text-foreground">{title}</div>
          <div
            className={cn(
              "mt-0.5 line-clamp-2 min-h-[2.4em] text-[13px] leading-[1.2em] text-muted-foreground",
              locked && "select-none blur-[5px]",
            )}
          >
            {open ? "" : preview}
          </div>
        </div>
        <span
          className={cn(
            "mt-0.5 shrink-0 text-[12px] text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        >
          {locked ? "🔒" : "▾"}
        </span>
      </button>
      <div
        style={{ height: open ? height : 0 }}
        className="overflow-hidden transition-[height] duration-300 ease-out"
      >
        <div ref={bodyRef} className="px-4 pb-4 text-[14px] leading-relaxed text-foreground">
          {children}
        </div>
      </div>
    </div>
  );
}

export function FreeGenerationCounter({ used, limit = 5 }: { used: number; limit?: number }) {
  const left = Math.max(0, limit - used);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-[12px] font-semibold text-muted-foreground">
      ⚡ {left} of {limit} free generations left
    </span>
  );
}

export default GeneratedContentCard;
