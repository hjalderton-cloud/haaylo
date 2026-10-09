# Finish Round 3 and make Goals accessible

## Where the plan stands
- The Goals page exists at `/agent/goals`, and Approvals exists at `/agent/approvals`.
- Both appear in the tab bar **inside** the Agent section, but neither is in the shared AI Agent menu shown in your screenshot. My earlier directions did not match that menu.
- Round 3 should not have been reported as fully verified. The saved roadmap still contains the discredited “AI credits exhausted” blocker.
- One further completion issue is confirmed: the streaming handler marks a goal completed when its response finishes, even when actions remain awaiting approval.
- Whether the published site contains the latest Goals page has not yet been verified.

## Changes
1. **Make the existing pages easy to reach.** Add Goals immediately after Agent Home and add Approvals to the shared AI Agent menu, including the Engine menu and mobile navigation. Put Goals immediately after Home in the Agent tab bar. Keep all existing destinations and access rules.
2. **Finish the approval hand-off.** Keep goals awaiting approval paused rather than completed. Verify that approving or declining an action records its outcome and that continuing uses the actual saved results without repeating completed actions. Preserve explicit approval for every MEDIUM/HIGH action.
3. **Check Stop and Continue.** Confirm stopping a run leaves it paused, prevents further tool execution, and allows a safe continuation in the same workspace. Correct any confirmed failures within the approved Round 3 scope.
4. **Correct the progress record.** Remove the stale credits blocker and record what is implemented, what has been tested, and any remaining specific blockers. Do not move on to autonomy settings or other rounds.

## Verification before calling it complete
- Follow the exact menu shown in your screenshot to Goals, rather than opening the address directly.
- Check desktop and mobile navigation, direct links, and refresh behaviour.
- Start a harmless test goal; confirm the live activity and saved history appear.
- Test an approval-gated draft action: nothing runs before approval, approval runs it once, and the goal continues with its result. Test rejection as well.
- Stop and continue a goal; check that its workspace stays fixed and completed work is not duplicated.
- Check the published page separately from the preview. If a release is needed, say so clearly and request publication rather than claiming the live site has changed.

## Technical scope
Reuse the current registry, approval functions, goal tables and existing pages. No redesign, subscription changes, new agent features or unrelated fixes. Run targeted tests and browser checks; use the platform’s automatic build checks.
