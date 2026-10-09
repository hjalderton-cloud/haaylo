import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/director")({
  beforeLoad: () => {
    throw redirect({ to: "/engine" });
  },
  component: () => null,
});
