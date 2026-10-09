import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell, CARD } from "@/components/AppShell";
import { readActiveProjectId } from "@/hooks/useActiveProject";
import {
  getSequenceEmail,
  updateSequenceEmail,
  suggestSubjectLines,
  listMailchimpAudiences,
  type SequenceEmail,
} from "@/lib/email-sequences.functions";
import { generateBrandImage, uploadGeneratedImageToScheduler } from "@/lib/image.functions";
import { NAVY, INDIGO, PURPLE, PINK, LINE, SURFACE, TINT, font } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/email/$id")({
  head: () => ({
    meta: [
      { title: "Edit email — haaylo.com" },
      {
        name: "description",
        content: "Set the subject, preview text, audience, send date, body and image for this email.",
      },
      { property: "og:title", content: "Edit email — haaylo.com" },
      {
        property: "og:description",
        content: "Build this email the way you would in Mailchimp, then sync when you're ready.",
      },
    ],
  }),
  component: EmailEditor,
});

const label: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: INDIGO,
  marginBottom: 6,
};

const input: React.CSSProperties = {
  width: "100%",
  background: "#FFFFFF",
  border: `1px solid ${LINE}`,
  borderRadius: 10,
  padding: "10px 12px",
  color: NAVY,
  fontFamily: font,
  fontSize: 14,
  boxSizing: "border-box",
};

const primary: React.CSSProperties = {
  background: PURPLE,
  color: "#FFFFFF",
  border: "none",
  borderRadius: 10,
  padding: "10px 16px",
  fontWeight: 600,
  fontFamily: font,
  cursor: "pointer",
};

const secondary: React.CSSProperties = {
  background: "#FFFFFF",
  color: INDIGO,
  border: `1px solid ${LINE}`,
  borderRadius: 10,
  padding: "9px 14px",
  fontWeight: 600,
  fontFamily: font,
  cursor: "pointer",
};

/** `2026-03-04T09:30` for the datetime-local field. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EmailEditor() {
  const { id } = useParams({ from: "/_authenticated/email/$id" });
  const projectId = readActiveProjectId();

  const load = useServerFn(getSequenceEmail);
  const save = useServerFn(updateSequenceEmail);
  const suggest = useServerFn(suggestSubjectLines);
  const audiencesFn = useServerFn(listMailchimpAudiences);
  const genImage = useServerFn(generateBrandImage);
  const uploadImage = useServerFn(uploadGeneratedImageToScheduler);

  const [email, setEmail] = useState<SequenceEmail | null>(null);
  const [meta, setMeta] = useState<{ total: number; position: number; sequenceTitle: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [titles, setTitles] = useState<string[]>([]);
  const [audiences, setAudiences] = useState<{ id: string; name: string }[]>([]);
  const [mcConnected, setMcConnected] = useState(true);

  const [subject, setSubject] = useState("");
  const [preview, setPreview] = useState("");
  const [body, setBody] = useState("");
  const [audienceId, setAudienceId] = useState("");
  const [audienceName, setAudienceName] = useState("");
  const [sendAt, setSendAt] = useState("");
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [heroPath, setHeroPath] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await load({ data: { id } });
        if (!live) return;
        setEmail(res.email);
        setMeta({ total: res.total, position: res.position, sequenceTitle: res.sequenceTitle });
        setSubject(res.email.subject);
        setPreview(res.email.previewText);
        setBody(res.email.body);
        setAudienceId(res.email.audienceId ?? "");
        setAudienceName(res.email.audienceName ?? "");
        setSendAt(toLocalInput(res.email.plannedSendAt));
        setHeroUrl(res.email.heroImageUrl);
        setHeroPath(res.email.heroImagePath);
      } catch (e) {
        if (live) toast.error(e instanceof Error ? e.message : "Couldn't open that email.");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await audiencesFn({});
        if (!live) return;
        setMcConnected(res.connected);
        setAudiences(res.audiences);
      } catch {
        if (live) setMcConnected(false);
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await save({
        data: {
          id,
          subject,
          previewText: preview,
          body,
          audienceId: audienceId || null,
          audienceName: audienceName || null,
          plannedSendAt: sendAt ? new Date(sendAt).toISOString() : null,
          heroImageUrl: heroUrl,
          heroImagePath: heroPath,
        },
      });
      toast.success("Saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSuggest() {
    if (!projectId) return toast.error("Pick a workspace first.");
    if (body.trim().length < 20) return toast.error("Write the body first, then I'll suggest titles.");
    setBusy("titles");
    try {
      const res = await suggest({ data: { projectId, body, current: subject || undefined } });
      setTitles(res.subjects);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No titles came back.");
    } finally {
      setBusy(null);
    }
  }

  async function handleGenerateImage() {
    if (!projectId) return toast.error("Pick a workspace first.");
    setBusy("image");
    try {
      const prompt = `Header image for a marketing email. Subject: ${subject || "brand update"}. Theme: ${body.slice(0, 300)}`;
      const img = await genImage({ data: { prompt, projectId, size: "1536x1024" } });
      const up = await uploadImage({ data: { b64: img.b64, mime: img.mime } });
      const path = (up as { path: string }).path;
      setHeroPath(path);
      setHeroUrl(`data:${img.mime};base64,${img.b64}`);
      toast.success("Image added. Save to keep it.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The image didn't come back.");
    } finally {
      setBusy(null);
    }
  }

  async function handleUpload(file: File) {
    setBusy("image");
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
        r.onerror = () => reject(new Error("Couldn't read that file."));
        r.readAsDataURL(file);
      });
      const up = await uploadImage({ data: { b64, mime: file.type || "image/png" } });
      setHeroPath((up as { path: string }).path);
      setHeroUrl(`data:${file.type || "image/png"};base64,${b64}`);
      toast.success("Image added. Save to keep it.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That upload didn't work.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell title="Edit email">
      <div style={{ fontFamily: font, color: NAVY, display: "grid", gap: 16, maxWidth: 900 }}>
        <div>
          <Link to="/email" style={{ color: PURPLE, fontWeight: 600, fontSize: 14 }}>
            ← All emails
          </Link>
          <h1 style={{ margin: "8px 0 0", fontSize: 22, fontWeight: 700, color: INDIGO, overflowWrap: "anywhere" }}>
            {meta ? `Email ${meta.position} of ${meta.total}` : "Email"}
          </h1>
          {meta && (
            <p style={{ margin: "4px 0 0", color: NAVY, opacity: 0.8 }}>{meta.sequenceTitle}</p>
          )}
        </div>

        {loading && <div style={CARD}>Loading…</div>}

        {!loading && !email && <div style={CARD}>That email isn't here any more.</div>}

        {!loading && email && (
          <>
            <section style={{ ...CARD, display: "grid", gap: 14 }}>
              <div>
                <label style={label}>Subject line</label>
                <input
                  style={input}
                  value={subject}
                  maxLength={300}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="What lands in the inbox"
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  <button type="button" style={secondary} onClick={handleSuggest} disabled={busy === "titles"}>
                    {busy === "titles" ? "Thinking…" : "Suggest titles"}
                  </button>
                  {titles.map((t) => (
                    <button
                      key={t}
                      type="button"
                      style={{ ...secondary, borderColor: TINT.purple, color: PURPLE, textAlign: "left" }}
                      onClick={() => setSubject(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={label}>Preview text</label>
                <input
                  style={input}
                  value={preview}
                  maxLength={300}
                  onChange={(e) => setPreview(e.target.value)}
                  placeholder="The line shown under the subject"
                />
              </div>

              <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
                <div>
                  <label style={label}>Audience</label>
                  {mcConnected && audiences.length > 0 ? (
                    <select
                      style={input}
                      value={audienceId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setAudienceId(v);
                        setAudienceName(audiences.find((a) => a.id === v)?.name ?? "");
                      }}
                    >
                      <option value="">Not chosen yet</option>
                      {audiences.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <>
                      <input
                        style={input}
                        value={audienceName}
                        maxLength={200}
                        onChange={(e) => setAudienceName(e.target.value)}
                        placeholder="Who this goes to"
                      />
                      <p style={{ margin: "6px 0 0", fontSize: 12, color: NAVY, opacity: 0.75 }}>
                        Connect Mailchimp on the{" "}
                        <Link to="/connect" style={{ color: PURPLE, fontWeight: 600 }}>
                          Integrations
                        </Link>{" "}
                        page to pick a real audience.
                      </p>
                    </>
                  )}
                </div>

                <div>
                  <label style={label}>Planned send</label>
                  <input
                    style={input}
                    type="datetime-local"
                    value={sendAt}
                    onChange={(e) => setSendAt(e.target.value)}
                  />
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: NAVY, opacity: 0.75 }}>
                    Planning only — nothing sends until you sync the sequence.
                  </p>
                </div>
              </div>
            </section>

            <section style={{ ...CARD, display: "grid", gap: 12 }}>
              <div>
                <label style={label}>Image</label>
                {heroUrl ? (
                  <img
                    src={heroUrl}
                    alt="Email header"
                    style={{ width: "100%", borderRadius: 12, border: `1px solid ${LINE}` }}
                  />
                ) : (
                  <div
                    style={{
                      border: `1px dashed ${LINE}`,
                      borderRadius: 12,
                      padding: 20,
                      textAlign: "center",
                      color: NAVY,
                      opacity: 0.8,
                      background: SURFACE,
                    }}
                  >
                    No image yet
                  </div>
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button type="button" style={secondary} onClick={handleGenerateImage} disabled={busy === "image"}>
                  {busy === "image" ? "Working…" : "Generate image"}
                </button>
                <button type="button" style={secondary} onClick={() => fileRef.current?.click()} disabled={busy === "image"}>
                  Upload image
                </button>
                {heroUrl && (
                  <button
                    type="button"
                    style={{ ...secondary, color: PINK }}
                    onClick={() => {
                      setHeroUrl(null);
                      setHeroPath(null);
                    }}
                  >
                    Remove
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUpload(f);
                    e.target.value = "";
                  }}
                />
              </div>
            </section>

            <section style={{ ...CARD, display: "grid", gap: 10 }}>
              <label style={label}>Body</label>
              <textarea
                style={{ ...input, minHeight: 320, lineHeight: 1.55, resize: "vertical" }}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write the email"
              />
            </section>

            <section style={{ ...CARD, background: SURFACE }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: PINK, letterSpacing: 0.4 }}>INBOX PREVIEW</div>
              <div
                style={{
                  marginTop: 10,
                  background: "#FFFFFF",
                  border: `1px solid ${LINE}`,
                  borderRadius: 12,
                  padding: 14,
                }}
              >
                <div style={{ fontWeight: 700, color: NAVY, overflowWrap: "anywhere" }}>
                  {subject || "No subject yet"}
                </div>
                <div style={{ color: NAVY, opacity: 0.75, fontSize: 14, overflowWrap: "anywhere" }}>
                  {preview || body.slice(0, 90) || "No preview text"}
                </div>
              </div>
            </section>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button type="button" style={primary} onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save email"}
              </button>
              <Link to="/email" style={{ ...secondary, textDecoration: "none", display: "inline-block" }}>
                Done
              </Link>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
