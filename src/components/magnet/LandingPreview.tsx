import { readableOn, withAlpha, type MagnetConfig } from "@/lib/magnet-schema";
import { magnetTokens } from "@/lib/magnet-tokens";

export function LandingPreview({
  config,
  mailchimpConnected,
}: {
  config: MagnetConfig;
  mailchimpConnected: boolean;
}) {
  const t = magnetTokens(config);
  const primary = t.primary;
  const secondary = t.secondary;
  const onPrimary = readableOn(primary);

  return (
    <div className="w-full bg-white text-slate-900" style={{ fontFamily: t.body }}>
      {/* Hero */}
      <section
        className="px-10 py-14"
        style={{ background: `linear-gradient(140deg, ${withAlpha(secondary, 0.06)}, ${withAlpha(primary, 0.1)})` }}
      >
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:items-center">
          <div>
            {config.brand.logo_url ? (
              <img src={config.brand.logo_url} alt="" crossOrigin="anonymous" className="mb-5 h-8 object-contain" />
            ) : (
              <p className="mb-5 text-sm font-semibold" style={{ color: primary, fontFamily: t.heading }}>
                {config.brand.name}
              </p>
            )}
            <p
              className="mb-3 inline-block px-3 py-1 text-xs font-semibold uppercase tracking-wide"
              style={{ background: withAlpha(t.accent, 0.14), color: t.accent, borderRadius: 999 }}
            >
              {config.landing.hero.eyebrow}
            </p>
            <h1
              className="text-4xl leading-tight"
              style={{ color: secondary, fontFamily: t.heading, fontWeight: t.headingWeight }}
            >
              {config.landing.hero.headline}
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-slate-600">
              {config.landing.hero.subheadline}
            </p>
            <button
              type="button"
              className="mt-7 px-6 py-3 text-base font-semibold shadow-lg"
              style={{ background: primary, color: onPrimary, borderRadius: t.radius }}
            >
              {config.landing.hero.cta_label}
            </button>
          </div>

          <div
            className="overflow-hidden border shadow-xl"
            style={{ borderColor: withAlpha(secondary, 0.12), aspectRatio: "4 / 3", borderRadius: t.radius * 1.5 }}
          >
            {config.landing.hero_image_url ? (
              <img
                src={config.landing.hero_image_url}
                alt=""
                crossOrigin="anonymous"
                className="h-full w-full object-cover"
              />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center text-sm"
                style={{ background: withAlpha(primary, 0.1), color: withAlpha(secondary, 0.6) }}
              >
                Hero graphic
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-10 py-14">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {config.landing.features.map((f, i) => (
            <div
              key={i}
              className="border border-slate-200 p-6"
              style={{ borderRadius: t.radius * 1.5 }}
            >
              <div
                className="mb-5 overflow-hidden border"
                style={{ borderColor: withAlpha(secondary, 0.1), aspectRatio: "1 / 1", borderRadius: t.radius }}
              >
                {f.image_url ? (
                  <img src={f.image_url} alt="" crossOrigin="anonymous" className="h-full w-full object-cover" />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center text-xs"
                    style={{ background: withAlpha(primary, 0.08), color: withAlpha(secondary, 0.55) }}
                  >
                    Feature graphic
                  </div>
                )}
              </div>
              <h3
                className="text-lg"
                style={{ color: secondary, fontFamily: t.heading, fontWeight: t.headingWeight }}
              >
                {f.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Opt-in */}
      <section className="px-10 pb-16">
        <div
          className="px-10 py-12 text-center"
          style={{ background: secondary, color: readableOn(secondary), borderRadius: t.radius * 2 }}
        >
          <h2 className="text-3xl" style={{ fontFamily: t.heading, fontWeight: t.headingWeight }}>
            {config.landing.optin.heading}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base opacity-80">{config.landing.optin.body}</p>
          <div className="mx-auto mt-7 flex max-w-lg flex-col gap-3 sm:flex-row">
            <input
              readOnly
              placeholder="you@company.com"
              className="flex-1 border-0 bg-white/95 px-4 py-3 text-slate-900 placeholder:text-slate-400"
              style={{ borderRadius: t.radius }}
            />
            <button
              type="button"
              className="px-6 py-3 font-semibold"
              style={{ background: primary, color: onPrimary, borderRadius: t.radius }}
            >
              {config.landing.optin.button_label}
            </button>
          </div>
          <p className="mt-4 text-xs opacity-70">{config.landing.optin.privacy_note}</p>
          <p className="mt-2 text-xs opacity-60">
            {mailchimpConnected
              ? "Signups sync to your Mailchimp audience."
              : "Add your Mailchimp key on the Account page to sync signups."}
          </p>
        </div>
      </section>
    </div>
  );
}
