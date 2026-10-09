import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell, CARD } from "@/components/AppShell";
import { readActiveProjectId } from "@/hooks/useActiveProject";
import {
  listEmailSequences,
  importFunnelSequence,
  type EmailSequenceGroup,
} from "@/lib/email-sequences.functions";
import { NAVY, INDIGO, PURPLE, PINK, LINE, SURFACE, TINT, font } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/email/")({
  head: () => ({
    meta: [
      { title: "Email — haaylo.com" },
      {
        name: "description",
        content: "Every email sequence in one place: subject, audience, planned send date and body.",
      },
      { property: "og:title", content: "Email — haaylo.com" },
      {
        property: "og:description",
        content: "Build and edit your campaign emails the way you would in Mailchimp.",
      },
    ],
  }),
  component: EmailIndex,
});

function formatDate(iso: string | null) {
  if (!iso) return "No date set";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "No date set";
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function EmailIndex() {
  const projectId = readActiveProjectId();
  const list = useServerFn(listEmailSequences);
  const importFunnel = useServerFn(importFunnelSequence);

  const [groups, setGroups] = useState<EmailSequenceGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    if (!projectId) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        await importFunnel({ data: { projectId } }).catch(() => undefined);
        const rows = await list({ data: { projectId } });
        if (live) setGroups(rows);
      } catch (e) {
        if (live) toast.error(e instanceof Error ? e.message : "Couldn't load your emails.");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <AppShell title="Email">
      <div style={{ fontFamily: font, color: NAVY, display: "grid", gap: 16, maxWidth: 900 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: INDIGO }}>Email</h1>
          <p style={{ margin: "6px 0 0", color: NAVY, opacity: 0.8 }}>
            Every sequence you've written. Open an email to set the subject, audience, send date,
            body and image.
          </p>
        </div>

        {!projectId && (
          <div style={CARD}>Pick a workspace in the menu to see its emails.</div>
        )}

        {projectId && loading && <div style={CARD}>Loading your emails…</div>}

        {projectId && !loading && groups.length === 0 && (
          <div style={CARD}>
            <p style={{ margin: 0 }}>
              No emails yet. Write a nurture sequence on the{" "}
              <Link to="/funnel" style={{ color: PURPLE, fontWeight: 600 }}>
                Lead Capture
              </Link>{" "}
              page, or build a campaign with emails in it.
            </p>
          </div>
        )}

        {groups.map((g) => (
          <section key={g.key} style={CARD}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: INDIGO, minWidth: 0 }}>
                {g.title}
              </h2>
              <span style={{ fontSize: 13, color: NAVY, opacity: 0.7 }}>
                {g.emails.length} {g.emails.length === 1 ? "email" : "emails"}
              </span>
            </div>

            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              {g.emails.map((e, i) => (
                <div
                  key={e.id}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 10,
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "#FFFFFF",
                    border: `1px solid ${LINE}`,
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                    <div style={{ fontSize: 12, color: PINK, fontWeight: 700, letterSpacing: 0.4 }}>
                      EMAIL {i + 1}
                    </div>
                    <div
                      style={{
                        fontWeight: 600,
                        color: NAVY,
                        overflowWrap: "anywhere",
                        marginTop: 2,
                      }}
                    >
                      {e.subject || "No subject yet"}
                    </div>
                    <div style={{ fontSize: 13, color: NAVY, opacity: 0.75, marginTop: 4 }}>
                      {e.audienceName || "No audience picked"} · {formatDate(e.plannedSendAt)}
                    </div>
                  </div>
                  <Link
                    to="/email/$id"
                    params={{ id: e.id }}
                    style={{
                      background: PURPLE,
                      color: "#FFFFFF",
                      borderRadius: 10,
                      padding: "8px 14px",
                      fontWeight: 600,
                      textDecoration: "none",
                      fontSize: 14,
                    }}
                  >
                    Edit
                  </Link>
                </div>
              ))}
            </div>

            {g.campaignId && (
              <div style={{ marginTop: 12 }}>
                <Link
                  to="/campaign/$id"
                  params={{ id: g.campaignId }}
                  style={{ color: PURPLE, fontWeight: 600, fontSize: 14 }}
                >
                  Open the campaign →
                </Link>
              </div>
            )}
          </section>
        ))}

        <div style={{ ...CARD, background: SURFACE, borderColor: TINT.purple }}>
          <p style={{ margin: 0, fontSize: 14, color: NAVY }}>
            Dates here are your plan. Nothing is sent until you sync a sequence to Mailchimp.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
