import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { NAVY, LINE, GREY, PINK } from "@/lib/theme";

export type InjectableLink = {
  id: string;
  title: string;
  slug: string;
  url: string;
  status?: string | null;
};

/** Keeps only live pages, in case the caller passes everything it has. */
export function liveLinks(links: InjectableLink[] | undefined | null): InjectableLink[] {
  return (links ?? []).filter((l) => !l.status || l.status === "live");
}

/** Appends the link on a new line at the end. Never adds the same URL twice. */
export function appendLink(body: string | null | undefined, url: string): string {
  const text = (body ?? "").replace(/\s+$/, "");
  if (text.includes(url)) return text;
  return text ? `${text}\n\n${url}` : url;
}

export function shortLabel(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

const PANEL: React.CSSProperties = {
  position: "absolute",
  zIndex: 60,
  top: "calc(100% + 6px)",
  left: 0,
  minWidth: 240,
  maxWidth: 320,
  background: "#FFFFFF",
  border: `1px solid ${LINE}`,
  borderRadius: 12,
  boxShadow: "0 18px 40px rgba(20,20,40,0.16)",
  overflow: "hidden",
  padding: 6,
  display: "grid",
  gap: 4,
};

export function LinkInjector({
  links,
  onInject,
  buttonStyle,
  label = "Inject link",
  disabled,
}: {
  links: InjectableLink[];
  onInject: (link: InjectableLink) => void;
  buttonStyle: React.CSSProperties;
  label?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);
  const available = liveLinks(links);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const click = () => {
    if (available.length === 1) {
      onInject(available[0]!);
      setOpen(false);
      return;
    }
    setOpen((v) => !v);
  };

  return (
    <div ref={wrap} style={{ position: "relative", display: "inline-flex" }}>
      <button type="button" style={buttonStyle} onClick={click} disabled={disabled}>
        {label}
      </button>

      {open && (
        <div style={PANEL}>
          {available.length === 0 ? (
            <div style={{ padding: "8px 10px", display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12.5, color: "rgba(255,255,255,.78)" }}>
                You don&rsquo;t have a live landing page yet.
              </span>
              <Link
                to="/landing"
                style={{ fontSize: 12.5, fontWeight: 700, color: PINK, textDecoration: "none" }}
                onClick={() => setOpen(false)}
              >
                Build one now →
              </Link>
            </div>
          ) : (
            available.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  onInject(l);
                  setOpen(false);
                }}
                style={{
                  textAlign: "left",
                  background: "transparent",
                  border: 0,
                  color: "#fff",
                  padding: "8px 10px",
                  borderRadius: 9,
                  cursor: "pointer",
                  display: "grid",
                  gap: 2,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700 }}>{l.title || "Untitled page"}</span>
                <span style={{ fontSize: 11.5, opacity: 0.65 }}>{shortLabel(l.url)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
