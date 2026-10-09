import type { z } from "zod";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type ApprovalPolicy = "never" | "default" | "always";

/**
 * A single Agent-callable tool definition in the Haaylo Tool Registry.
 *
 * The registry is the authoritative definition for Agent-callable tools.
 * Manual screens continue to call existing backend actions directly;
 * the registry sits above them as a descriptive and (for safe tools) executable layer.
 */
export interface ToolDefinition {
  /** Unique tool name used by the Agent to select and call the tool. */
  name: string;
  /** Human-readable description of what the tool does, for the Agent model. */
  description: string;
  /** Zod schema for the tool's input. Every tool requires an explicit workspaceId. */
  inputSchema: z.ZodType;
  /** Optional Zod schema for the tool's output, where it adds value. */
  outputSchema?: z.ZodType;
  /** Always true — every tool is pinned to a workspace. */
  workspaceRequired: boolean;
  /** Descriptive permission labels (enforced by the adapter, not by this list). */
  permissions: string[];
  /** Risk category: LOW (reads, drafts), MEDIUM (writes, generation), HIGH (publishing, spending). */
  risk: RiskLevel;
  /** Whether approval is required: never, by default, or always. */
  approval: ApprovalPolicy;
  /** Whether the tool can actually execute in this stage. False = described only. */
  available: boolean;
  /** Why the tool is not available, if applicable. */
  unavailableReason?: string;
  /** Name of the existing backend action the tool maps to. */
  backingAction: string;
  /** Source file of the backing action. */
  backingFile: string;
}
