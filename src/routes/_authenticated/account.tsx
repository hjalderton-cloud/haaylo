import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type CSSProperties, type ChangeEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell, CARD } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import {
  createBillingPortal,
  createMembershipCheckout,
  getMyMembership,
  type MembershipState,
} from "@/lib/billing.functions";
import {
  MEMBERSHIP_LABEL,
  formatDate,
  stageForDate,
  statusLabel,
} from "@/lib/pricing";
import {
  getBrandBrain,
  saveBrandBrain,
  type BrandBrain,
} from "@/lib/brandbrain.functions";
import {
  getMailchimpSettings,
  saveMailchimpSettings,
  type MailchimpSettings,
} from "@/lib/mailchimp.functions";
import { SURFACE, NAVY, INDIGO, PINK, GREY, LINE, TINT, font } from "@/lib/theme";

const INPUT: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${LINE}`,
  background: "#FFFFFF",
  color: NAVY,
  fontSize: 13.5,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: font,
};

const LABEL: CSSProperties = {
  display: "block",
  fontSize: 11,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  color: GREY,
  marginBottom: 6,
  fontFamily: font,
};

const SAVE_BTN: CSSProperties = {
  marginTop: 14,
  padding: "10px 18px",
  background: PINK,
  color: "#FFFFFF",
  border: "none",
  borderRadius: 10,
  fontWeight: 900,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: font,
};

function BrandBrainSection() {
  const getFn = useServerFn(getBrandBrain);
  const saveFn = useServerFn(saveBrandBrain);
  const [form, setForm] = useState<BrandBrain>({
    brand_name: null,
    target_audience: null,
    brand_voice: null,
    primary_color: null,
    secondary_color: null,
    logo_url: null,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setForm(await getFn());
      } catch {
        /* silent */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (key: keyof BrandBrain) => (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save() {
    setSaving(true);
    try {
      await saveFn({ data: form });
      toast.success("Brand brain saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section style={{ ...CARD, marginTop: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: ".08em", color: GREY, textTransform: "uppercase", fontFamily: font }}>
        Brand brain
      </div>
      <p style={{ color: GREY, fontSize: 13, marginTop: 8, fontFamily: font }}>
        The details haaylo uses to keep everything it writes and designs on-brand.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <div>
          <label style={LABEL}>Brand name</label>
          <input style={INPUT} value={form.brand_name ?? ""} onChange={set("brand_name")} />
        </div>
        <div>
          <label style={LABEL}>Logo URL</label>
          <input style={INPUT} value={form.logo_url ?? ""} onChange={set("logo_url")} placeholder="https://…" />
        </div>
        <div>
          <label style={LABEL}>Primary colour</label>
          <input style={INPUT} value={form.primary_color ?? ""} onChange={set("primary_color")} placeholder="#E4656E" />
        </div>
        <div>
          <label style={LABEL}>Secondary colour</label>
          <input style={INPUT} value={form.secondary_color ?? ""} onChange={set("secondary_color")} placeholder="#0B0B1F" />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={LABEL}>Target audience</label>
          <textarea style={{ ...INPUT, minHeight: 70 }} value={form.target_audience ?? ""} onChange={set("target_audience")} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={LABEL}>Brand voice</label>
          <textarea style={{ ...INPUT, minHeight: 70 }} value={form.brand_voice ?? ""} onChange={set("brand_voice")} />
        </div>
      </div>
      <button type="button" onClick={save} disabled={saving} style={{ ...SAVE_BTN, cursor: saving ? "wait" : "pointer" }}>
        {saving ? "Saving…" : "Save brand brain"}
      </button>
    </section>
  );
}

function MailchimpSection() {
  const getFn = useServerFn(getMailchimpSettings);
  const saveFn = useServerFn(saveMailchimpSettings);
  const [form, setForm] = useState<MailchimpSettings>({
    mailchimp_api_key: null,
    mailchimp_server_prefix: null,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setForm(await getFn());
      } catch {
        /* silent */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setSaving(true);
    try {
      await saveFn({ data: form });
      toast.success("Mailchimp settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section style={{ ...CARD, marginTop: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: ".08em", color: GREY, textTransform: "uppercase", fontFamily: font }}>
        Mailchimp
      </div>
      <p style={{ color: GREY, fontSize: 13, marginTop: 8, fontFamily: font }}>
        Connect your Mailchimp account so your nurture sequences can be exported as draft campaigns.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <div>
          <label style={LABEL}>API key</label>
          <input
            style={INPUT}
            type="password"
            value={form.mailchimp_api_key ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, mailchimp_api_key: e.target.value }))}
          />
        </div>
        <div>
          <label style={LABEL}>Server prefix</label>
          <input
            style={INPUT}
            value={form.mailchimp_server_prefix ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, mailchimp_server_prefix: e.target.value }))}
            placeholder="e.g. us21"
          />
        </div>
      </div>
      <button type="button" onClick={save} disabled={saving} style={{ ...SAVE_BTN, cursor: saving ? "wait" : "pointer" }}>
        {saving ? "Saving…" : "Save Mailchimp settings"}
      </button>
    </section>
  );
}

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "Account & billing — haaylo" },
      {
        name: "description",
        content: "Manage your haaylo membership, billing details and renewal date.",
      },
      { property: "og:title", content: "Account & billing — haaylo" },
      {
        property: "og:description",
        content: "Your haaylo membership status, renewal date and billing settings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const [membership, setMembership] = useState<MembershipState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const membershipFn = useServerFn(getMyMembership);
  const portalFn = useServerFn(createBillingPortal);
  const checkoutFn = useServerFn(createMembershipCheckout);
  const stage = stageForDate();

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        setEmail(data.user?.email ?? null);
        setMembership(await membershipFn());
      } catch {
        /* silent */
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openPortal() {
    setBusy(true);
    try {
      const res = await portalFn({ data: { origin: window.location.origin } });
      if (res.url) window.location.href = res.url;
      else throw new Error(res.error || "Could not open billing");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open billing");
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    setBusy(true);
    try {
      const res = await checkoutFn({ data: { origin: window.location.origin } });
      if (res.url) window.location.href = res.url;
      else throw new Error(res.error || "Could not start checkout");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  const active = membership?.active === true;
  const label = membership?.membershipType
    ? MEMBERSHIP_LABEL[membership.membershipType]
    : active
      ? "haaylo Membership"
      : "No membership";

  return (
    <AppShell title="Account & billing">
      <section style={{ ...CARD, marginBottom: 16 }}>
        <div style={{ fontSize: 11, letterSpacing: ".08em", color: GREY, textTransform: "uppercase", fontFamily: font }}>
          Signed in as
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4, color: NAVY, fontFamily: font }}>{email ?? "—"}</div>
      </section>

      <section style={{ ...CARD }}>
        <div style={{ fontSize: 11, letterSpacing: ".08em", color: GREY, textTransform: "uppercase", fontFamily: font }}>
          Membership
        </div>

        {loading ? (
          <p style={{ color: GREY, marginTop: 10, fontFamily: font }}>Loading…</p>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginTop: 8,
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontFamily: font, fontWeight: 800, fontSize: 18, color: NAVY }}>{label}</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 900,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: active ? TINT.green : SURFACE,
                  color: active ? TINT.greenInk : GREY,
                  border: `1px solid ${active ? TINT.green : LINE}`,
                }}
              >
                {statusLabel(membership?.status)}
              </span>
            </div>

            {active ? (
              <div style={{ marginTop: 12, color: INDIGO, fontSize: 13.5, lineHeight: 1.7, fontFamily: font }}>
                {membership?.founding && membership.foundingPeriodEnd && (
                  <div>
                    Your founding rate runs until{" "}
                    <strong>{formatDate(membership.foundingPeriodEnd)}</strong>, then your
                    membership continues at £49/month.
                  </div>
                )}
                {membership?.currentPeriodEnd && (
                  <div>
                    {membership.cancelAtPeriodEnd ? "Access ends" : "Next renewal"}:{" "}
                    <strong>{formatDate(membership.currentPeriodEnd)}</strong>
                  </div>
                )}
                {membership?.status === "past_due" && (
                  <div style={{ color: TINT.pinkInk }}>
                    Your last payment failed — update your card to keep your membership.
                  </div>
                )}
                {membership?.hasCustomer ? (
                  <>
                    <button
                      type="button"
                      onClick={openPortal}
                      disabled={busy}
                      style={{
                        marginTop: 14,
                        padding: "12px 18px",
                        background: PINK,
                        color: "#FFFFFF",
                        border: "none",
                        borderRadius: 10,
                        fontWeight: 900,
                        fontSize: 13,
                        cursor: busy ? "wait" : "pointer",
                        fontFamily: font,
                      }}
                    >
                      {busy ? "Opening…" : "Manage billing"}
                    </button>
                    <p style={{ color: GREY, fontSize: 12, marginTop: 8, fontFamily: font }}>
                      Update your card, download invoices or cancel — you keep access until the end
                      of the period you've paid for.
                    </p>
                  </>
                ) : (
                  <div
                    style={{
                      marginTop: 14,
                      padding: "12px 14px",
                      borderRadius: 10,
                      background: SURFACE,
                      border: `1px solid ${LINE}`,
                      color: GREY,
                      fontSize: 12.5,
                      lineHeight: 1.6,
                      fontFamily: font,
                    }}
                  >
                    Your access was granted directly (complimentary or legacy access), so there's no
                    payment method or invoices to manage yet. A billing portal will appear here if
                    you ever start a paid membership.
                  </div>
                )}
              </div>
            ) : (
              <div style={{ marginTop: 12, color: INDIGO, fontSize: 13.5, lineHeight: 1.7, fontFamily: font }}>
                <div>
                  You don't have an active membership. {stage.disclosure}
                  {stage.deadline ? ` ${stage.deadline}` : ""}
                </div>
                <button
                  type="button"
                  onClick={join}
                  disabled={busy}
                  style={{
                    marginTop: 14,
                    padding: "12px 18px",
                    background: PINK,
                    color: "#FFFFFF",
                    border: "none",
                    borderRadius: 10,
                    fontWeight: 900,
                    fontSize: 13,
                    cursor: busy ? "wait" : "pointer",
                    fontFamily: font,
                  }}
                >
                  {busy ? "Opening checkout…" : stage.cta}
                </button>
                <p style={{ marginTop: 10 }}>
                  <Link to="/pricing" style={{ color: PINK, fontWeight: 700, fontFamily: font }}>
                    See what's included →
                  </Link>
                </p>
              </div>
            )}
          </>
        )}
      </section>

      <BrandBrainSection />
      <MailchimpSection />
    </AppShell>
  );
}
