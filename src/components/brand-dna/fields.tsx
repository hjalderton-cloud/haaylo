import { useState, type CSSProperties, type ReactNode } from "react";
import { SURFACE, NAVY, INDIGO, PINK, GREY, LINE, TINT, font } from "@/lib/theme";

export const dnaInput: CSSProperties = {
  background: "#FFFFFF",
  border: `1px solid ${LINE}`,
  color: NAVY,
  borderRadius: 10,
  padding: "10px 12px",
  fontFamily: "inherit",
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  color: INDIGO,
  textTransform: "uppercase",
  letterSpacing: ".05em",
};

const hintStyle: CSSProperties = { fontSize: 11.5, color: GREY, lineHeight: 1.4 };

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
      <span style={labelStyle}>
        {label}
        {required && <span style={{ color: PINK }}> *</span>}
      </span>
      {children}
      {hint && <span style={hintStyle}>{hint}</span>}
    </div>
  );
}

/** Collapsible section card. */
export function DnaSection({
  title,
  subtitle,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      style={{
        background: SURFACE,
        border: `1px solid ${LINE}`,
        borderRadius: 16,
        padding: 16,
        marginBottom: 14,
        boxShadow: "0 12px 28px -6px rgba(20,20,40,0.16)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          textAlign: "left",
          flexWrap: "wrap",
        }}
      >
        <h2
          style={{
            fontFamily: font,
            fontSize: 14,
            color: PINK,
            margin: 0,
            letterSpacing: ".04em",
            textTransform: "uppercase",
            flex: 1,
            minWidth: 0,
          }}
        >
          {title}
        </h2>
        {badge && (
          <span
            style={{
              fontSize: 9,
              letterSpacing: ".1em",
              padding: "3px 7px",
              borderRadius: 999,
              color: badge === "Required" ? TINT.pinkInk : INDIGO,
              background: badge === "Required" ? TINT.pink : SURFACE,
              border: `1px solid ${badge === "Required" ? TINT.pinkInk : LINE}`,
              textTransform: "uppercase",
            }}
          >
            {badge}
          </span>
        )}
        <span style={{ color: INDIGO, fontSize: 13 }}>{open ? "▾" : "▸"}</span>
      </button>
      {subtitle && (
        <p style={{ color: INDIGO, fontSize: 12.5, margin: "8px 0 0", lineHeight: 1.5 }}>{subtitle}</p>
      )}
      {open && <div style={{ display: "grid", gap: 12, marginTop: 14 }}>{children}</div>}
    </section>
  );
}

const splitTags = (v: string) =>
  v
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

/** Tag input backed by a comma-separated string value. */
export function TagInput({
  value,
  onChange,
  onCommit,
  placeholder,
  max,
}: {
  value: string;
  onChange: (next: string) => void;
  onCommit?: () => void;
  placeholder?: string;
  max?: number;
}) {
  const [draft, setDraft] = useState("");
  const tags = splitTags(value);
  const full = max !== undefined && tags.length >= max;

  function add(raw: string) {
    const next = raw.trim().replace(/,+$/, "");
    if (!next || full) return;
    if (tags.some((t) => t.toLowerCase() === next.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...tags, next].join(", "));
    setDraft("");
    onCommit?.();
  }

  function removeAt(i: number) {
    onChange(tags.filter((_, idx) => idx !== i).join(", "));
    onCommit?.();
  }

  return (
    <div>
      {tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 7 }}>
          {tags.map((t, i) => (
            <span
              key={`${t}-${i}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: TINT.pink,
                border: `1px solid ${TINT.pinkInk}`,
                color: TINT.pinkInk,
                borderRadius: 999,
                padding: "4px 10px",
                fontSize: 12.5,
                maxWidth: "100%",
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t}</span>
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label={`Remove ${t}`}
                style={{ background: "none", border: "none", color: PINK, cursor: "pointer", fontSize: 13, lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={draft}
        disabled={full}
        placeholder={full ? `That's the maximum of ${max}` : placeholder}
        onChange={(e) => {
          const v = e.target.value;
          if (v.includes(",")) add(v);
          else setDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          }
          if (e.key === "Backspace" && !draft && tags.length) removeAt(tags.length - 1);
        }}
        onBlur={() => {
          if (draft.trim()) add(draft);
          else onCommit?.();
        }}
        style={{ ...dnaInput, opacity: full ? 0.6 : 1 }}
      />
      {max !== undefined && (
        <span style={{ ...hintStyle, display: "block", marginTop: 4 }}>
          {tags.length} of {max} — press Enter or comma to add
        </span>
      )}
    </div>
  );
}

/** Multi-select pills backed by a comma-separated string value. */
export function TonePills({
  options,
  value,
  onChange,
  max = 3,
}: {
  options: readonly string[];
  value: string;
  onChange: (next: string) => void;
  max?: number;
}) {
  const chosen = splitTags(value);
  function toggle(opt: string) {
    const has = chosen.some((c) => c.toLowerCase() === opt.toLowerCase());
    if (has) onChange(chosen.filter((c) => c.toLowerCase() !== opt.toLowerCase()).join(", "));
    else if (chosen.length < max) onChange([...chosen, opt].join(", "));
  }
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {options.map((opt) => {
          const on = chosen.some((c) => c.toLowerCase() === opt.toLowerCase());
          const locked = !on && chosen.length >= max;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              disabled={locked}
              style={{
                background: on ? PINK : SURFACE,
                color: on ? "#FFFFFF" : locked ? GREY : INDIGO,
                border: on ? "none" : `1px solid ${LINE}`,
                borderRadius: 999,
                padding: "8px 14px",
                fontSize: 12.5,
                fontWeight: on ? 800 : 600,
                cursor: locked ? "not-allowed" : "pointer",
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
      <span style={{ ...hintStyle, display: "block", marginTop: 6 }}>
        {chosen.length} of {max} chosen
      </span>
    </div>
  );
}

export type Testimonial = { name: string; quote: string };

/** Serialise testimonials to the plain-text shape the rest of the app already reads. */
export function testimonialsToText(items: Testimonial[]): string {
  return items
    .filter((t) => t.quote.trim() || t.name.trim())
    .map((t) => (t.name.trim() ? `"${t.quote.trim()}" — ${t.name.trim()}` : t.quote.trim()))
    .join("\n\n");
}

export function textToTestimonials(text: string): Testimonial[] {
  if (!text.trim()) return [];
  return text
    .split(/\n\s*\n|\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((line) => {
      const m = line.match(/^["“](.+)["”]\s*[—–-]\s*(.+)$/);
      if (m) return { quote: m[1].trim(), name: m[2].trim() };
      return { quote: line.replace(/^["“]|["”]$/g, ""), name: "" };
    });
}

export function TestimonialList({
  items,
  onChange,
  onCommit,
  max = 5,
}: {
  items: Testimonial[];
  onChange: (next: Testimonial[]) => void;
  onCommit?: () => void;
  max?: number;
}) {
  function update(i: number, patch: Partial<Testimonial>) {
    onChange(items.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {items.map((t, i) => (
        <div
          key={i}
          style={{
            border: `1px solid ${LINE}`,
            borderRadius: 12,
            padding: 10,
            display: "grid",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="text"
              value={t.name}
              placeholder="Name (e.g. Sarah, Loop Studio)"
              onChange={(e) => update(i, { name: e.target.value })}
              onBlur={onCommit}
              style={{ ...dnaInput, flex: "1 1 200px", width: "auto" }}
            />
            <button
              type="button"
              onClick={() => {
                onChange(items.filter((_, idx) => idx !== i));
                onCommit?.();
              }}
              style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 16 }}
              aria-label="Remove testimonial"
            >
              ×
            </button>
          </div>
          <textarea
            value={t.quote}
            rows={2}
            placeholder="What they said, in their words"
            onChange={(e) => update(i, { quote: e.target.value })}
            onBlur={onCommit}
            style={dnaInput}
          />
        </div>
      ))}
      {items.length < max && (
        <button
          type="button"
          onClick={() => onChange([...items, { name: "", quote: "" }])}
          style={{
            background: TINT.pink,
            border: `1px dashed ${TINT.pinkInk}`,
            color: PINK,
            borderRadius: 10,
            padding: "9px 12px",
            fontWeight: 700,
            fontSize: 12.5,
            cursor: "pointer",
            justifySelf: "start",
          }}
        >
          ＋ Add testimonial
        </button>
      )}
    </div>
  );
}
