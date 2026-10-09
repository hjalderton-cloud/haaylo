/** Map saved approval outcomes into the goal trail; never trust browser results. */
export function approvalStepState(approval: { status: string; result?: unknown; error?: string | null; expires_at?: string | null }, now = Date.now()) {
  if (approval.status === 'executed') return { status: 'approved', result: approval.result ?? null, error: null };
  if (approval.status === 'rejected') return { status: 'rejected', result: null, error: null };
  if (approval.status === 'failed') return { status: 'error', result: null, error: approval.error ?? 'The action failed.' };
  if (approval.expires_at && Date.parse(approval.expires_at) <= now) return { status: 'error', result: null, error: 'Approval expired. Ask for a new approval.' };
  return { status: 'awaiting_approval', result: null, error: null };
}

// The caller supplies an authenticated, user-scoped client.
export async function readGoalTrail(ctx: { userId: string; supabase: any }, workspaceId: string, goalId: string) {
  const { data, error } = await ctx.supabase.from('agent_goal_steps').select('*').eq('user_id', ctx.userId).eq('project_id', workspaceId).eq('goal_id', goalId).order('created_at');
  if (error) throw new Error(error.message);
  const steps = data ?? [];
  const ids = steps.flatMap((s: any) => s.approval_id ? [s.approval_id] : []);
  if (!ids.length) return steps;
  const approvals = await ctx.supabase.from('agent_approvals').select('id,status,result,error,expires_at').eq('user_id', ctx.userId).eq('project_id', workspaceId).in('id', ids);
  if (approvals.error) throw new Error(approvals.error.message);
  return steps.map((s: any) => {
    const approval = approvals.data?.find((a: any) => a.id === s.approval_id);
    return approval ? { ...s, ...approvalStepState(approval) } : s;
  });
}
