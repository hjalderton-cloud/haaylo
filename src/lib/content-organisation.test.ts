import { describe, expect, it } from 'vitest';
import { ARCHIVE_AGE_MS, archiveMonth, isContentArchived, strategyMonths } from './content-organisation';
const now = Date.parse('2026-09-18T18:00:00Z');
const date = (age: number) => new Date(now - age).toISOString();
describe('Content Bank archive', () => {
  it('only archives strictly older than 30 days', () => {
    expect(isContentArchived({ created_at: date(ARCHIVE_AGE_MS - 1) }, now)).toBe(false);
    expect(isContentArchived({ created_at: date(ARCHIVE_AGE_MS) }, now)).toBe(false);
    expect(isContentArchived({ created_at: date(ARCHIVE_AGE_MS + 1) }, now)).toBe(true);
  });
  it('keeps future scheduled content active and archives expired dates without changing status', () => {
    const post = { created_at: date(ARCHIVE_AGE_MS * 2), scheduled_at: date(-1000), status: 'draft' };
    expect(isContentArchived(post, now)).toBe(false);
    expect(isContentArchived({ ...post, scheduled_at: date(1000) }, now)).toBe(true);
    expect(post.status).toBe('draft');
  });
  it('keeps unknown dates active', () => {
    for (const created_at of [null, undefined, '', 'bad']) expect(isContentArchived({ created_at }, now)).toBe(false);
  });
  it('groups creation months in UTC', () => expect(archiveMonth('2026-08-31T23:00:00Z')).toEqual({ key: '2026-08', label: 'August 2026' }));
});
describe('Strategy months', () => {
  it('groups twelve weeks into three months', () => expect(strategyMonths(Array.from({ length: 12 }, (_, i) => ({ week: i + 1 }))).map(m => m.weeks.length)).toEqual([4, 4, 4]));
  it('preserves a thirteenth week', () => expect(strategyMonths([{ week: 13 }])[2]?.weeks[0]?.week.week).toBe(13));
  it('preserves original edit indexes when weeks are missing or unordered', () => expect(strategyMonths([{ week: 8 }, { week: 2 }, { week: 5 }])[1]?.weeks.map(w => w.index)).toEqual([2, 0]));
});
