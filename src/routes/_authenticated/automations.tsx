import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useActiveProject } from "@/hooks/useActiveProject";
import { toast } from "sonner";
import { AppShell, CARD } from "@/components/AppShell";
import {
  listAutomations, saveAutomation, deleteAutomation, setAutomationActive,
  suggestLeadReplies, type Automation,
} from "@/lib/leads.functions";
import { PINK, NAVY, MUTED } from "@/components/WorkflowNav";

export const Route = createFileRoute("/_authenticated/automations")({
  head: () => ({
    meta: [
      { title: "Lead Automations — haaylo.com" },
      { name: "description", content: "Set a keyword, and every comment that mentions it becomes a lead with an automatic reply and DM." },
      { property: "og:title", content: "Lead Automations — haaylo" },
      { property: "og:description", content: "Turn comments into leads: keyword triggers, auto replies and DMs written in your brand voice." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AutomationsPage,
});

type Account = {
  id: string; provider: string; display_name: string | null;
  avatar_url: string | null; status: string;
  missing_scopes: string[]; supported: boolean;
};

const BLANK: Automation = {
  id: "", name: "Keyword capture", project_id: null, connection_id: null,
  scope: "all_posts", target_post_ids: [], keywords: [], match_mode: "contains",
  comment_reply_variants: [], dm_message: "", followup_message: null,
  followup_delay_hours: 24, handoff_email: null, handoff_enabled: false, handoff_delay_hours: 0,
  dedupe_per_person: true, ignore_handles: [],
  active: true, created_at: "",
};

const input: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: "1px solid #E3E6F2", fontSize: 14, background: "#fff", color: NAVY,
};
const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: MUTED, display: "block", marginBottom: 6 };

function AutomationsPage() {
  const activeProjectId = useActiveProject();
  const listFn = useServerFn(listAutomations);
  const saveFn = useServerFn(saveAutomation);
  const deleteFn = useServerFn(deleteAutomation);
  const toggleFn = useServerFn(setAutomationActive);
  const suggestFn = useServerFn(suggestLeadReplies);

  const [rules, setRules] = useState<Automation[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [offerLink, setOfferLink] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listFn({ data: activeProjectId ? { projectId: activeProjectId } : {} });
      setRules(res.automations);
      setCounts(res.counts);
      setAccounts(res.accounts as Account[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load your automations.");
    } finally {
      setLoading(false);
    }
  }, [listFn, activeProjectId]);

  useEffect(() => { void load(); }, [load]);

  const blockedAccounts = accounts.filter((a) => a.supported && a.missing_scopes.length);

  async function save() {
    if (!editing) return;
    if (!editing.keywords.length) { toast.error("Add at least one keyword."); return; }
    setSaving(true);
    try {
      await saveFn({
        data: {
          ...(editing.id ? { id: editing.id } : {}),
          name: editing.name,
          project_id: editing.project_id ?? activeProjectId ?? null,
          connection_id: editing.connection_id,
          scope: editing.scope as "all_posts" | "specific",
          target_post_ids: editing.target_post_ids,
          keywords: editing.keywords,
          match_mode: editing.match_mode as "exact" | "contains",
          comment_reply_variants: editing.comment_reply_variants,
          dm_message: editing.dm_message,
          followup_message: editing.followup_message,
          followup_delay_hours: editing.followup_delay_hours,
          handoff_email: editing.handoff_email,
          handoff_enabled: editing.handoff_enabled,
          handoff_delay_hours: editing.handoff_delay_hours,
          dedupe_per_person: editing.dedupe_per_person,
          ignore_handles: editing.ignore_handles,
          active: editing.active,
        },
      });
      toast.success("Automation saved.");
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that.");
    } finally {
      setSaving(false);
    }
  }

  async function suggest() {
    if (!editing) return;
    const keyword = editing.keywords[0];
    if (!keyword) { toast.error("Add a keyword first."); return; }
    setSuggesting(true);
    try {
      const res = await suggestFn({ data: { keyword, offerLink: offerLink || undefined, projectId: editing.project_id } });
      setEditing({ ...editing, comment_reply_variants: res.replies, dm_message: res.dm });
      toast.success("Drafted in your brand voice — edit anything you like.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not draft replies.");
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <AppShell title="Automations">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, color: NAVY }}>Lead automations</h1>
          <p style={{ margin: "6px 0 0", color: MUTED, fontSize: 14, maxWidth: 620 }}>
            Someone comments your keyword, they get a reply and a DM with the link, and you get the lead.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to="/leads" style={{ ...btn(false), textDecoration: "none" }}>Leads inbox</Link>
          <button style={btn(true)} onClick={() => { setEditing({ ...BLANK }); setOfferLink(""); }}>
            New automation
          </button>
        </div>
      </div>

      {blockedAccounts.length > 0 && (
        <div style={{ ...CARD, padding: 14, marginBottom: 16, borderLeft: `3px solid ${PINK}` }}>
          <strong style={{ color: NAVY, fontSize: 14 }}>Sending is queued, capture is live</strong>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: MUTED }}>
            Leads are being captured and logged now. Automatic replies and DMs switch on once Meta approves these
            permissions for your app: {blockedAccounts[0]?.missing_scopes.join(", ")}. Nothing needs rebuilding when they land.
          </p>
        </div>
      )}

      {loading ? (
        <div style={{ ...CARD, padding: 24, color: MUTED }}>Loading…</div>
      ) : rules.length === 0 ? (
        <div style={{ ...CARD, padding: 28, textAlign: "center" }}>
          <p style={{ margin: 0, color: NAVY, fontWeight: 600 }}>No automations yet</p>
          <p style={{ margin: "8px 0 16px", color: MUTED, fontSize: 14 }}>
            Pick a word people can comment — GUIDE, PRICES, WAITLIST — and we'll handle the rest.
          </p>
          <button style={btn(true)} onClick={() => setEditing({ ...BLANK })}>Create your first one</button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {rules.map((r) => {
            const account = accounts.find((a) => a.id === r.connection_id);
            return (
              <div key={r.id} style={{ ...CARD, padding: 16, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ minWidth: 240, flex: "1 1 260px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <strong style={{ color: NAVY, fontSize: 15 }}>{r.name}</strong>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: r.active ? "#E8F7EE" : "#F1F2F7", color: r.active ? "#1E8E4E" : MUTED }}>
                      {r.active ? "Live" : "Paused"}
                    </span>
                  </div>
                  <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {r.keywords.map((k) => (
                      <span key={k} style={{ fontSize: 12, fontWeight: 700, color: PINK, background: "#FFF0F5", padding: "3px 8px", borderRadius: 999 }}>{k}</span>
                    ))}
                  </div>
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: MUTED }}>
                    {account ? account.display_name ?? account.provider : "All connected accounts"} · {r.scope === "specific" ? `${r.target_post_ids.length} post(s)` : "all posts"} · {counts[r.id] ?? 0} leads
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={btn(false)} onClick={async () => {
                    await toggleFn({ data: { id: r.id, active: !r.active } });
                    await load();
                  }}>{r.active ? "Pause" : "Resume"}</button>
                  <button style={btn(false)} onClick={() => { setEditing(r); setOfferLink(""); }}>Edit</button>
                  <button style={{ ...btn(false), color: "#C0304F" }} onClick={async () => {
                    if (!window.confirm("Delete this automation? Captured leads stay in your inbox.")) return;
                    await deleteFn({ data: { id: r.id } });
                    toast.success("Deleted.");
                    await load();
                  }}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: "fixed", inset: 0, background: "rgba(20,20,40,0.4)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto", zIndex: 60 }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}
        >
          <div style={{ ...CARD, padding: 20, width: "100%", maxWidth: 560, marginTop: 40 }}>
            <h2 style={{ margin: "0 0 14px", fontSize: 18, color: NAVY }}>{editing.id ? "Edit automation" : "New automation"}</h2>

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={label}>Name</label>
                <input style={input} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>

              <div>
                <label style={label}>Keywords (comma separated)</label>
                <input
                  style={input}
                  placeholder="GUIDE, PRICES"
                  defaultValue={editing.keywords.join(", ")}
                  onBlur={(e) => setEditing({ ...editing, keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean).slice(0, 10) })}
                />
                <div style={{ marginTop: 8, display: "flex", gap: 12, fontSize: 13, color: NAVY }}>
                  {(["contains", "exact"] as const).map((m) => (
                    <label key={m} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input type="radio" checked={editing.match_mode === m} onChange={() => setEditing({ ...editing, match_mode: m })} />
                      {m === "contains" ? "Contains the word" : "Exact word only"}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label style={label}>Watch this account</label>
                <select style={input} value={editing.connection_id ?? ""} onChange={(e) => setEditing({ ...editing, connection_id: e.target.value || null })}>
                  <option value="">All connected accounts</option>
                  {accounts.filter((a) => a.supported).map((a) => (
                    <option key={a.id} value={a.id}>{a.display_name ?? a.provider}</option>
                  ))}
                </select>
                {accounts.some((a) => !a.supported) && (
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: MUTED }}>
                    LinkedIn isn't listed — its API doesn't expose post comments or messages, so comment triggers aren't possible there.
                  </p>
                )}
              </div>

              <div>
                <label style={label}>Which posts</label>
                <select style={input} value={editing.scope} onChange={(e) => setEditing({ ...editing, scope: e.target.value })}>
                  <option value="all_posts">Every post on that account</option>
                  <option value="specific">Only specific posts</option>
                </select>
                {editing.scope === "specific" && (
                  <input
                    style={{ ...input, marginTop: 8 }}
                    placeholder="Post IDs, comma separated"
                    defaultValue={editing.target_post_ids.join(", ")}
                    onBlur={(e) => setEditing({ ...editing, target_post_ids: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })}
                  />
                )}
              </div>

              <div style={{ borderTop: "1px solid #EEF0F7", paddingTop: 14 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={label}>Link you're sending (optional, helps the draft)</label>
                    <input style={input} value={offerLink} placeholder="https://…" onChange={(e) => setOfferLink(e.target.value)} />
                  </div>
                  <button style={btn(true)} disabled={suggesting} onClick={() => void suggest()}>
                    {suggesting ? "Writing…" : "✦ Suggest"}
                  </button>
                </div>

                <label style={label}>Public comment replies (one per line — we rotate them)</label>
                <textarea
                  style={{ ...input, minHeight: 78, resize: "vertical" }}
                  value={editing.comment_reply_variants.join("\n")}
                  onChange={(e) => setEditing({ ...editing, comment_reply_variants: e.target.value.split("\n").map((v) => v.trim()).filter(Boolean).slice(0, 5) })}
                  placeholder={"Just sent it over 👍\nSent — check your messages."}
                />
              </div>

              <div>
                <label style={label}>Step 1 — welcome message (DM)</label>
                <textarea
                  style={{ ...input, minHeight: 96, resize: "vertical" }}
                  value={editing.dm_message}
                  onChange={(e) => setEditing({ ...editing, dm_message: e.target.value })}
                  placeholder="Hi — here's the link I promised…"
                />
              </div>

              <div>
                <label style={label}>Step 2 — follow-up if they don't reply (optional)</label>
                <textarea
                  style={{ ...input, minHeight: 70, resize: "vertical" }}
                  value={editing.followup_message ?? ""}
                  onChange={(e) => setEditing({ ...editing, followup_message: e.target.value || null })}
                />
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: NAVY }}>
                  Send after
                  <input
                    type="number" min={1} max={168}
                    style={{ ...input, width: 80 }}
                    value={editing.followup_delay_hours}
                    onChange={(e) => setEditing({ ...editing, followup_delay_hours: Math.min(168, Math.max(1, Number(e.target.value) || 24)) })}
                  />
                  hours
                </div>
              </div>

              <div>
                <label style={label}>Step 3 — lead handoff email (optional)</label>
                <input
                  style={input}
                  type="email"
                  placeholder="sales@yourcompany.com"
                  value={editing.handoff_email ?? ""}
                  onChange={(e) => setEditing({ ...editing, handoff_email: e.target.value.trim() || null, handoff_enabled: !!e.target.value.trim() && editing.handoff_enabled })}
                />
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: NAVY, flexWrap: "wrap" }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={editing.handoff_enabled}
                      disabled={!editing.handoff_email}
                      onChange={(e) => setEditing({ ...editing, handoff_enabled: e.target.checked })}
                    />
                    Email me the lead
                  </label>
                  after
                  <input
                    type="number" min={0} max={168}
                    style={{ ...input, width: 80 }}
                    value={editing.handoff_delay_hours}
                    onChange={(e) => setEditing({ ...editing, handoff_delay_hours: Math.min(168, Math.max(0, Number(e.target.value) || 0)) })}
                  />
                  hours
                </div>
                <p style={{ marginTop: 6, fontSize: 12.5, color: "#64648a", lineHeight: 1.5 }}>
                  The handoff email carries the comment, the keyword and a link to the post, so whoever picks it up has the context.
                </p>
              </div>

              <div>
                <label style={label}>Ignore these handles</label>
                <input
                  style={input}
                  placeholder="@yourbrand, @teammate"
                  defaultValue={editing.ignore_handles.join(", ")}
                  onBlur={(e) => setEditing({ ...editing, ignore_handles: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })}
                />
              </div>

              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: NAVY }}>
                <input type="checkbox" checked={editing.dedupe_per_person} onChange={(e) => setEditing({ ...editing, dedupe_per_person: e.target.checked })} />
                Only reply once per person
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: NAVY }}>
                <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
                Live
              </label>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button style={btn(false)} onClick={() => setEditing(null)}>Cancel</button>
              <button style={btn(true)} disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function btn(primary: boolean): React.CSSProperties {
  return {
    padding: "9px 14px", borderRadius: 10, fontSize: 13, fontWeight: 700,
    cursor: "pointer", border: primary ? "none" : "1px solid #E3E6F2",
    background: primary ? PINK : "#fff", color: primary ? "#fff" : NAVY,
  };
}
