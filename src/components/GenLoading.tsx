/**
 * Shared AI generation loading state: spinner, time estimate and a
 * looping indeterminate progress bar. Matches the engine's .gen-loading styles.
 */
export function GenLoading({
  label = "Generating…",
  estimate = "Usually takes about 30 seconds",
}: {
  label?: string;
  estimate?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        padding: "20px 0 8px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <style>{`@keyframes genBarSlide { 0% { transform: translateX(-100%); } 100% { transform: translateX(260%); } }
        @keyframes genSpin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#475569", fontSize: 14 }}>
        <span
          aria-hidden
          style={{
            width: 18,
            height: 18,
            border: "2px solid rgba(15,23,42,0.12)",
            borderTopColor: "#0ea5e9",
            borderRadius: "50%",
            animation: "genSpin .7s linear infinite",
            flexShrink: 0,
          }}
        />
        <span>{label}</span>
      </div>
      <div style={{ fontSize: 12, color: "#64748b" }}>{estimate}</div>
      <div
        style={{
          height: 4,
          borderRadius: 99,
          background: "rgba(15,23,42,0.08)",
          overflow: "hidden",
          marginTop: 4,
        }}
      >
        <span
          style={{
            display: "block",
            height: "100%",
            width: "40%",
            borderRadius: 99,
            background: "linear-gradient(90deg,#0ea5e9,#a855f7)",
            animation: "genBarSlide 1.4s ease-in-out infinite",
          }}
        />
      </div>
    </div>
  );
}
