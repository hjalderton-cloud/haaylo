import type { ReactNode } from 'react';
import type { ContentPost } from '@/lib/content.functions';
import { archiveMonth } from '@/lib/content-organisation';

export function ContentArchiveGroups({ posts, campaignName, renderPosts }: { posts: ContentPost[]; campaignName: (post: ContentPost) => string; renderPosts: (posts: ContentPost[]) => ReactNode }) {
  const months = new Map<string, { label: string; posts: ContentPost[] }>();
  for (const post of posts) {
    const month = archiveMonth(post.created_at);
    const group = months.get(month.key) ?? { label: month.label, posts: [] };
    group.posts.push(post);
    months.set(month.key, group);
  }
  return <div className="space-y-4 text-foreground">{[...months].sort(([a], [b]) => b.localeCompare(a)).map(([key, month], index) => {
    const campaigns = new Map<string, ContentPost[]>();
    for (const post of month.posts) {
      const batchKey = typeof post.meta?.batch_title === 'string' && post.meta.batch_title.trim() ? `batch:${post.meta.batch_title.trim()}` : 'standalone';
      const id = post.campaign_id ?? String(post.meta?.campaign_id ?? batchKey);
      campaigns.set(id, [...(campaigns.get(id) ?? []), post]);
    }
    return <details key={key} open={index === 0} className="min-w-0 border-b border-border pb-4">
      <summary className="cursor-pointer py-3 font-semibold">{month.label} ({month.posts.length})</summary>
      <div className="space-y-3">{[...campaigns].map(([id, items]) => {
        const phases = new Map<string, ContentPost[]>();
        for (const post of items) {
          const phase = typeof post.meta?.phase === 'number' ? `Phase ${post.meta.phase}` : '';
          phases.set(phase, [...(phases.get(phase) ?? []), post]);
        }
        const first = items[0];
        const batch = first && typeof first.meta?.batch_title === 'string' ? first.meta.batch_title.trim() : '';
        const heading = (first ? campaignName(first) : '') || batch || 'Standalone posts';
        return <details key={id} open className="min-w-0">
          <summary className="cursor-pointer py-2 font-medium">{heading} ({items.length})</summary>
          {[...phases].sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })).map(([phase, rows]) => phase
            ? <details key={phase} open className="min-w-0 py-2"><summary className="cursor-pointer pb-3 text-sm">{phase} ({rows.length})</summary>{renderPosts(rows)}</details>
            : <div key="unphased" className="min-w-0 py-2">{renderPosts(rows)}</div>)}
        </details>;
      })}</div>
    </details>;
  })}</div>;
}
