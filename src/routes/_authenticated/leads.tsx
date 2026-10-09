import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useWorkspace } from "@/hooks/useActiveProject";
import { toast } from "sonner";
import { AppShell, CARD } from "@/components/AppShell";
import {
  listLeads,
  listPageLeads,
  retryCapture,
  setPageLeadStatus,
  deletePageLead,
  type Capture,
  type PageLead,
} from "@/lib/leads.functions";
import { listCampaigns } from "@/lib/campaigns.functions";
import { PINK, NAVY, MUTED } from "@/components/WorkflowNav";

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({
    meta: [
      { title: "Lead Tracker — haaylo.com" },
      {
        name: "description",
        content:
          "Every lead captured across your Haaylo landing pages, in one place, with status tracking and a one-click CSV export.",
      },
      { property: "og:title", content: "Lead Tracker — haaylo" },
      {
        property: "og:description",
        content: "See who signed up on your pages, which campaign brought them in, and what happened next.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LeadsPage,
  validateSearch: (search: Record<string, unknown>): { campaign?: string } => ({
    campaign: typeof search['campaign'] === "string" ? search['campaign'] : undefined,
  }),
});

const RANGES = [
  { id: "7", label: "Last 7 days", days: 7 },
  { id: "30", label: "Last 30 days", days: 30 },
  { id: "90", label: "Last 90 days", days: 90 },
  { id: "all", label: "All time", days: 0 },
  { id: "custom", label: "Custom", days: 0 },
] as const;

const LEAD_STATUSES = ["all", "new", "contacted", "converted"] as const;
type LeadStatus = (typeof LEAD_STATUSES)[number];

const STATUS_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  new: { bg: "#E7EFFD", fg: "#1F5CD1", label: "New" },
  contacted: { bg: "#FFF4E5", fg: "#9A6100", label: "Contacted" },
  converted: { bg: "#E8F7EE", fg: "#1E8E4E", label: "Converted" },
};

function fullName(l: PageLead) {
  const name = [l.first_name, l.last_name].filter(Boolean).join(" ").trim();
  return name || "—";
}

function relativeTime(iso: string) {
  const then = new Date(iso).getTime();
  const secs = Math.round((Date.now() - then) / 1000);
  if (Number.isNaN(secs)) return "";
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.round(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

function LeadsPage() {
  const { projectId: activeProjectId } = useWorkspace();
  const routeSearch = Route.useSearch();
  const listFn = useServerFn(listLeads);
  const listPagesFn = useServerFn(listPageLeads);
  const listCampaignsFn = useServerFn(listCampaigns);
  const retryFn = useServerFn(retryCapture);
  const setStatusFn = useServerFn(setPageLeadStatus);
  const deleteFn = useServerFn(deletePageLead);

  const [social, setSocial] = useState<Capture[]>([]);
  const [pageLeads, setPageLeads] = useState<PageLead[]>([]);
  const [campaigns, setCampaigns] = useState<{ id: string; campaign_title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [campaignId, setCampaignId] = useState(routeSearch.campaign ?? "all");
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("30");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<LeadStatus>("all");
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showSocial, setShowSocial] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(
    async (term: string) => {
      setLoading(true);
      const scope = {
        ...(term ? { search: term } : {}),
        ...(activeProjectId ? { projectId: activeProjectId } : {}),
      };
      try {
        const [comments, pages, camps] = await Promise.all([
          listFn({ data: scope }),
          listPagesFn({ data: scope }),
          listCampaignsFn({ data: { projectId: activeProjectId } }),
        ]);
        setSocial(comments.leads);
        setPageLeads(pages.leads);
        setCampaigns(
          (camps ?? []).map((c) => ({ id: c.id, campaign_title: c.campaign_title ?? "Untitled campaign" })),
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not load your leads.");
      } finally {
        setLoading(false);
      }
    },
    [listFn, listPagesFn, listCampaignsFn, activeProjectId],
  );

  useEffect(() => {
    void load("");
  }, [load]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(null);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const visible = useMemo(() => {
    const days = RANGES.find((r) => r.id === range)?.days ?? 0;
    const cutoff = days ? Date.now() - days * 24 * 60 * 60 * 1000 : 0;
    const fromMs = range === "custom" && from ? new Date(from).getTime() : 0;
    const toMs = range === "custom" && to ? new Date(to).getTime() + 24 * 60 * 60 * 1000 : 0;
    return pageLeads.filter((l) => {
      const at = new Date(l.created_at).getTime();
      if (cutoff && at < cutoff) return false;
      if (fromMs && at < fromMs) return false;
      if (toMs && at > toMs) return false;
      if (campaignId !== "all" && l.campaign_id !== campaignId) return false;
      if (status !== "all" && (l.status || "new") !== status) return false;
      return true;
    });
  }, [pageLeads, range, from, to, campaignId, status]);

  const weekCount = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return pageLeads.filter((l) => new Date(l.created_at).getTime() >= cutoff).length;
  }, [pageLeads]);

  const topPage = useMemo(() => {
    const counts = new Map<string, number>();
    pageLeads.forEach((l) => {
      const key = l.page_title || "Untitled page";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    let best: { title: string; count: number } | null = null;
    counts.forEach((count, title) => {
      if (!best || count > best.count) best = { title, count };
    });
    return best as { title: string; count: number } | null;
  }, [pageLeads]);

  async function updateStatus(lead: PageLead, next: "contacted" | "converted") {
    setBusy(lead.id);
    setMenuOpen(null);
    try {
      await setStatusFn({ data: { id: lead.id, status: next } });
      setPageLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status: next } : l)));
      toast.success(`Marked as ${next}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update that lead.");
    } finally {
      setBusy(null);
    }
  }

  async function removeLead(lead: PageLead) {
    setMenuOpen(null);
    if (!window.confirm(`Delete ${lead.email}? This cannot be undone.`)) return;
    setBusy(lead.id);
    try {
      await deleteFn({ data: { id: lead.id } });
      setPageLeads((prev) => prev.filter((l) => l.id !== lead.id));
      toast.success("Lead deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete that lead.");
    } finally {
      setBusy(null);
    }
  }

  function exportCsv() {
    const rows: string[][] = [
      ["Captured", "First name", "Last name", "Email", "Phone", "Company", "Source page", "Campaign", "Status"],
      ...visible.map((l) => [
        l.created_at,
        l.first_name ?? "",
        l.last_name ?? "",
        l.email,
        l.phone ?? "",
        l.company ?? "",
        l.page_title ?? "",
        l.campaign_title ?? "",
        l.status || "new",
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `haaylo-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell title="Leads">
      <div ref={wrapRef}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 18,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 26, color: NAVY }}>Lead Tracker</h1>
            <p style={{ margin: "6px 0 0", color: MUTED, fontSize: 14 }}>
              Every lead captured across your Haaylo landing pages, in one place.
            </p>
          </div>
          <button style={btn(true)} onClick={exportCsv} disabled={!visible.length}>
            Download CSV
          </button>
        </div>

        {/* Stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            marginBottom: 18,
          }}
        >
          <Stat label="Total leads captured" value={String(pageLeads.length)} hint="All time" />
          <Stat label="New leads this week" value={String(weekCount)} hint="Last 7 days" />
          <Stat
            label="Top performing page"
            value={topPage ? topPage.title : "—"}
            hint={topPage ? `${topPage.count} lead${topPage.count === 1 ? "" : "s"}` : "No leads yet"}
            small
          />
        </div>

        {/* Filters */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14, alignItems: "center" }}>
          <input
            style={{
              flex: "1 1 220px",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #E3E6F2",
              fontSize: 14,
              color: NAVY,
            }}
            placeholder="Search name, email or company"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void load(search);
            }}
          />
          <button style={btn(false)} onClick={() => void load(search)}>
            Search
          </button>
          <select style={select} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            <option value="all">All campaigns</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.campaign_title}
              </option>
            ))}
          </select>
          <select
            style={select}
            value={range}
            onChange={(e) => setRange(e.target.value as (typeof RANGES)[number]["id"])}
          >
            {RANGES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          {range === "custom" && (
            <>
              <input type="date" style={select} value={from} onChange={(e) => setFrom(e.target.value)} />
              <input type="date" style={select} value={to} onChange={(e) => setTo(e.target.value)} />
            </>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {LEAD_STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                style={{ ...btn(status === s), textTransform: "capitalize" }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ ...CARD, padding: 24, color: MUTED }}>Loading…</div>
        ) : pageLeads.length === 0 ? (
          <div style={{ ...CARD, padding: 32, textAlign: "center" }}>
            <p style={{ margin: 0, color: NAVY, fontWeight: 600 }}>
              No leads yet — publish a landing page to start capturing leads.
            </p>
            <div style={{ marginTop: 16 }}>
              <Link to="/landing" style={{ ...btn(true), textDecoration: "none" }}>
                Build a landing page
              </Link>
            </div>
          </div>
        ) : visible.length === 0 ? (
          <div style={{ ...CARD, padding: 24, color: MUTED }}>No leads match these filters.</div>
        ) : (
          <div style={{ ...CARD, padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
              <thead>
                <tr>
                  {["First Name", "Email", "Source Page", "Campaign", "Captured At", "Status", ""].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        fontSize: 12,
                        letterSpacing: 0.4,
                        textTransform: "uppercase",
                        color: MUTED,
                        padding: "12px 14px",
                        borderBottom: "1px solid #EEF0F7",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((l) => {
                  const tone = STATUS_TONE[l.status || "new"] ?? STATUS_TONE["new"]!;
                  return (
                    <tr key={l.id} style={{ borderBottom: "1px solid #F3F4FA", opacity: busy === l.id ? 0.5 : 1 }}>
                      <td style={cell}>{fullName(l)}</td>
                      <td style={{ ...cell, wordBreak: "break-word" }}>{l.email}</td>
                      <td style={cell}>
                        {l.page_slug ? (
                          <a
                            href={`/p/${l.page_slug}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: PINK, textDecoration: "none" }}
                          >
                            {l.page_title || "Untitled page"}
                          </a>
                        ) : (
                          l.page_title || "Untitled page"
                        )}
                      </td>
                      <td style={cell}>{l.campaign_title || "—"}</td>
                      <td style={{ ...cell, whiteSpace: "nowrap" }}>
                        <span title={new Date(l.created_at).toLocaleString("en-GB")}>
                          {relativeTime(l.created_at)}
                        </span>
                      </td>
                      <td style={cell}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "4px 10px",
                            borderRadius: 999,
                            background: tone.bg,
                            color: tone.fg,
                          }}
                        >
                          {tone.label}
                        </span>
                      </td>
                      <td style={{ ...cell, position: "relative", textAlign: "right" }}>
                        <button
                          aria-label="Lead actions"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpen(menuOpen === l.id ? null : l.id);
                          }}
                          style={{
                            border: "1px solid #E3E6F2",
                            background: "#fff",
                            borderRadius: 8,
                            padding: "4px 10px",
                            cursor: "pointer",
                            color: NAVY,
                            fontWeight: 700,
                          }}
                        >
                          ⋯
                        </button>
                        {menuOpen === l.id && (
                          <div
                            style={{
                              position: "absolute",
                              right: 14,
                              top: 44,
                              zIndex: 20,
                              background: "#fff",
                              border: "1px solid #E3E6F2",
                              borderRadius: 10,
                              boxShadow: "0 12px 30px rgba(20,24,60,0.12)",
                              minWidth: 180,
                              overflow: "hidden",
                              textAlign: "left",
                            }}
                          >
                            <MenuItem label="Mark as Contacted" onClick={() => void updateStatus(l, "contacted")} />
                            <MenuItem label="Mark as Converted" onClick={() => void updateStatus(l, "converted")} />
                            <MenuItem
                              label="Copy email"
                              onClick={() => {
                                void navigator.clipboard.writeText(l.email);
                                setMenuOpen(null);
                                toast.success("Email copied.");
                              }}
                            />
                            <MenuItem label="Delete" danger onClick={() => void removeLead(l)} />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Comment leads stay available, tucked away from the page-lead table. */}
        {social.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <button style={btn(false)} onClick={() => setShowSocial((v) => !v)}>
              {showSocial ? "Hide" : "Show"} comment leads ({social.length})
            </button>
            {showSocial && (
              <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                {social.map((c) => (
                  <div key={c.id} style={{ ...CARD, padding: 14 }}>
                    <strong style={{ color: NAVY, fontSize: 14 }}>
                      {c.commenter_name ?? c.commenter_handle ?? "Unknown commenter"}
                    </strong>
                    <p style={{ margin: "6px 0 0", fontSize: 14, color: NAVY, wordBreak: "break-word" }}>
                      {c.comment_text}
                    </p>
                    <p style={{ margin: "8px 0 0", fontSize: 12, color: MUTED }}>
                      {new Date(c.created_at).toLocaleString("en-GB")} · {c.platform.replace("_", " ")} · reply{" "}
                      {c.reply_status} · DM {c.dm_status}
                      {c.post_permalink ? " · " : ""}
                      {c.post_permalink && (
                        <a href={c.post_permalink} target="_blank" rel="noreferrer" style={{ color: PINK }}>
                          view post
                        </a>
                      )}
                    </p>
                    {(c.reply_status === "failed" || c.dm_status === "failed" || c.dm_status === "blocked") && (
                      <button
                        style={{ ...btn(false), marginTop: 10 }}
                        disabled={busy === c.id}
                        onClick={async () => {
                          setBusy(c.id);
                          try {
                            const res = await retryFn({ data: { id: c.id } });
                            if (res.ok) {
                              toast.success("Retried.");
                              await load(search);
                            } else toast.error(res.error);
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Retry failed.");
                          } finally {
                            setBusy(null);
                          }
                        }}
                      >
                        {busy === c.id ? "Retrying…" : "Retry"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "10px 12px",
        fontSize: 13,
        fontWeight: 600,
        background: "#fff",
        border: "none",
        borderTop: "1px solid #F3F4FA",
        cursor: "pointer",
        color: danger ? "#C0304F" : NAVY,
      }}
    >
      {label}
    </button>
  );
}

function Stat({ label, value, hint, small }: { label: string; value: string; hint: string; small?: boolean }) {
  return (
    <div style={{ ...CARD, padding: 16 }}>
      <p style={{ margin: 0, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4, color: MUTED }}>{label}</p>
      <p
        style={{
          margin: "8px 0 0",
          fontSize: small ? 18 : 28,
          fontWeight: 800,
          color: NAVY,
          wordBreak: "break-word",
        }}
      >
        {value}
      </p>
      <p style={{ margin: "4px 0 0", fontSize: 12, color: MUTED }}>{hint}</p>
    </div>
  );
}

const cell: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: 14,
  color: NAVY,
  verticalAlign: "middle",
};

const select: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid #E3E6F2",
  fontSize: 13,
  color: NAVY,
  background: "#fff",
};

function btn(primary: boolean): React.CSSProperties {
  return {
    padding: "9px 14px",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    border: primary ? "none" : "1px solid #E3E6F2",
    background: primary ? PINK : "#fff",
    color: primary ? "#fff" : NAVY,
    display: "inline-block",
  };
}
