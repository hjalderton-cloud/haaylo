import { createFileRoute } from "@tanstack/react-router";

/**
 * Serves a self-contained embed script for one live opt-in page. The slug,
 * wording and brand colour are baked in server-side, so the site owner only
 * ever pastes one line of code.
 */
export const Route = createFileRoute("/api/public/embed.js")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const slug = (url.searchParams.get("p") ?? "").trim().slice(0, 80);
        const mode = url.searchParams.get("mode") === "popup" ? "popup" : "inline";
        const origin = url.origin;

        let heading = "Get the free guide";
        let button = "Send it to me";
        let colour = "#E4656E";
        let ok = false;

        if (slug) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: page } = await supabaseAdmin
            .from("landing_pages")
            .select("content, status")
            .eq("slug", slug)
            .maybeSingle();
          if (page) {
            ok = true;
            const c = (page.content ?? {}) as Record<string, unknown>;
            if (typeof c["formHeading"] === "string" && c["formHeading"].trim()) heading = c["formHeading"];
            if (typeof c["buttonLabel"] === "string" && c["buttonLabel"].trim()) button = c["buttonLabel"];
            if (typeof c["brandColour"] === "string" && /^#[0-9a-fA-F]{6}$/.test(c["brandColour"])) {
              colour = c["brandColour"];
            }
          }
        }

        const cfg = JSON.stringify({ slug, mode, heading, button, colour, endpoint: `${origin}/api/public/embed-lead` });

        const body = !ok
          ? `console.warn("Haaylo embed: this form is not available.");`
          : `(function(){
  var C = ${cfg};
  var css = "@keyframes hylfade{from{opacity:0}to{opacity:1}}"
    + ".hyl-f{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:420px;box-sizing:border-box}"
    + ".hyl-f h3{margin:0 0 12px;font-size:18px;line-height:1.3;color:#101828}"
    + ".hyl-f input{width:100%;box-sizing:border-box;margin-bottom:8px;padding:11px 12px;border:1px solid #d0d5dd;border-radius:10px;font-size:14px}"
    + ".hyl-f button{width:100%;padding:12px;border:0;border-radius:10px;font-size:14px;font-weight:600;color:#fff;cursor:pointer;background:" + C.colour + "}"
    + ".hyl-f p{margin:8px 0 0;font-size:12px;color:#667085}"
    + ".hyl-ov{position:fixed;inset:0;background:rgba(9,9,20,.6);display:flex;align-items:center;justify-content:center;z-index:2147483000;animation:hylfade .2s ease}"
    + ".hyl-card{background:#fff;border-radius:16px;padding:24px;position:relative;width:min(92vw,420px)}"
    + ".hyl-x{position:absolute;top:8px;right:10px;border:0;background:none;font-size:20px;color:#98a2b3;cursor:pointer;width:auto;padding:4px}";
  var s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);

  function form(){
    var f = document.createElement("form");
    f.className = "hyl-f";
    f.innerHTML = "<h3></h3>"
      + "<input name='firstName' placeholder='First name' required>"
      + "<input name='email' type='email' placeholder='Email address' required>"
      + "<button type='submit'></button>"
      + "<p>No spam. Unsubscribe any time.</p>";
    f.querySelector("h3").textContent = C.heading;
    f.querySelector("button").textContent = C.button;
    f.addEventListener("submit", function(e){
      e.preventDefault();
      var btn = f.querySelector("button");
      btn.disabled = true; btn.textContent = "Sending…";
      fetch(C.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: C.slug,
          firstName: f.firstName.value,
          email: f.email.value
        })
      }).then(function(r){ return r.json(); }).then(function(j){
        if (j && j.ok) {
          if (j.guideUrl) {
            f.innerHTML = "<h3>Thanks, your guide is ready.</h3>";
            var a = document.createElement("a");
            a.href = j.guideUrl; a.target = "_blank"; a.rel = "noopener";
            a.textContent = "Open your guide";
            a.style.cssText = "display:block;text-align:center;margin-top:10px;padding:12px;border-radius:10px;color:#fff;text-decoration:none;font-weight:600;background:" + C.colour;
            f.appendChild(a);
            window.open(j.guideUrl, "_blank", "noopener");
          } else {
            f.innerHTML = "<h3>Thanks, check your inbox.</h3>";
          }
        }
        else { btn.disabled = false; btn.textContent = C.button; f.querySelector("p").textContent = (j && j.error) || "That didn't send. Try again."; }
      }).catch(function(){
        btn.disabled = false; btn.textContent = C.button;
        f.querySelector("p").textContent = "That didn't send. Try again.";
      });
    });
    return f;
  }

  function mount(){
    if (C.mode === "popup") {
      var shown = false;
      var open = function(){
        if (shown) return; shown = true;
        var ov = document.createElement("div"); ov.className = "hyl-ov";
        var card = document.createElement("div"); card.className = "hyl-card";
        var x = document.createElement("button"); x.className = "hyl-x"; x.innerHTML = "&times;";
        x.onclick = function(){ ov.remove(); };
        card.appendChild(x); card.appendChild(form()); ov.appendChild(card);
        ov.addEventListener("click", function(e){ if (e.target === ov) ov.remove(); });
        document.body.appendChild(ov);
      };
      setTimeout(open, 8000);
      document.addEventListener("mouseout", function(e){ if (!e.relatedTarget && e.clientY <= 0) open(); });
      window.hyloOpen = open;
    } else {
      var host = document.getElementById("haaylo-form") || document.currentScript;
      var wrap = document.createElement("div");
      wrap.appendChild(form());
      if (host && host.parentNode && host.id !== "haaylo-form") host.parentNode.insertBefore(wrap, host);
      else if (host) host.appendChild(wrap);
      else document.body.appendChild(wrap);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();`;

        return new Response(body, {
          headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            "Cache-Control": "public, max-age=300",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
