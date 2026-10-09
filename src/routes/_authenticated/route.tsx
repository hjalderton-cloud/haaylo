import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ActiveProjectProvider } from "@/hooks/useActiveProject";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user || data.user.is_anonymous) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
    return { user: data.user };
  },
  component: () => (
    <ActiveProjectProvider>
      <Outlet />
    </ActiveProjectProvider>
  ),
});
