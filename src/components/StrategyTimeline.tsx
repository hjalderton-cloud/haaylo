import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import type { StrategyPlan } from '@/lib/strategy.server';
import { strategyMonths } from '@/lib/content-organisation';
import { Input } from '@/components/ui/input';

export function StrategyTimeline({ plan, workspaceId, editing, updateWeek, campaignForWeek }: {
  plan: StrategyPlan; workspaceId: string; editing: boolean;
  updateWeek: (index: number, patch: Partial<StrategyPlan['weeks'][number]>) => void;
  campaignForWeek: (week: number) => { id: string; campaign_title: string | null } | null;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ 'month-1': true });
  const storageKey = `haaylo:strategy-sections:${workspaceId}`;
  useEffect(() => {
    try { setExpanded(JSON.parse(localStorage.getItem(storageKey) ?? '{"month-1":true}')); } catch { setExpanded({ 'month-1': true }); }
  }, [storageKey]);
  function toggle(key: string, open: boolean) {
    setExpanded(previous => {
      if (previous[key] === open) return previous;
      const next = { ...previous, [key]: open };
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Storage may be unavailable. */ }
      return next;
    });
  }
  return <section className="space-y-3 text-foreground"><h2 className="font-semibold">Monthly strategy</h2>
    {strategyMonths(plan.weeks).map(({ month, weeks }) => {
      const key = `month-${month}`;
      const campaigns = new Map(weeks.flatMap(({ week }) => { const campaign = campaignForWeek(week.week); return campaign ? [[campaign.id, campaign] as const] : []; }));
      return <details key={key} open={expanded[key] ?? false} onToggle={event => toggle(key, event.currentTarget.open)} className="min-w-0 border-b border-border py-3">
        <summary className="cursor-pointer font-semibold">Month {month}<span className="ml-3 text-sm font-normal">{weeks.length ? `Weeks ${weeks[0]?.week.week}–${weeks.at(-1)?.week.week}` : 'No weeks planned'}</span></summary>
        <div className="mt-3 flex flex-wrap gap-3">{[...campaigns.values()].map(c => <Link key={c.id} to="/campaign/$id" params={{ id: c.id }} className="text-sm text-primary underline underline-offset-4">{c.campaign_title}</Link>)}</div>
        <div className="mt-3 space-y-2">{weeks.map(({ week, index }) => {
          const weekKey = `week-${week.week}`;
          const campaign = campaignForWeek(week.week);
          return <details key={weekKey} open={editing || (expanded[weekKey] ?? false)} onToggle={event => { if (!editing) toggle(weekKey, event.currentTarget.open); }} className="min-w-0 border-t border-border py-3">
            <summary className="cursor-pointer break-words text-sm font-medium">Week {week.week} — {week.theme}<span className="mt-1 block text-xs font-normal">{week.pillar} · {campaign?.campaign_title ?? 'No campaign yet'}</span><span className="mt-2 block line-clamp-2 text-sm font-normal">{week.focus}</span></summary>
            <div className="mt-3 space-y-3">{editing ? <><Input aria-label={`Week ${week.week} theme`} value={week.theme} onChange={e => updateWeek(index, { theme: e.target.value })} /><Input aria-label={`Week ${week.week} focus`} value={week.focus} onChange={e => updateWeek(index, { focus: e.target.value })} /></> : <p className="break-words text-sm leading-relaxed">{week.focus}</p>}
              {campaign ? <Link to="/campaign/$id" params={{ id: campaign.id }} className="text-sm text-primary underline">{campaign.campaign_title}</Link> : <p className="text-xs">No campaign yet</p>}
            </div>
          </details>;
        })}</div>
      </details>;
    })}
  </section>;
}
