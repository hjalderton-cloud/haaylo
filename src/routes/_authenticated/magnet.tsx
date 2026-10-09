import { createFileRoute, redirect } from "@tanstack/react-router";

/** The Lead Magnet Engine now lives inside the Lead Funnel page. */
export const Route = createFileRoute("/_authenticated/magnet")({
  beforeLoad: () => {
    throw redirect({ to: "/funnel" });
  },
});
