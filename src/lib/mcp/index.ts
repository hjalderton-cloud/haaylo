import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listClients from "./tools/list-clients";
import getBrain from "./tools/get-brain";
import listPosts from "./tools/list-posts";
import createPost from "./tools/create-post";
import updatePost from "./tools/update-post";

// The OAuth issuer must be the direct Supabase host; the project ref is the only
// value that survives publish unchanged.
const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "haaylo",
  title: "Haaylo",
  version: "0.1.0",
  instructions:
    "Tools for Haaylo, a marketing content workspace. Use `list_clients` to find the user's workspaces, `get_brain` to read a client's brand voice and positioning before writing anything, `list_posts` to review saved content, and `create_post` / `update_post` to save or amend posts and captions. Write in British English and match the brand voice in the Brain.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listClients, getBrain, listPosts, createPost, updatePost],
});
