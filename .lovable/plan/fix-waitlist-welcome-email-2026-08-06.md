# Fix Waitlist Welcome Email

## Current state
- `/waitlist` is live and collecting signups.
- One signup is already stored in `waitlist_signups`.
- No corresponding row exists in `email_send_log`, so the welcome confirmation email did not actually send.

## Goal
Diagnose why the waitlist welcome email is not sending and fix it so future signups receive the confirmation email.

## Steps
1. Inspect the waitlist route handler (`src/routes/waitlist.tsx` or similar) and the code that triggers the welcome email.
2. Verify the transactional email template `waitlist-welcome` is registered in `src/lib/email-templates/registry.ts`.
3. Check the email infrastructure status and the `email_send_log` for any suppressed/failed entries for the existing signup.
4. Fix the root cause — likely one of:
   - The email is not being enqueued after insert.
   - The template name or route path is wrong.
   - The send call is missing the required idempotency key or recipient.
   - The email queue processor is not running.
5. Validate the fix by checking the send log after a test signup.

## Outcome
Future `/waitlist` signups receive the branded welcome email from `haaylo <noreply@haaylo.com>`.
