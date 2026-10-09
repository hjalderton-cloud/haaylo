import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  amIAdmin,
  claimAdminBootstrap,
  createRedemptionCode,
  listRedemptionCodes,
  deleteRedemptionCode,
} from "@/lib/codes.functions";
import { BG, SURFACE, NAVY, INDIGO, PINK, GREY, LINE, TINT, font } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/admin/codes")({
  head: () => ({
    meta: [
      { title: "Admin — Redemption codes" },
      { name: "description", content: "Generate and manage comp-access redemption codes." },
      { property: "og:title", content: "Admin — Redemption codes" },
      { property: "og:description", content: "Internal admin tool." },
    ],
  }),
  component: AdminCodesPage,
});

type Code = {
  id: string;
  code: string;
  tier: "starter" | "pro" | "expert";
  expires_at: string | null;
  single_use: boolean;
  note: string | null;
  redeemed_by: string | null;
  redeemed_at: string | null;
  created_at: string;
};

function AdminCodesPage() {
  const amIAdminFn = useServerFn(amIAdmin);
  const claimFn = useServerFn(claimAdminBootstrap);
  const listFn = useServerFn(listRedemptionCodes);
  const createFn = useServerFn(createRedemptionCode);
  const deleteFn = useServerFn(deleteRedemptionCode);

  const [status, setStatus] = useState<"loading" | "not_admin" | "no_admin_yet" | "ok">("loading");
  const [rows, setRows] = useState<Code[]>([]);
  const [code, setCode] = useState("");
  const [tier, setTier] = useState<"starter" | "pro" | "expert">("pro");
  const [expiresAt, setExpiresAt] = useState("");
  const [singleUse, setSingleUse] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const s = await amIAdminFn();
      if (s.isAdmin) {
        setStatus("ok");
        const list = await listFn();
        setRows(list as Code[]);
      } else if (!s.adminExists) {
        setStatus("no_admin_yet");
      } else {
        setStatus("not_admin");
      }
    } catch {
      setStatus("not_admin");
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function onClaim() {
    setBusy(true);
    try {
      const r = await claimFn();
      if (r?.ok) { toast.success("You are now admin"); await load(); }
      else toast.error(r?.error || "Failed");
    } finally { setBusy(false); }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await createFn({ data: {
        code: code || undefined,
        tier,
        expiresAt: expiresAt || null,
        singleUse,
        note: note || undefined,
      } });
      setCode(""); setNote(""); setExpiresAt("");
      toast.success("Code created");
      const list = await listFn();
      setRows(list as Code[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally { setBusy(false); }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this code?")) return;
    await deleteFn({ data: { id } });
    setRows((r) => r.filter((x) => x.id !== id));
  }

  const shell: React.CSSProperties = {
    minHeight: "100vh", background: BG, color: NAVY,
    fontFamily: font, padding: "32px 20px",
  };
  const card: React.CSSProperties = {
    background: SURFACE, border: `1px solid ${LINE}`,
    borderRadius: 16, padding: 20, maxWidth: 900, margin: "0 auto 20px",
  };
  const input: React.CSSProperties = {
    width: "100%", padding: "10px 12px", background: "#FFFFFF",
    border: `1px solid ${LINE}`, borderRadius: 10, color: NAVY, fontSize: 14, fontFamily: font,
  };
  const btn: React.CSSProperties = {
    padding: "10px 16px", background: PINK, color: "#FFFFFF",
    border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer", fontFamily: font,
  };
  const label: React.CSSProperties = { fontSize: 12, color: GREY, marginBottom: 6, display: "block", fontWeight: 700, fontFamily: font };

  if (status === "loading") return <div style={shell}>Loading…</div>;

  if (status === "no_admin_yet") {
    return (
      <div style={shell}>
        <div style={card}>
          <h1 style={{ fontFamily: font, fontSize: 28, margin: 0 }}>Claim admin</h1>
          <p style={{ color: GREY, fontFamily: font }}>No admin exists yet. You can claim admin access on this account (bootstrap only — once claimed, this option disappears).</p>
          <button style={btn} disabled={busy} onClick={onClaim}>Make me admin</button>
        </div>
      </div>
    );
  }
  if (status === "not_admin") {
    return (
      <div style={shell}>
        <div style={card}><h1 style={{ fontFamily: font }}>Not authorised</h1><p style={{ color: GREY, fontFamily: font }}>Admin only.</p></div>
      </div>
    );
  }

  return (
    <div style={shell}>
      <div style={card}>
        <h1 style={{ fontFamily: font, fontSize: 28, margin: 0 }}>Redemption codes</h1>
        <p style={{ color: GREY, fontSize: 13, fontFamily: font }}>Create comp-access codes. Redeemers bypass Stripe and trial limits.</p>
        <form onSubmit={onCreate} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
          <div>
            <label style={label}>Code (blank = random)</label>
            <input style={input} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. OLI-FOUNDER" maxLength={64} />
          </div>
          <div>
            <label style={label}>Tier</label>
            <select style={input} value={tier} onChange={(e) => setTier(e.target.value as "starter" | "pro" | "expert")}>
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="expert">Expert</option>
            </select>
          </div>
          <div>
            <label style={label}>Expires (optional)</label>
            <input style={input} type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
          <div>
            <label style={label}>Single-use</label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <input type="checkbox" checked={singleUse} onChange={(e) => setSingleUse(e.target.checked)} />
              <span style={{ fontSize: 13 }}>One redemption per code</span>
            </label>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={label}>Note / label</label>
            <input style={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Oli — founding tech team" maxLength={200} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <button type="submit" style={btn} disabled={busy}>{busy ? "Saving…" : "Create code"}</button>
          </div>
        </form>
      </div>

      <div style={card}>
        <h2 style={{ fontFamily: font, fontSize: 18, margin: "0 0 12px" }}>Existing codes</h2>
        {rows.length === 0 && <p style={{ color: GREY, fontSize: 13, fontFamily: font }}>No codes yet.</p>}
        <div style={{ display: "grid", gap: 8 }}>
          {rows.map((r) => {
            const used = r.single_use && r.redeemed_by;
            const expired = r.expires_at && new Date(r.expires_at) < new Date();
            return (
              <div key={r.id} style={{
                display: "grid", gridTemplateColumns: "1.4fr .8fr .9fr 1.4fr auto",
                gap: 10, alignItems: "center", padding: "10px 12px",
                background: "#FFFFFF", border: `1px solid ${LINE}`, borderRadius: 10, fontSize: 13,
                opacity: used || expired ? 0.55 : 1,
              }}>
                <code style={{ fontFamily: "monospace", fontWeight: 700, letterSpacing: ".1em" }}>{r.code}</code>
                <span style={{ textTransform: "uppercase", fontWeight: 700, color: TINT.pinkInk }}>{r.tier}</span>
                <span style={{ color: GREY, fontFamily: font }}>
                  {used ? "USED" : expired ? "EXPIRED" : r.single_use ? "unused" : "multi-use"}
                </span>
                <span style={{ color: GREY, fontFamily: font }}>{r.note ?? ""}</span>
                <button type="button" onClick={() => onDelete(r.id)} style={{
                  padding: "6px 10px", background: "transparent", color: PINK,
                  border: `1px solid ${LINE}`, borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: font,
                }}>Delete</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
