import { Button } from "@/components/ui/button";
import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputTextarea, PromptInputFooter, PromptInputSubmit } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Tool, ToolContent } from "@/components/ai-elements/tool";
import { CollapsibleTrigger } from "@/components/ui/collapsible";
import { TOOL_LABEL, summariseResult, formatStepDetails } from "@/lib/agent-step-presentation";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CARD } from "@/components/AppShell";
import { useWorkspace } from "@/hooks/useActiveProject";
import { supabase } from "@/integrations/supabase/client";
import { NAVY, SURFACE, LINE, PINK, PURPLE, GREY, TINT, font, primaryButton, secondaryButton } from "@/lib/theme";
import {
  createGoal,
  listGoals,
  getGoal,
  cancelGoal,
  resumeGoal,
  deleteGoal,
  finishGoalStep,
  type GoalRow,
  type GoalWithSteps,
} from "@/lib/agent-goal.functions";
import { listToolApprovals, decideToolApproval, approveAndRun } from "@/lib/tool-registry/approvals.functions";

export const Route = createFileRoute("/_authenticated/agent/goals")({
  head: () => ({
    meta: [
      { title: "Agent goals — haaylo.com" },
      { name: "description", content: "Give Haaylo a goal and it works through it, asking for your approval before anything changes." },
      { property: "og:title", content: "Agent goals — haaylo" },
      { property: "og:description", content: "Give Haaylo a goal and it works through it step by step." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgentGoals,
});

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  running: { background: TINT.purple, color: TINT.purpleInk },
  completed: { background: TINT.green, color: TINT.greenInk },
  failed: { background: TINT.pink, color: TINT.pinkInk },
  paused: { background: TINT.blue, color: TINT.blueInk },
};

const STEP_STATUS_LABEL: Record<string, string> = {
  ok: "Done",
  awaiting_approval: "Waiting on you",
  approved: "Approved",
  rejected: "Turned down",
  error: "Did not work",
};

function AgentGoals() {
  const ws = useWorkspace();
  const createGoalFn = useServerFn(createGoal);
  const listGoalsFn = useServerFn(listGoals);
  const getGoalFn = useServerFn(getGoal);

  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [draft, setDraft] = useState("");
  const [activeGoalId, setActiveGoalId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [kickoffId, setKickoffId] = useState<string | null>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const [resumedId, setResumedId] = useState<string | null>(null);
  const [runNonce, setRunNonce] = useState(0);
  const resumeGoalFn = useServerFn(resumeGoal);
  const deleteGoalFn = useServerFn(deleteGoal);

  const removeGoal = async (goalId: string) => {
    if (!ws.projectId) return;
    if (!window.confirm("Remove this goal and its step history? Anything it created stays where it is.")) return;
    try {
      await deleteGoalFn({ data: { workspaceId: ws.projectId, goalId } });
      if (activeGoalId === goalId) { setActiveGoalId(null); setKickoffId(null); }
      await reloadGoals();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove that goal.");
    }
  };

  const continueGoal = async (goalId: string) => {
    if (!ws.projectId) return;
    try {
      await resumeGoalFn({ data: { workspaceId: ws.projectId, goalId } });
      setKickoffId(goalId);
      setResumedId(goalId);
      setActiveGoalId(goalId);
      setRunNonce((n) => n + 1);
      await reloadGoals();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not pick that goal back up.");
    }
  };

  // Resolve the Supabase access token for the streaming route.
  useEffect(() => {
    let off = false;
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!off) setToken(data.session?.access_token ?? null);
      } catch {
        if (!off) setToken(null);
      }
    })();
    return () => { off = true; };
  }, []);

  // Load the goal list for this workspace.
  const reloadGoals = useCallback(async () => {
    if (!ws.projectId) return;
    try {
      const rows = await listGoalsFn({ data: { workspaceId: ws.projectId } });
      setGoals(rows);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load goals.");
    }
  }, [listGoalsFn, ws.projectId]);

  useEffect(() => {
    void reloadGoals();
  }, [reloadGoals]);

  useEffect(() => {
    setActiveGoalId(null);
    setKickoffId(null);
    setGoals([]);
  }, [ws.projectId]);

  const activeGoal = goals.find((g) => g.id === activeGoalId && g.project_id === ws.projectId) ?? null;

  const startGoal = async () => {
    const text = draft.trim();
    if (!text || !ws.projectId || !token) return;
    setStarting(true);
    try {
      const row = await createGoalFn({ data: { workspaceId: ws.projectId, goal: text } });
      setGoals((prev) => [row, ...prev]);
      setKickoffId(row.id);
      setRunNonce((n) => n + 1);
      setActiveGoalId(row.id);
      setDraft("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start that goal.");
    } finally {
      setStarting(false);
      draftRef.current?.focus();
    }
  };

  return (
    <div className="w-full min-w-0 max-w-full" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* New goal */}
      <div style={{ ...CARD, padding: 24 }}>
        <h2 style={{ margin: "0 0 6px", fontSize: 20, color: NAVY }}>What do you want Haaylo to work towards?</h2>
        <p style={{ margin: "0 0 16px", color: GREY, fontSize: 14, lineHeight: 1.5 }}>
          Haaylo reads this workspace's Brand DNA and strategy, then works through it step by step. Anything that changes
          saved work or goes out publicly waits here for your approval.
        </p>
        <PromptInput onSubmit={async () => { await startGoal(); }}>
          <PromptInputTextarea ref={draftRef} autoFocus aria-label="Your goal" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="What would you like to work towards?" />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit aria-label="Start goal" title="Start goal" status={starting ? "submitted" : "ready"} disabled={starting || !draft.trim() || !token} />
          </PromptInputFooter>
        </PromptInput>

      </div>

      {/* Active goal live panel */}
      {activeGoal && token && ws.projectId && (
        <GoalRun
          key={`${activeGoal.id}:${runNonce}`}
          goalId={activeGoal.id}
          workspaceId={ws.projectId}
          token={token}
          goalText={activeGoal.goal}
          autoStart={kickoffId === activeGoal.id}
          onStarted={() => setKickoffId(null)}
          kickoffText={
            resumedId === activeGoal.id
              ? `Carry on with this goal from where you stopped: ${activeGoal.goal}`
              : activeGoal.goal
          }
          getGoalFn={getGoalFn}
          onGoalChanged={reloadGoals}
        />
      )}

      {/* Past + active goals */}
      <div style={{ ...CARD, padding: 24 }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 17, color: NAVY }}>Your goals</h3>
        {goals.length === 0 ? (
          <p style={{ margin: 0, color: GREY, fontSize: 14 }}>Nothing yet. Start a goal above.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {goals.map((g) => {
              const st = STATUS_STYLE[g.status] ?? STATUS_STYLE.paused;
              const isActive = g.id === activeGoalId;
              const canContinue = g.status === "paused" || g.status === "failed";
              return (
                <div
                  key={g.id}
                  style={{
                    display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
                    padding: "12px 14px", borderRadius: 12, border: `1px solid ${isActive ? PINK : LINE}`,
                    background: isActive ? "#fff" : SURFACE, fontFamily: font, maxWidth: "100%",
                  }}
                >
                  <Button
                    type="button"
                    className="whitespace-normal h-auto"
                    onClick={() => { setKickoffId(null); setActiveGoalId(isActive ? null : g.id); }}
                    style={{
                      display: "flex", gap: 12, alignItems: "flex-start", textAlign: "left",
                      flex: "1 1 220px", minWidth: 0, maxWidth: "100%",
                      border: "none", background: "transparent", cursor: "pointer", fontFamily: font, padding: 0,
                    }}
                  >
                    <span style={{ ...st, padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, flexShrink: 0, textTransform: "capitalize" }}>
                      {g.status}
                    </span>
                    <span style={{ color: NAVY, fontSize: 14, lineHeight: 1.5, minWidth: 0, overflowWrap: "anywhere" }}>
                      {g.goal}
                    </span>
                  </Button>
                  {canContinue && (
                    <Button
                      type="button"
                      onClick={() => void continueGoal(g.id)}
                      style={{ ...secondaryButton, fontSize: 13, flexShrink: 0 }}
                    >
                      Continue
                    </Button>
                  )}
                  {g.id !== activeGoalId && (
                    <Button
                      type="button"
                      aria-label="Remove goal"
                      onClick={() => void removeGoal(g.id)}
                      style={{ ...secondaryButton, fontSize: 13, flexShrink: 0, color: TINT.pinkInk, borderColor: TINT.pink }}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

type GoalRunProps = {
  goalId: string;
  workspaceId: string;
  token: string;
  goalText: string;
  kickoffText?: string;
  autoStart: boolean;
  onStarted: () => void;
  getGoalFn: ReturnType<typeof useServerFn<typeof getGoal>>;
  onGoalChanged: () => void;
};

function GoalRun({ goalId, workspaceId, token, goalText, kickoffText, autoStart, onStarted, getGoalFn, onGoalChanged }: GoalRunProps) {
  // Body + headers carry the workspace and goal so the route logs every step.
  const bodyRef = useRef({ workspaceId, goalId });
  bodyRef.current = { workspaceId, goalId };
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const cancelGoalFn = useServerFn(cancelGoal);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/agent-goal",
        headers: () => ({ Authorization: `Bearer ${tokenRef.current}` }),
        body: () => bodyRef.current,
      }),
    [],
  );

  const { messages, sendMessage, status, error, stop } = useChat({
    id: goalId,
    transport,
    onError: (e) => {
      // 402 / 403 / gateway errors surface here — show a clear message.
      toast.error(humanError(e));
    },
  });

  const stopRun = async () => {
    try {
      await cancelGoalFn({ data: { workspaceId, goalId } });
      stop();
      onGoalChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not pause this goal.");
    }
  };

  // Kick off the run with the goal text as the first user message (once).
  // Deferred to the next tick so useChat's internal store has hydrated and the
  // request isn't dropped by React's mount/Strict-Mode race.
  const sentRef = useRef(false);
  useEffect(() => {
    if (!autoStart || sentRef.current) return;
    const t = setTimeout(() => {
      sentRef.current = true;
      void sendMessage({ text: kickoffText ?? goalText });
      onStarted();
    }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll the step trail while running.
  const [detail, setDetail] = useState<GoalWithSteps | null>(null);
  useEffect(() => {
    let off = false;
    const tick = async () => {
      try {
        const d = await getGoalFn({ data: { workspaceId, goalId } });
        if (!off) { setDetail(d); onGoalChanged(); }
      } catch {
        /* ignore */
      }
    };
    void tick();
    const t = setInterval(tick, 2500);
    return () => { off = true; clearInterval(t); };
  }, [getGoalFn, goalId, workspaceId]);

  const busy = status === "submitted" || status === "streaming";
  const hasWaitingApproval = detail?.steps.some((s) => s.status === "awaiting_approval") ?? false;
  const live = busy || detail?.status === "running" || hasWaitingApproval;

  return (
    <div className="w-full min-w-0 max-w-full" style={{ ...CARD, padding: 24, borderColor: PINK }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: live ? 12 : 0, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: GREY }}>
          {busy ? "Working…" : detail?.status === "completed" ? "Finished" : detail?.status === "failed" ? "Stopped" : hasWaitingApproval ? "Waiting on you" : "Ready"}
        </span>
        {busy && (
          <Button type="button" onClick={() => void stopRun()} style={{ ...secondaryButton, fontSize: 13 }}>Stop</Button>
        )}
      </div>

      {live ? (
        <>
          {/* Live conversation */}
          <Conversation className="max-h-[32rem]"><ConversationContent>
            {status === "submitted" && <Shimmer>Thinking…</Shimmer>}
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {error && (
              <div style={{ padding: "12px 14px", borderRadius: 12, background: TINT.pink, color: TINT.pinkInk, fontSize: 14, lineHeight: 1.5 }}>
                {humanError(error)}
              </div>
            )}
          </ConversationContent></Conversation>

          {/* Step trail + inline approvals */}
          {detail && detail.steps.length > 0 && (
            <StepTrail goal={detail} workspaceId={workspaceId} onGoalChanged={onGoalChanged} />
          )}
        </>
      ) : (
        <p style={{ margin: "8px 0 0", color: NAVY, fontSize: 14, lineHeight: 1.6 }}>
          {detail?.summary ?? (detail?.status === "paused" ? "Stopped — press Continue in the list to pick it back up." : null)}
        </p>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  return <Message from={message.role}><MessageContent className={message.role === "user" ? "bg-primary text-primary-foreground" : "bg-transparent text-foreground"}>
    {message.parts.map((p, i) => {
      if (p.type === "text" || p.type === "reasoning") return <MessageResponse key={i}>{p.text}</MessageResponse>;
      if (p.type.startsWith("tool-") || p.type === "dynamic-tool") return <span key={i} className="text-sm text-foreground">{p.type.replace("tool-", "").replaceAll("_", " ")}</span>;
      return null;
    })}
  </MessageContent></Message>;
}

function StepTrail({
  goal,
  workspaceId,
  onGoalChanged,
}: {
  goal: GoalWithSteps;
  workspaceId: string;
  onGoalChanged: () => void;
}) {
  const decideFn = useServerFn(decideToolApproval);
  const approveRunFn = useServerFn(approveAndRun);
  const finishStepFn = useServerFn(finishGoalStep);
  const [busyId, setBusyId] = useState<string | null>(null);

  const approve = async (approvalId: string) => {
    setBusyId(approvalId);
    try {
      const result = await approveRunFn({ data: { approvalId } });
      await finishStepFn({
        data: { workspaceId, approvalId, status: "approved", result: (result as { result?: unknown }).result ?? result },
      });
      toast.success("Done — that action ran.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That action did not run.");
      await finishStepFn({ data: { workspaceId, approvalId, status: "error", error: e instanceof Error ? e.message : "failed" } }).catch(() => {});
    } finally {
      setBusyId(null);
      onGoalChanged();
    }
  };

  const reject = async (approvalId: string) => {
    setBusyId(approvalId);
    try {
      await decideFn({ data: { approvalId, decision: "reject", reason: "Turned down from the Goals tab" } });
      await finishStepFn({ data: { workspaceId, approvalId, status: "rejected" } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not turn that down.");
    } finally {
      setBusyId(null);
      onGoalChanged();
    }
  };

  return (
    <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 14 }}>
      <div style={{ fontSize: 13, color: GREY, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Steps</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {goal.steps.map((s) => {
          const approvalId = s.approval_id;
          const waiting = s.status === "awaiting_approval" && approvalId;
          return (
            <div key={s.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13.5, color: NAVY, maxWidth: "100%", minWidth: 0, overflowWrap: "anywhere" }}>
              <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <span className="min-w-0 break-words font-medium">{TOOL_LABEL[s.tool_name] ?? s.tool_name.replaceAll("_", " ")}</span>
                <span className="shrink-0 text-xs">{STEP_STATUS_LABEL[s.status] ?? s.status}</span>
              </div>
              {s.status !== "error" && summariseResult(s.tool_name, s.result) && (
                <p className="m-0 w-full min-w-0 break-words text-sm">{summariseResult(s.tool_name, s.result)}</p>
              )}
              {waiting && (
                <span style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                  <Button type="button" onClick={() => approvalId && approve(approvalId)} disabled={busyId === s.approval_id} style={{ ...primaryButton, padding: "6px 12px", fontSize: 12 }}>
                    Approve
                  </Button>
                  <Button type="button" onClick={() => approvalId && reject(approvalId)} disabled={busyId === s.approval_id} style={{ ...secondaryButton, padding: "5px 12px", fontSize: 12 }}>
                    Turn down
                  </Button>
                </span>
              )}
              <Tool defaultOpen={false} className="mb-0 min-w-0 max-w-full border-0">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="group h-auto px-0 text-xs">
                    <span className="group-data-[state=open]:hidden">Show details</span>
                    <span className="hidden group-data-[state=open]:inline">Hide details</span>
                  </Button>
                </CollapsibleTrigger>
                <ToolContent className="min-w-0 max-w-full p-0 pt-2">
                  <pre tabIndex={0} aria-label="Step details" className="m-0 max-h-64 w-full min-w-0 max-w-full overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap [overflow-wrap:anywhere]">{formatStepDetails(s.input, s.result, s.error)}</pre>
                </ToolContent>
              </Tool>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function humanError(e: Error): string {
  const m = e.message || "The run hit a problem.";
  if (/402|Not enough credits/i.test(m))
    return "The AI service declined this request with a billing error. Your current balance has not been checked.";
  if (/403|forbidden|Unauthorized/i.test(m))
    return "Haaylo could not reach the AI service with your sign-in. Try signing in again.";
  return m;
}
