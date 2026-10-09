import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const MAX_BYTES = 10 * 1024 * 1024;

function isNewKey(v: string) {
  return v.startsWith("sb_publishable_") || v.startsWith("sb_secret_");
}

export const Route = createFileRoute("/api/post-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = process.env["SUPABASE_URL"];
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!url || !key) return new Response("Backend not configured", { status: 500 });

        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token || token.split(".").length !== 3) return new Response("Unauthorized", { status: 401 });

        const supabase = createClient<Database>(url, key, {
          global: {
            fetch: (input, init) => {
              const headers = new Headers(init?.headers);
              if (isNewKey(key) && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
              headers.set("apikey", key);
              return fetch(input, { ...init, headers });
            },
            headers: { Authorization: `Bearer ${token}` },
          },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });

        const { data: claimData, error: claimErr } = await supabase.auth.getClaims(token);
        const userId = claimData?.claims?.sub;
        if (claimErr || !userId) return new Response("Unauthorized", { status: 401 });

        const form = await request.formData();
        const postId = String(form.get("postId") ?? "");
        const file = form.get("file");
        if (!postId) return new Response("Missing post", { status: 400 });
        if (!(file instanceof File)) return new Response("Missing file", { status: 400 });

        const ext = ALLOWED[file.type];
        if (!ext) return new Response("That file type isn't supported — use PNG, JPG or WebP.", { status: 415 });
        if (file.size > MAX_BYTES) return new Response("That image is over 10MB — try a smaller file.", { status: 413 });

        const { data: post, error: postErr } = await supabase
          .from("content_posts")
          .select("id")
          .eq("id", postId)
          .eq("user_id", userId)
          .maybeSingle();
        if (postErr || !post) return new Response("Post not found", { status: 404 });

        const path = `${userId}/post-images/${postId}/${crypto.randomUUID()}.${ext}`;
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error: upErr } = await supabaseAdmin.storage
          .from("scheduler-media")
          .upload(path, bytes, { contentType: file.type, upsert: false });
        if (upErr) return new Response(upErr.message, { status: 500 });

        const { data: signed } = await supabaseAdmin.storage
          .from("scheduler-media")
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        const publicUrl = signed?.signedUrl ?? "";

        const { error: updErr } = await supabase
          .from("content_posts")
          .update({ media_url: publicUrl, media_path: path } as never)
          .eq("id", postId)
          .eq("user_id", userId);
        if (updErr) return new Response(updErr.message, { status: 500 });

        return new Response(JSON.stringify({ url: publicUrl, path }), {
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
