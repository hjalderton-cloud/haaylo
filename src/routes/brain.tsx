import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/brain")({
  beforeLoad: () => {
    throw redirect({ to: "/brain/setup", search: { onboarding: "1" } as never });
  },
});
