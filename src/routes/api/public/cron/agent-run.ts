import { createFileRoute } from "@tanstack/react-router";

/**
 * Agent run sweep: for every active agent_settings row whose cadence is due,
 * drafts a batch of posts into the agent's own queue (agent_posts) and logs an
 * agent_run. Nothing is scheduled or published here — the user approves each
 * post in the AI Agent section first.
 * Called by pg_cron with the service role bearer token.
 */

export const Route = createFileRoute("/api/public/cron/agent-run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Gated by the project's publishable apikey header so it's not abusable publicly.
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
        const provided = request.headers.get("apikey") || request.headers.get("x-cron-secret");
        if (!expected || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runWeeklyPlan } = await import("@/lib/agent.server");

        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("AI not configured", { status: 500 });

        const { data: settings } = await supabaseAdmin
          .from("agent_settings")
          .select("*")
          .eq("active", true);

        let drafted = 0;
        let runs = 0;
        const now = Date.now();

        for (const s of settings ?? []) {
          if (s.paused) continue;
          // Respect cadence: weekly = run if last run was >6 days ago; daily = >23h.
          const lastMs = s.last_run_at ? new Date(s.last_run_at).getTime() : 0;
          const gap = s.cadence === "daily" ? 23 * 60 * 60 * 1000 : 6 * 24 * 60 * 60 * 1000;
          if (now - lastMs < gap) continue;

          runs += 1;
          let status = "drafted";
          let summary = "";

          const { data: run } = await supabaseAdmin
            .from("agent_runs")
            .insert({
              user_id: s.user_id,
              project_id: s.project_id,
              kind: "weekly_plan",
              status: "running",
              summary: "Drafting posts",
            })
            .select("id")
            .single();

          try {
            const result = await runWeeklyPlan(supabaseAdmin, s as never, key, run?.id ?? null);
            drafted += result.drafted.length;
            summary = result.error ?? `Agent drafted ${result.drafted.length} posts for your review`;
            if (result.error) status = "failed";
          } catch (err) {
            status = "failed";
            summary = String((err as Error)?.message ?? err);
          }

          if (run?.id) {
            await supabaseAdmin.from("agent_runs").update({ status, summary }).eq("id", run.id);
          }

          await supabaseAdmin
            .from("agent_settings")
            .update({ last_run_at: new Date().toISOString() })
            .eq("id", s.id);
        }

        return new Response(JSON.stringify({ ok: true, runs, drafted }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
