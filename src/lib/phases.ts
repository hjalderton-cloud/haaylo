/** 30-day launch phases: shared between the hub, generation and the public page. */

export type PhaseDef = {
  n: number;
  label: string;
  from: number;
  to: number;
  days: string;
  tone: string;
};

export const LAUNCH_PHASES: PhaseDef[] = [
  {
    n: 1,
    label: "Tease & pre-launch",
    from: 1,
    to: 10,
    days: "Days 1–10",
    tone: "problem-awareness, teasing what's coming, building a waitlist. No price, no hard sell.",
  },
  {
    n: 2,
    label: "Reveal & value drop",
    from: 11,
    to: 15,
    days: "Days 11–15",
    tone: "educational and value-led, showing the method, with a clear 'doors opening soon' note.",
  },
  {
    n: 3,
    label: "Cart open",
    from: 16,
    to: 25,
    days: "Days 16–25",
    tone: "social proof, objection handling, direct promotion of the offer with a clear call to buy.",
  },
  {
    n: 4,
    label: "Cart close",
    from: 26,
    to: 30,
    days: "Days 26–30",
    tone: "urgency and scarcity, counting down to the close, last-chance framing.",
  },
];

export function phaseDef(phase: number): PhaseDef {
  return LAUNCH_PHASES.find((p) => p.n === phase) ?? LAUNCH_PHASES[0]!;
}

/** Days since a campaign started, 1-based. */
export function daysIn(startedAt: string | null, createdAt: string | null): number {
  const start = startedAt ?? createdAt;
  if (!start) return 1;
  const ms = Date.now() - new Date(start).getTime();
  return Math.max(1, Math.floor(ms / 86_400_000) + 1);
}

/** Phase 1: days 1–10, 2: 11–15, 3: 16–25, 4: 26 onwards. */
export function phaseForDay(day: number): number {
  if (day <= 10) return 1;
  if (day <= 15) return 2;
  if (day <= 25) return 3;
  return 4;
}

type PhaseSource = {
  campaign_duration?: string | null;
  current_phase?: number | null;
  phase_override?: boolean | null;
  phase_started_at?: string | null;
  created_at?: string | null;
};

/** The phase a campaign is in right now: pinned by hand, or worked out from the calendar. */
export function currentPhase(c: PhaseSource): number {
  if (c.phase_override) return Math.min(4, Math.max(1, Number(c.current_phase ?? 1)));
  return phaseForDay(daysIn(c.phase_started_at ?? null, c.created_at ?? null));
}

/** Whole days left in the current phase, floor 0. */
export function daysRemainingInPhase(c: PhaseSource): number {
  const phase = currentPhase(c);
  const def = phaseDef(phase);
  const day = daysIn(c.phase_started_at ?? null, c.created_at ?? null);
  if (c.phase_override) return Math.max(0, def.to - def.from + 1);
  return Math.max(0, def.to - day + 1);
}
