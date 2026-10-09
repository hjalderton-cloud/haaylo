import { describe, it, expect } from 'vitest';
import { approvalStepState } from './agent-goal-state';
describe('goal approval hand-off', () => {
  it('keeps pending and approved-but-unexecuted actions waiting', () => {
    for (const status of ['pending', 'approved']) expect(approvalStepState({ status }).status).toBe('awaiting_approval');
  });
  it('uses saved execution results', () => {
    expect(approvalStepState({ status: 'executed', result: { id: 'saved-asset' } })).toEqual({ status: 'approved', result: { id: 'saved-asset' }, error: null });
  });
  it('records rejection without running', () => expect(approvalStepState({ status: 'rejected' }).status).toBe('rejected'));
  it('surfaces execution failures', () => expect(approvalStepState({ status: 'failed', error: 'Failed' }).error).toBe('Failed'));
  it('expires waiting approvals', () => expect(approvalStepState({ status: 'pending', expires_at: '2020-01-01' }).status).toBe('error'));
});
