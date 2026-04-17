import { type JSX, useState } from 'react';
import { Drawer } from '../../components/ui/drawer';
import { type Post, usePostMetrics, usePosts } from '../../hooks/useVisibility';

export function Posts(): JSX.Element {
  const q = usePosts();
  const [selected, setSelected] = useState<Post | null>(null);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-medium">Posts</h1>
      <p className="text-sm text-[var(--fg-muted)]">
        Every post that landed on a platform, with latest engagement metrics.
      </p>

      {q.isLoading && <div className="text-[var(--fg-muted)]">Loading…</div>}
      {q.isError && <div className="text-red-400">Error: {(q.error as Error).message}</div>}

      {q.data && q.data.length === 0 && (
        <div className="glass p-6 text-[var(--fg-muted)]">
          No posts yet. Approved content plans become posts once the post-publish worker runs.
        </div>
      )}

      {q.data && q.data.length > 0 && (
        <div className="glass overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-[var(--glass-hover)] text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
              <tr>
                <th className="px-4 py-2 text-left">Content preview</th>
                <th className="px-4 py-2 text-left">Posted</th>
                <th className="px-4 py-2 text-right">Upvotes</th>
                <th className="px-4 py-2 text-right">Replies</th>
                <th className="px-4 py-2 text-right">Views</th>
                <th className="px-4 py-2 text-left">State</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setSelected(p)}
                  className="cursor-pointer border-t border-[var(--glass-border)] hover:bg-[var(--glass-hover)]"
                >
                  <td className="max-w-lg truncate px-4 py-2">
                    {p.content.slice(0, 120)}
                    {p.content.length > 120 && '…'}
                  </td>
                  <td className="px-4 py-2 text-[var(--fg-subtle)]">
                    {p.postedAt ? new Date(p.postedAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{p.upvotes}</td>
                  <td className="px-4 py-2 text-right font-mono">{p.repliesCount}</td>
                  <td className="px-4 py-2 text-right font-mono">{p.views}</td>
                  <td className="px-4 py-2">
                    {p.wasRemoved ? (
                      <span className="text-red-400">removed</span>
                    ) : (
                      <span className="text-[var(--fg-muted)]">live</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PostDrawer post={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function PostDrawer({
  post,
  onClose,
}: { post: Post | null; onClose: () => void }): JSX.Element {
  const metrics = usePostMetrics(post?.id ?? null);

  return (
    <Drawer open={!!post} onOpenChange={(v) => !v && onClose()} title="Post detail">
      {post && (
        <div className="space-y-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
              Content
            </div>
            <div className="mt-1 whitespace-pre-wrap rounded bg-[var(--glass-hover)] p-3 text-sm">
              {post.content}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Stat label="Upvotes" value={String(post.upvotes)} />
            <Stat label="Replies" value={String(post.repliesCount)} />
            <Stat label="Views" value={String(post.views)} />
          </div>

          {post.platformUrl && (
            <a
              href={post.platformUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-[var(--color-accent)] hover:underline"
            >
              Open on platform →
            </a>
          )}

          <div>
            <div className="text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
              Metrics history
            </div>
            {metrics.isLoading && (
              <div className="text-sm text-[var(--fg-muted)]">Loading…</div>
            )}
            {metrics.data && metrics.data.length === 0 && (
              <div className="text-sm text-[var(--fg-muted)]">No snapshots yet.</div>
            )}
            {metrics.data && metrics.data.length > 0 && (
              <table className="mt-1 w-full text-xs">
                <thead className="text-[var(--fg-subtle)]">
                  <tr>
                    <th className="text-left">When</th>
                    <th className="text-right">Up</th>
                    <th className="text-right">Down</th>
                    <th className="text-right">Repl</th>
                    <th className="text-right">Views</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.data.map((m) => (
                    <tr key={m.id}>
                      <td>{new Date(m.measuredAt).toLocaleString()}</td>
                      <td className="text-right font-mono">{m.upvotes}</td>
                      <td className="text-right font-mono">{m.downvotes}</td>
                      <td className="text-right font-mono">{m.repliesCount}</td>
                      <td className="text-right font-mono">{m.views}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded border border-[var(--glass-border)] p-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--fg-subtle)]">{label}</div>
      <div className="text-base font-medium">{value}</div>
    </div>
  );
}
