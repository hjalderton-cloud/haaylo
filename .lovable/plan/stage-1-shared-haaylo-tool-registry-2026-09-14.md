# Stage 1: shared Haaylo Tool Registry

Build the registry only. Keep the UI, manual workflows, database, subscription tiers, existing MCP tools and weekly Agent unchanged. No goal-driven Agent or Stage 2 work.

## What will be added

- A central registry under `src/lib/tool-registry/`, with unique names, descriptions, shared Zod input schemas, useful output schemas, permissions, explicit workspace requirements, risk, approval policy, availability and existing-action mappings.
- A JSON-schema catalogue derived from those definitions, rather than a separately maintained list.
- Thin server-side adapters for safe existing actions. They delegate to existing backend actions; they do not duplicate generation, storage or publishing logic.
- A registry report listing all 17 tools, limitations and mappings.

Existing input validators will be extracted into shared, browser-safe schema modules without changing their validation behaviour. Registry schemas will derive stricter Agent inputs from these originals: workspace IDs become mandatory and unsafe optional fields are excluded. Manual callers retain their existing contracts.

## Initial catalogue

| Registry name | Existing action / bounded scope | Risk | Approval default |
|---|---|---|---|
| `fetch_brand_context` | `getBrain`: selected workspace Strategy Profile, including its brand fields | LOW | No |
| `fetch_strategy` | `getStrategyPlan` | LOW | No |
| `fetch_previous_content` | `listContentPosts`, explicitly scoped | LOW | No |
| `fetch_campaign` | `getCampaign`, explicit campaign and workspace | LOW | No |
| `fetch_analytics` | `getContentPerformance`: saved content performance inputs; not invented live metrics | LOW | No |
| `create_campaign` | `createCampaign`: create campaign record; does not itself generate every asset | MEDIUM | Yes |
| `create_strategy` | `generateStrategyPlan`: generates and saves, potentially replacing the workspace plan | MEDIUM | Yes |
| `create_social_content` | `saveContentPost`: create a new supplied-copy draft only; no published/scheduled status | LOW | No |
| `create_email_draft` | `generateEmails`: generates and saves the funnel email sequence; may replace its saved email copy; does not send | MEDIUM | Yes |
| `create_lead_magnet` | `generateMagnet`: generates and saves the funnel magnet text; does not imply designed PDF export | MEDIUM | Yes |
| `create_landing_page` | `createLandingPage`: creates an unpublished draft with defaults | MEDIUM | Yes |
| `create_image` | `generateBrandImage`, explicitly scoped, with reference-asset checks | MEDIUM | Yes |
| `create_content_calendar` | Unavailable: no standalone calendar-creation action identified | MEDIUM | Yes |
| `save_asset` | `saveToBank`: saves a Content Bank item; not a generic file upload | MEDIUM | Yes |
| `update_campaign` | `setCampaignPlanWeeks` only initially; no unrestricted campaign patch | MEDIUM | Yes |
| `schedule_content` | Existing `setPostSchedule` and `savePost` mapped but execution unavailable initially | HIGH | Always |
| `publish_content` | Existing timed publishing path mapped but execution unavailable initially | HIGH | Always |

Account-level Brand DNA (`getBrandBrain`) will not silently stand in for a workspace's brand. The existing scheduling action records a schedule separately from the live publishing queue, and the live queue uses account-level targets. Neither will be exposed as a safe, complete Agent publishing action in this stage. Changing a post's status to `published` is not publishing it.

## Workspace and approval safety

- Every executable tool requires an explicit workspace, pinned by trusted server context. Reject missing or mismatched workspace IDs; never choose a default or switch workspaces.
- Authenticate the caller and verify ownership of the requested workspace before delegation, using the caller's access permissions.
- Validate all referenced campaign, post, history and asset IDs against that same workspace. Restrict new social content to draft creation and prevent arbitrary metadata or linked IDs from bypassing these checks.
- Reuse existing subscription checks and permissions; do not invent new roles or entitlements.
- Approval-required tools fail closed unless the server can verify explicit approval bound to the user, workspace, tool and exact validated inputs. A caller-supplied `approved: true` is never sufficient.
- No approval storage or approval inbox in Stage 1. Until a trusted approval mechanism is connected, approval-required entries remain described and mapped but blocked from registry execution. Existing manual actions remain available as before.
- If a candidate adapter cannot meet these guarantees without changing existing behaviour, mark it unavailable with its specific reason rather than exposing it optimistically.

## Technical boundaries

The server adapter layer remains separate from the serialisable catalogue. Existing authenticated server functions require a real authenticated request; this stage will not fabricate one, bypass authentication, or introduce privileged background execution. A future background Agent will need its own verified execution context.

The registry is the authoritative definition for the new Agent-callable surface. Existing MCP definitions remain unchanged in this stage; their migration is separate work.

## Verification and handover

Add focused tests covering catalogue completeness and unique names, schema reuse, required workspace IDs, denied access, cross-workspace references, unavailable tools, draft-only constraints and approval fail-closed behaviour. Verify no existing action is invoked after a failed guard and test successful delegation for safe reads/draft creation using controlled substitutes.

Deliver the registry location and a final table of all tools, backing functions, risk, approval and actual execution availability. Stop after Stage 1; Stage 2 requires separate approval.
