import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { gaPageView } from "../lib/analytics";



function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#FAFAFC" },
      { title: "haaylo.com" },
      { name: "description", content: "haaylo.com is an AI inbound marketing engine and social planner for LinkedIn, Facebook and Instagram — strategy, content and posting in one place." },
      { property: "og:site_name", content: "haaylo.com" },
      { property: "og:title", content: "haaylo.com" },
      { property: "og:description", content: "haaylo.com is an AI inbound marketing engine and social planner for LinkedIn, Facebook and Instagram — strategy, content and posting in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "haaylo.com" },
      { name: "twitter:description", content: "haaylo.com is an AI inbound marketing engine and social planner for LinkedIn, Facebook and Instagram — strategy, content and posting in one place." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/efa06203-989c-4437-9c09-bd8c71e32d1e/id-preview-00c1f372--4e72440c-8ce3-4dcc-a95d-571c3dc745d3.lovable.app-1782811493443.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/efa06203-989c-4437-9c09-bd8c71e32d1e/id-preview-00c1f372--4e72440c-8ce3-4dcc-a95d-571c3dc745d3.lovable.app-1782811493443.png" },
    ],
    links: [
      { rel: "icon", type: "image/png", sizes: "256x256", href: "/favicon.png" },
      { rel: "apple-touch-icon", sizes: "192x192", href: "/apple-touch-icon.png" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=Archivo+Black&family=Inter:wght@400;600;800&family=Merriweather:wght@400;700&family=Montserrat:wght@400;700;900&family=DM+Sans:wght@400;500;700&display=swap",
      },
    ],
    scripts: [
      {
        src: "https://www.googletagmanager.com/gtag/js?id=G-P5X4HF0GSG",
        async: true,
      },
      {
        children:
          "window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js', new Date());gtag('config', 'G-P5X4HF0GSG', { send_page_view: false });",
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "haaylo.com",
          url: "https://appcontentcollectiv.lovable.app",
          description: "AI inbound marketing engine and social planner.",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "haaylo.com",
          url: "https://appcontentcollectiv.lovable.app",
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: (props) => <ErrorComponent error={props.error as Error} reset={props.reset} />,
});


function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.searchStr });

  useEffect(() => {
    // Manually fire page_view on every SPA route change; base config disables auto page_view.
    gaPageView(pathname + (search || ""));
  }, [pathname, search]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster theme="light" position="top-center" richColors />
    </QueryClientProvider>
  );
}

