/**
 * Campaign Launch Run.
 *
 * The step-by-step "what now" panel that sits at the top of a built campaign:
 * what is already live, what still needs a click, and the button that does it.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getLaunchStatus,
  publishCampaignLanding,
  scheduleCampaignPosts,
  type LaunchStatus,
} from "@/lib/campaign-launch.functions";
import { SURFACE, NAVY, INDIGO, PINK, GREY, LINE, TINT, font, PURPLE } from "@/lib/theme";

const MUTED = GREY;

const shell: React.CSSProperties = {
  borderRadius: 18,
  border: `1px solid ${LINE}`,
  background: SURFACE,
  padding: 18,
  marginBottom: 16,
};

const primary: React.CSSProperties = {
  padding: "9px 13px",
  borderRadius: 11,
  border: "none",
  background: PINK,
  color: "#FFFFFF",
  fontSize: 12.5,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: font,
  textDecoration: "none",
  display: "inline-block",
};

const quiet: React.CSSProperties = {
  padding: "9px 13px",
  borderRadius: 11,
  border: `1px solid ${LINE}`,
  background: "#FFFFFF",
  color: INDIGO,
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: font,
  textDecoration: "none",
  display: "inline-block",
};

type Step = {
  key: string;
  label: string;
  done: boolean;
  status: string;
  note: string;
  actions: React.ReactNode;
};

function whenText(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CampaignLaunchGuide({
  campaignId,
  projectId,
  reloadKey,
  onChanged,
}: {
  campaignId: string;
  projectId: string | null;
  reloadKey?: number;
  onChanged?: () => void;
}) {
  const statusFn = useServerFn(getLaunchStatus);
  const publishFn = useServerFn(publishCampaignLanding);
  const scheduleFn = useServerFn(scheduleCampaignPosts);

  const [data, setData] = useState<LaunchStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await statusFn({ data: { campaignId, projectId } }));
    } catch {
      setData(null);
    }
  }, [campaignId, projectId, statusFn]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  async function copy(text: string, said: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(said);
    } catch {
      toast.error("Copying didn't work. Select the text and copy it by hand.");
    }
  }

  async function publish() {
    setBusy("landing");
    try {
      const res = await publishFn({ data: { campaignId, projectId } });
      toast.success(`Your page is live at ${res.url}`);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't publish. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function schedule(howMany: number) {
    setBusy("posts");
    try {
      const res = await scheduleFn({ data: { campaignId, projectId, howMany } });
      toast.success(
        res.scheduled === 0
          ? "Every post is already in the diary."
          : `${res.scheduled} posts scheduled, first one ${whenText(res.firstAt)}.`,
      );
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't schedule. Try again.");
    } finally {
      setBusy(null);
    }
  }

  if (!data) return null;

  const steps: Step[] = [];

  if (data.landing) {
    const l = data.landing;
    steps.push({
      key: "landing",
      label: "Your sign-up page",
      done: l.live,
      status: l.live ? "Live and taking sign-ups" : "Written, not live yet",
      note: l.live
        ? `Anyone can visit ${l.url}. To put it inside your own website instead, copy the embed code and paste it into the page where you want the form.`
        : "Haaylo hosts this page for you. Put it live and you can share the link straight away, no website work needed.",
      actions: (
        <>
          {l.live ? (
            <a href={l.url} target="_blank" rel="noreferrer" style={primary}>
              View live page
            </a>
          ) : (
            <button type="button" style={primary} disabled={busy === "landing"} onClick={() => void publish()}>
              {busy === "landing" ? "Publishing…" : "Put the page live now"}
            </button>
          )}
          <button type="button" style={quiet} onClick={() => void copy(l.url, "Link copied.")}>
            Copy the link
          </button>
          <button
            type="button"
            style={quiet}
            onClick={() => void copy(l.embedInline, "Embed code copied. Paste it into your website page.")}
          >
            Copy website embed code
          </button>
          <Link to="/landing/$id" params={{ id: l.id }} style={quiet}>
            Edit the page
          </Link>
        </>
      ),
    });
  }

  if (data.guide) {
    const g = data.guide;
    steps.push({
      key: "guide",
      label: "Your downloadable guide",
      done: g.ready,
      status: g.ready ? "Connected to your sign-up form" : "Still being written",
      note: "When someone enters their email on your sign-up page, Haaylo hands them this guide automatically. There is nothing to upload to your own website.",
      actions: (
        <>
          <a href={g.url} target="_blank" rel="noreferrer" style={primary}>
            Preview the guide
          </a>
          <button type="button" style={quiet} onClick={() => void copy(g.url, "Guide link copied.")}>
            Copy the guide link
          </button>
          <Link to="/funnel" search={{ campaign: campaignId } as never} style={quiet}>
            Edit the guide
          </Link>
        </>
      ),
    });
  }

  if (data.posts.total > 0) {
    const p = data.posts;
    steps.push({
      key: "posts",
      label: "Your social posts",
      done: p.drafts === 0 && p.total > 0,
      status:
        p.drafts === 0
          ? `All ${p.total} posts scheduled or published`
          : `${p.drafts} of ${p.total} still waiting on you`,
      note: p.nextAt
        ? `Next one goes out ${whenText(p.nextAt)}.`
        : "Nothing in the diary yet. Haaylo can put the next few in for you, one a weekday morning.",
      actions: (
        <>
          {p.drafts > 0 && (
            <button type="button" style={primary} disabled={busy === "posts"} onClick={() => void schedule(3)}>
              {busy === "posts" ? "Scheduling…" : "Schedule the next 3"}
            </button>
          )}
          {p.drafts > 3 && (
            <button type="button" style={quiet} disabled={busy === "posts"} onClick={() => void schedule(p.drafts)}>
              Schedule all {p.drafts}
            </button>
          )}
          <Link to="/bank" search={{ campaign: campaignId } as never} style={quiet}>
            Read them first
          </Link>
          <Link to="/calendar" style={quiet}>
            Open the calendar
          </Link>
        </>
      ),
    });
  }

  if (data.emails > 0) {
    steps.push({
      key: "emails",
      label: "Your email sequence",
      done: false,
      status: `${data.emails} emails written`,
      note: "Send these to people who sign up. Push them into Mailchimp, or copy them into whatever you send email with.",
      actions: (
        <>
          <Link to="/funnel" search={{ campaign: campaignId } as never} style={primary}>
            Open and send
          </Link>
          <Link to="/email" style={quiet}>
            Email hub
          </Link>
        </>
      ),
    });
  }

  if (data.blog) {
    steps.push({
      key: "blog",
      label: "Your blog article",
      done: false,
      status: "Written and ready for your website",
      note: "Copy it into your own website as a new blog post, then link to your sign-up page at the bottom.",
      actions: (
        <Link to="/bank" search={{ campaign: campaignId } as never} style={primary}>
          Open the article
        </Link>
      ),
    });
  }

  if (steps.length === 0) return null;

  const done = steps.filter((s) => s.done).length;

  return (
    <section style={shell} aria-label="Launch guide">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "baseline", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: NAVY, fontFamily: font }}>
          Getting this campaign live
        </h2>
        <span style={{ fontSize: 12, fontWeight: 800, color: PURPLE, fontFamily: font }}>
          {done} of {steps.length} done
        </span>
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 13.5, color: MUTED, fontFamily: font, lineHeight: 1.6 }}>
        Everything below is written and saved. Work down the list and Haaylo does the rest.
      </p>

      <div
        aria-hidden
        style={{ height: 6, borderRadius: 999, background: TINT.purple, margin: "14px 0 4px", overflow: "hidden" }}
      >
        <div style={{ height: "100%", width: `${(done / steps.length) * 100}%`, background: PURPLE }} />
      </div>

      <ol style={{ listStyle: "none", margin: "14px 0 0", padding: 0, display: "grid", gap: 12 }}>
        {steps.map((s, i) => (
          <li
            key={s.key}
            style={{
              border: `1px solid ${LINE}`,
              borderRadius: 14,
              background: "#FFFFFF",
              padding: 14,
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
            }}
          >
            <span
              aria-hidden
              style={{
                flex: "0 0 auto",
                width: 26,
                height: 26,
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                fontSize: 12,
                fontWeight: 800,
                fontFamily: font,
                background: s.done ? TINT.green : TINT.purple,
                color: s.done ? TINT.greenInk : TINT.purpleInk,
              }}
            >
              {s.done ? "✓" : i + 1}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: NAVY, fontFamily: font }}>{s.label}</span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: ".06em",
                    textTransform: "uppercase",
                    padding: "3px 8px",
                    borderRadius: 999,
                    background: s.done ? TINT.green : TINT.blue,
                    color: s.done ? TINT.greenInk : TINT.blueInk,
                    fontFamily: font,
                  }}
                >
                  {s.status}
                </span>
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: MUTED, lineHeight: 1.6, fontFamily: font }}>{s.note}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 11 }}>{s.actions}</div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
