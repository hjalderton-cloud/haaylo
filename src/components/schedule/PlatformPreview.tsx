export type PreviewPlatform = "linkedin" | "instagram" | "facebook";

export const PREVIEW_PLATFORMS: Array<{ id: PreviewPlatform; label: string }> = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
];

type Props = {
  platform: PreviewPlatform;
  caption: string;
  mediaUrl: string | null;
  accountName: string;
  avatarUrl: string | null;
};

const CLAMP: Record<PreviewPlatform, number> = {
  linkedin: 210,
  instagram: 125,
  facebook: 250,
};

function Avatar({ url, name, round }: { url: string | null; name: string; round: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div
      style={{
        width: 40,
        height: 40,
        flexShrink: 0,
        borderRadius: round ? "50%" : 8,
        overflow: "hidden",
        background: "linear-gradient(135deg,#6366F1,#EC4899)",
        display: "grid",
        placeItems: "center",
        color: "#fff",
        fontWeight: 700,
        fontSize: 14,
      }}
    >
      {url ? (
        <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        initials || "B"
      )}
    </div>
  );
}

function MediaBlock({ url, ratio }: { url: string | null; ratio: string }) {
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: ratio,
        background: url ? "#000" : "#EEF0F4",
        display: "grid",
        placeItems: "center",
        color: "#98A2B3",
        fontSize: 12.5,
      }}
    >
      {url ? (
        <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        "No image paired"
      )}
    </div>
  );
}

function Body({ text, limit, colour = "#111418" }: { text: string; limit: number; colour?: string }) {
  const trimmed = text.trim();
  const long = trimmed.length > limit;
  const shown = long ? `${trimmed.slice(0, limit).trimEnd()}… ` : trimmed;
  return (
    <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: colour, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {shown || "Your caption will appear here."}
      {long && <span style={{ color: "#667085" }}>see more</span>}
    </p>
  );
}

/** Renders the post inside a rough copy of each platform's native feed frame. */
export function PlatformPreview({ platform, caption, mediaUrl, accountName, avatarUrl }: Props) {
  const shell: React.CSSProperties = {
    background: "#fff",
    borderRadius: 14,
    border: "1px solid #E4E7EC",
    overflow: "hidden",
    maxWidth: 420,
    width: "100%",
    boxShadow: "0 14px 34px -20px rgba(0,0,0,0.5)",
  };

  if (platform === "instagram") {
    return (
      <div style={shell}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 10 }}>
          <Avatar url={avatarUrl} name={accountName} round />
          <strong style={{ fontSize: 13.5, color: "#111418" }}>
            {accountName.toLowerCase().replace(/\s+/g, "")}
          </strong>
        </div>
        <MediaBlock url={mediaUrl} ratio="1 / 1" />
        <div style={{ padding: "10px 12px 14px", display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 12, fontSize: 16 }}>♡ ♢ ↗</div>
          <Body text={caption} limit={CLAMP.instagram} />
        </div>
      </div>
    );
  }

  if (platform === "facebook") {
    return (
      <div style={shell}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 12 }}>
          <Avatar url={avatarUrl} name={accountName} round />
          <div style={{ minWidth: 0 }}>
            <strong style={{ fontSize: 14, color: "#111418", display: "block" }}>{accountName}</strong>
            <span style={{ fontSize: 12, color: "#65676B" }}>Just now · Public</span>
          </div>
        </div>
        <div style={{ padding: "0 12px 10px" }}>
          <Body text={caption} limit={CLAMP.facebook} />
        </div>
        <MediaBlock url={mediaUrl} ratio="1.91 / 1" />
        <div
          style={{
            display: "flex",
            justifyContent: "space-around",
            padding: "8px 0",
            borderTop: "1px solid #E4E7EC",
            fontSize: 13,
            color: "#65676B",
          }}
        >
          <span>Like</span>
          <span>Comment</span>
          <span>Share</span>
        </div>
      </div>
    );
  }

  return (
    <div style={shell}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 12 }}>
        <Avatar url={avatarUrl} name={accountName} round />
        <div style={{ minWidth: 0 }}>
          <strong style={{ fontSize: 14, color: "#111418", display: "block" }}>{accountName}</strong>
          <span style={{ fontSize: 12, color: "#666" }}>Now · Edited · 🌐</span>
        </div>
      </div>
      <div style={{ padding: "0 12px 12px" }}>
        <Body text={caption} limit={CLAMP.linkedin} />
      </div>
      <MediaBlock url={mediaUrl} ratio="1.2 / 1" />
      <div
        style={{
          display: "flex",
          justifyContent: "space-around",
          padding: "8px 0",
          borderTop: "1px solid #E4E7EC",
          fontSize: 13,
          color: "#5E6D77",
        }}
      >
        <span>Like</span>
        <span>Comment</span>
        <span>Repost</span>
        <span>Send</span>
      </div>
    </div>
  );
}
