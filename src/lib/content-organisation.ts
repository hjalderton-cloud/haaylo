export const ARCHIVE_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export function isContentArchived(post: { created_at?: string | null; scheduled_at?: string | null }, now: number): boolean {
  const created = Date.parse(post.created_at ?? '');
  const scheduled = Date.parse(post.scheduled_at ?? '');
  return Number.isFinite(created) && now - created > ARCHIVE_AGE_MS && !(Number.isFinite(scheduled) && scheduled > now);
}
export function archiveMonth(created: string): { key: string; label: string } {
  const date = new Date(created);
  return { key: date.toISOString().slice(0, 7), label: date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
}
export function strategyMonths<T extends { week: number }>(weeks: T[]) {
  return [1, 2, 3].map(month => ({ month, weeks: weeks.map((week, index) => ({ week, index })).filter(({ week }) => Math.min(3, Math.max(1, Math.ceil(week.week / 4))) === month).sort((a, b) => a.week.week - b.week.week) }));
}
