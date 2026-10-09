import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { redeemCode } from "@/lib/codes.functions";
import {
  createMembershipCheckout,
  getMyMembership,
  type MembershipState,
} from "@/lib/billing.functions";
import { MEMBERSHIP_FEATURES, formatDate, stageForDate } from "@/lib/pricing";
import wordmarkAsset from "@/assets/haaylo-logo-2026.png.asset.json";
import { friendlyError } from "@/lib/friendly-error";
import { BG, NAVY, INDIGO, PURPLE, PINK, LINE, font } from "@/lib/theme";

const GREY_TEXT = NAVY;

export const Route = createFileRoute("/pricing")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Membership | haaylo.com" },
      {
        name: "description",
        content:
          "One haaylo membership unlocks everything: Strategy Profile, Engine, 90-day strategy, content planner, competitor radar and multi-platform content. Cancel anytime.",
      },
      { property: "og:title", content: "haaylo Membership: one plan, everything unlocked" },
      {
        property: "og:description",
        content:
          "Founding Member pricing: £99 for your first year, then £49/month. Everything haaylo does, in one membership.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [redeemInput, setRedeemInput] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [membership, setMembership] = useState<MembershipState | null>(null);
  const redeemFn = useServerFn(redeemCode);
  const checkoutFn = useServerFn(createMembershipCheckout);
  const membershipFnRaw = useServerFn(getMyMembership);

  const stage = stageForDate();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) return;
      try {
        setMembership(await membershipFnRaw());
      } catch {
        /* silent */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function join() {
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || u.user.is_anonymous) {
        navigate({ to: "/auth", search: { redirect: "/pricing" } as never });
        return;
      }
      const res = await checkoutFn({ data: { origin: window.location.origin } });
      if (res.url) window.location.href = res.url;
      else throw new Error(res.error || "Could not start checkout");
    } catch (e) {
      toast.error(friendlyError(e, "We could not start checkout. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function onRedeem(e: React.FormEvent) {
    e.preventDefault();
    if (!redeemInput.trim()) return;
    setRedeeming(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || u.user.is_anonymous) {
        navigate({ to: "/auth", search: { redirect: "/pricing" } as never });
        return;
      }
      const r = await redeemFn({ data: { code: redeemInput.trim() } });
      if (r?.ok) {
        toast.success("Code redeemed. Your membership is unlocked");
        setRedeemInput("");
        setTimeout(() => navigate({ to: "/engine" }), 800);
      } else {
        toast.error(r?.error || "Could not redeem code");
      }
    } catch (err) {
      toast.error(friendlyError(err, "Could not redeem that code. Check it and try again."));
    } finally {
      setRedeeming(false);
    }
  }

  const isMember = membership?.active === true;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: BG,
        color: NAVY,
        fontFamily: font,
        padding: "32px 20px 64px",
      }}
    >
      <header
        style={{
          maxWidth: 900,
          margin: "0 auto 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <Link to="/" style={{ display: "inline-block" }}>
          <img src={wordmarkAsset.url} alt="haaylo" style={{ height: 56, width: "auto" }} />
        </Link>
        <Link
          to="/engine"
          style={{
            color: NAVY,
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 600,
            padding: "8px 14px",
            border: `1px solid ${LINE}`,
            borderRadius: 999,
            background: "#FFFFFF",
          }}
        >
          Back to Engine
        </Link>
      </header>

      <div style={{ maxWidth: 620, margin: "0 auto" }}>
        <div
          style={{
            background: NAVY,
            color: "#FFFFFF",
            borderRadius: 14,
            padding: "14px 18px",
            fontSize: 13.5,
            lineHeight: 1.6,
            marginBottom: 24,
            textAlign: "center",
          }}
        >
          haaylo is closed for beta testing with our founding member cohort. Access is invite only.
          When the site goes live to everyone it will be £49 a month.
        </div>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <h1
            style={{
              fontFamily: font,
              fontWeight: 700,
              fontSize: "clamp(30px, 5vw, 46px)",
              lineHeight: 1.05,
              margin: 0,
              color: NAVY,
            }}
          >
            One membership. <span style={{ color: PINK }}>Everything unlocked.</span>
          </h1>
          <p style={{ color: GREY_TEXT, marginTop: 10, fontSize: 15 }}>
            No tiers, no add-ons. Every haaylo feature, including everything we ship next.
          </p>
        </div>

        <div
          style={{
            background: "#FFFFFF",
            border: `2px solid ${PINK}`,
            borderRadius: 22,
            padding: "26px 22px 22px",
            position: "relative",
          }}
        >
          {stage.membershipType !== "standard" && (
            <span
              style={{
                position: "absolute",
                top: -12,
                left: "50%",
                transform: "translateX(-50%)",
                background: PINK,
                color: "#FFFFFF",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: ".14em",
                textTransform: "uppercase",
                padding: "5px 12px",
                borderRadius: 999,
                whiteSpace: "nowrap",
              }}
            >
              Limited founding offer
            </span>
          )}

          <div
            style={{
              fontFamily: font,
              fontWeight: 600,
              fontSize: 18,
              letterSpacing: ".04em",
              color: PINK,
              textTransform: "uppercase",
            }}
          >
            {stage.title}
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 12 }}>
            <span
              style={{
                fontFamily: font,
                fontWeight: 700,
                fontSize: 48,
                color: NAVY,
                lineHeight: 1,
              }}
            >
              {stage.amount}
            </span>
            <span style={{ color: GREY_TEXT, fontSize: 14, fontWeight: 600 }}>
              {stage.membershipType === "standard" ? "/month" : "for your first year"}
            </span>
          </div>

          <p style={{ color: PINK, fontSize: 13, fontWeight: 600, marginTop: 10 }}>
            {stage.disclosure}
          </p>
          {stage.deadline && (
            <p style={{ color: GREY_TEXT, fontSize: 12.5, marginTop: -4 }}>{stage.deadline}</p>
          )}

          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: "18px 0 0",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 8,
            }}
          >
            {MEMBERSHIP_FEATURES.map((f) => (
              <li
                key={f}
                style={{ display: "flex", gap: 8, fontSize: 13.5, color: INDIGO, lineHeight: 1.4 }}
              >
                <span aria-hidden style={{ color: PURPLE, fontWeight: 700 }}>
                  ✓
                </span>
                <span>{f}</span>
              </li>
            ))}
          </ul>

          {isMember ? (
            <div style={{ marginTop: 22 }}>
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: "#EEF9F2",
                  border: "1px solid #BEE8CC",
                  color: "#1E7A4E",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                You're a haaylo member, everything is unlocked.
                {membership?.founding && membership.foundingPeriodEnd
                  ? ` Your founding rate runs until ${formatDate(membership.foundingPeriodEnd)}.`
                  : ""}
              </div>
              <Link
                to="/account"
                style={{
                  display: "block",
                  textAlign: "center",
                  marginTop: 12,
                  padding: "12px 16px",
                  background: "#FFFFFF",
                  color: NAVY,
                  border: `1px solid ${LINE}`,
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Manage membership
              </Link>
            </div>
          ) : (
            <button
              type="button"
              onClick={join}
              disabled={busy}
              style={{
                width: "100%",
                marginTop: 22,
                padding: "14px 16px",
                background: PURPLE,
                color: "#FFFFFF",
                border: "none",
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 700,
                fontFamily: font,
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? "Opening checkout…" : stage.cta}
            </button>
          )}

          <p style={{ textAlign: "center", color: GREY_TEXT, fontSize: 11.5, marginTop: 12 }}>
            Cancel anytime · Prices in GBP, VAT added where applicable
          </p>
        </div>

        <form onSubmit={onRedeem} style={{ maxWidth: 460, margin: "32px auto 0", display: "flex", gap: 8 }}>
          <input
            value={redeemInput}
            onChange={(e) => setRedeemInput(e.target.value.toUpperCase())}
            placeholder="Have a code? Enter it here"
            maxLength={64}
            style={{
              flex: 1,
              padding: "12px 14px",
              background: "#FFFFFF",
              border: `1px solid ${LINE}`,
              borderRadius: 10,
              color: NAVY,
              fontSize: 14,
              fontFamily: "monospace",
              letterSpacing: ".08em",
            }}
          />
          <button
            type="submit"
            disabled={redeeming || !redeemInput.trim()}
            style={{
              padding: "12px 18px",
              background: "#FFFFFF",
              color: NAVY,
              border: `1px solid ${LINE}`,
              borderRadius: 10,
              fontWeight: 600,
              fontFamily: font,
              cursor: redeeming ? "not-allowed" : "pointer",
            }}
          >
            {redeeming ? "…" : "Redeem"}
          </button>
        </form>
      </div>
    </div>
  );
}
