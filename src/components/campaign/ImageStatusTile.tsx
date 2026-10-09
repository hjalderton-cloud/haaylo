import type { RenderState } from "@/hooks/useImageRenderQueue";

/** Shows a rendered image, or its generating / failed / brief-only state with a retry. */
export function ImageStatusTile({ view, alt, onRetry }: { view: RenderState; alt: string; onRetry: () => void }) {
  const box: React.CSSProperties = {
    width: "100%", aspectRatio: "1 / 1", borderRadius: 10, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", gap: 8, padding: 12, textAlign: "center", fontSize: 12,
    background: "var(--muted)", color: "var(--muted-foreground)", boxSizing: "border-box",
  };
  const btn: React.CSSProperties = {
    border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)",
    borderRadius: 999, padding: "5px 12px", fontSize: 12, cursor: "pointer",
  };
  if (view.url) {
    return <img src={view.url} alt={alt} loading="lazy" style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 10, display: "block" }} />;
  }
  if (view.status === "queued" || view.status === "generating") {
    return (
      <div style={box} role="status">
        <div className="animate-pulse">{view.status === "queued" ? "Waiting its turn…" : "Creating image…"}</div>
        <div style={{ fontSize: 11 }}>This can take up to a minute.</div>
      </div>
    );
  }
  if (view.status === "failed") {
    return (
      <div style={{ ...box, color: "var(--destructive)" }} role="alert">
        <strong>Image failed</strong>
        <div style={{ color: "var(--muted-foreground)" }}>{view.error ?? "Something went wrong."}</div>
        <button type="button" style={btn} onClick={onRetry}>Retry</button>
      </div>
    );
  }
  return (
    <div style={box}>
      <div>Brief only, no image yet.</div>
      <button type="button" style={btn} onClick={onRetry}>Generate image</button>
    </div>
  );
}
