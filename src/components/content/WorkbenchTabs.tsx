import { Link } from "@tanstack/react-router";
import { SURFACE, LINE } from "@/lib/theme";

export type WorkbenchTabKey = "write" | "campaigns" | "ideas" | "repurpose";

const TABS: {
  key: WorkbenchTabKey;
  label: string;
  to: "/engine" | "/campaign-posts" | "/ideas" | "/repurpose";
  hash?: string;
}[] = [
  { key: "write", label: "Write Post", to: "/engine", hash: "m=content&t=post" },
  { key: "campaigns", label: "Pull from Campaigns", to: "/campaign-posts" },
  { key: "ideas", label: "Idea Generator", to: "/ideas" },
  { key: "repurpose", label: "Repurposing Suite", to: "/repurpose" },
];

/** One tab strip shared by every workbench screen. */
export function WorkbenchTabs({ active }: { active: WorkbenchTabKey }) {
  return (
    <nav
      aria-label="Content workbench"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        padding: 5,
        marginBottom: 24,
        borderRadius: 100,
        width: "fit-content",
        maxWidth: "100%",
        background: SURFACE,
        border: `1px solid ${LINE}`,
      }}
    >
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            to={t.to}
            {...(t.hash ? { hash: t.hash } : {})}
            aria-current={isActive ? "page" : undefined}
            style={{
              padding: "9px 16px",
              borderRadius: 100,
              fontSize: 13.5,
              fontWeight: 700,
              textDecoration: "none",
              whiteSpace: "nowrap",
              color: isActive ? "#fff" : "#A8B0D4",
              background: isActive ? "linear-gradient(135deg,#6366F1,#8B5CF6)" : "transparent",
              boxShadow: isActive ? "0 6px 18px -8px rgba(99,102,241,0.8)" : "none",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Hands a hook or brief to the Write Post tab. */
export function sendToEditor(topic: string) {
  try {
    sessionStorage.setItem("haaylo:post-topic", topic);
  } catch {
    /* private browsing — the editor simply opens empty */
  }
}
