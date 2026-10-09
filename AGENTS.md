<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Every AI text writer grounds brand facts via loadBrandContext() in src/lib/brand-context.server.ts and adds only task-specific context; why: one source of truth stops generic or contradictory output.
- Every AI writer passes its output through src/lib/brand-compliance.server.ts (runCompliant for save paths, cleanForWorkspace for screen-only results) before saving or returning; why: facts, contact details and banned wording are enforced in code, not just in prompts, and failed retries stay flagged as needs_review.
- The Marketing Orchestrator (src/lib/marketing-orchestrator.server.ts) only decides and coordinates: it calls existing generators' exported core functions (runPostBatch, runCampaignAsset, runCreateStrategy, runCreateCampaign), never the AI directly, saves everything as draft, and runs one action per request driven by the browser; why: every asset keeps grounding + brand compliance, and each request stays short with honest progress.
- Batch post writers check every post individually via complyEachPost (brand-compliance.server.ts) and store a per-post compliance status; bulk approval only touches drafts with status pass/repaired and never visuals; why: one weak post must not flag or block the rest.
- Feature/offer availability comes from Brand DNA (tags in business.products_services plus business.unavailable_or_planned), rendered by availabilityPrompt and enforced by checkClaims in brand-compliance.server.ts; why: planned features must never read as live, in any workspace.
- AI quality-review issues are typed: fact/banned block (needs_review), style/format earn one rewrite but only become warnings; why: human review only where genuinely necessary.
- Every image prompt (campaign image packs and the image tool) is built from resolveImageBrief() in src/lib/image-grounding.ts — one matched product, objective, setting, audience, brand colours, style; why: prompts never drift to generic marketing imagery when real product/setting facts exist.
- Saved work is organised as work packages (work_packages + work_package_items in src/lib/packages.functions.ts) that reference existing asset rows by id, never copies; why: calendar, editors and package views must all edit the same record.
