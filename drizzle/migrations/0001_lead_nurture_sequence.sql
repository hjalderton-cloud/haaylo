ALTER TABLE public.lead_automations
  ADD COLUMN IF NOT EXISTS handoff_email TEXT,
  ADD COLUMN IF NOT EXISTS handoff_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS handoff_delay_hours INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.lead_captures
  ADD COLUMN IF NOT EXISTS handoff_status TEXT NOT NULL DEFAULT 'skipped';

CREATE INDEX IF NOT EXISTS lead_captures_followup_due_idx
  ON public.lead_captures (followup_status, created_at);

CREATE INDEX IF NOT EXISTS lead_captures_handoff_due_idx
  ON public.lead_captures (handoff_status, created_at);