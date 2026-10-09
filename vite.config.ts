// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import type { Plugin } from "vite";

/**
 * Serves a transparent 1×1 PNG placeholder for Lovable CDN asset requests
 * (`/__l5e/assets-v1/*`) that are unreachable outside Lovable's preview proxy.
 * Only active in the Base44 sandbox (BASE44_PREVIEW_MODE === "1").
 */
function lovableAssetPlaceholder(): Plugin {
  return {
    name: "base44:lovable-asset-placeholder",
    apply: "serve",
    configureServer(server) {
      if (process.env.BASE44_PREVIEW_MODE !== "1") return;
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/__l5e/assets-v1/")) return next();
        const png = Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
          "base64",
        );
        res.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
        res.end(png);
      });
    },
  };
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [mcpPlugin(), lovableAssetPlaceholder()],
  },
});
