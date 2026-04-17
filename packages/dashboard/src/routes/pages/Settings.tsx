import { Check, Globe, Key, MessageCircle, Pencil, Trash2, X } from 'lucide-react';
import { type JSX, useState } from 'react';
import { Button } from '../../components/ui/button';
import {
  type MaskedSecret,
  type SecretCategory,
  useDeleteSecret,
  useSecrets,
  useSetSecret,
} from '../../hooks/useSecrets';
import { cn } from '../../lib/cn';

interface CategoryMeta {
  id: SecretCategory;
  label: string;
  description: string;
  icon: typeof Globe;
}

const CATEGORIES: CategoryMeta[] = [
  {
    id: 'reddit',
    label: 'Reddit',
    description: 'OAuth app credentials for posting and scanning.',
    icon: Globe,
  },
  {
    id: 'llm',
    label: 'LLM providers',
    description: 'API keys for Anthropic, Google, OpenAI, DeepSeek, Qwen.',
    icon: Key,
  },
  {
    id: 'telegram',
    label: 'Telegram',
    description: 'Bot token + ops channel id.',
    icon: MessageCircle,
  },
];

export function Settings(): JSX.Element {
  const [active, setActive] = useState<SecretCategory>('reddit');
  const meta = CATEGORIES.find((c) => c.id === active) ?? CATEGORIES[0]!;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-medium">Settings</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Manage app-level secrets. Values override matching environment variables.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <nav className="glass flex flex-col gap-1 p-2">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActive(c.id)}
                className={cn(
                  'flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm transition-colors text-left',
                  active === c.id
                    ? 'bg-[var(--accent-muted)] text-[var(--fg)]'
                    : 'text-[var(--fg-muted)] hover:bg-[var(--glass-hover)] hover:text-[var(--fg)]',
                )}
              >
                <Icon size={16} />
                <span>{c.label}</span>
              </button>
            );
          })}
        </nav>

        <SecretsPanel meta={meta} />
      </div>
    </div>
  );
}

function SecretsPanel({ meta }: { meta: CategoryMeta }): JSX.Element {
  const q = useSecrets(meta.id);

  return (
    <div className="glass p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-lg font-medium">{meta.label}</div>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">{meta.description}</p>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        {q.isLoading && <div className="text-sm text-[var(--fg-muted)]">Loading…</div>}
        {q.isError && (
          <div className="text-sm text-red-400">Error: {(q.error as Error).message}</div>
        )}
        {q.data?.map((s) => (
          <SecretRow key={s.key} secret={s} category={meta.id} />
        ))}
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: MaskedSecret['source'] }): JSX.Element {
  const classes =
    source === 'db'
      ? 'bg-[var(--accent-muted)] text-[var(--color-accent)]'
      : source === 'env'
        ? 'bg-slate-500/15 text-[var(--fg-muted)]'
        : 'bg-slate-500/10 text-[var(--fg-subtle)]';
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium uppercase ${classes}`}>
      {source}
    </span>
  );
}

function SecretRow({
  secret,
  category,
}: {
  secret: MaskedSecret;
  category: SecretCategory;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const setMutation = useSetSecret(category);
  const deleteMutation = useDeleteSecret(category);

  const submit = async (): Promise<void> => {
    if (!value) return;
    await setMutation.mutateAsync({ key: secret.key, value });
    setValue('');
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-3 rounded-[10px] bg-[var(--glass-hover)] px-3 py-2">
      <code className="flex-1 text-xs text-[var(--fg)]">{secret.key}</code>

      {editing ? (
        <>
          <input
            type="text"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="paste value"
            className="flex-1 rounded border border-[var(--glass-border)] bg-[var(--bg)] px-2 py-1 text-sm text-[var(--fg)] outline-none focus:border-[var(--color-accent)]"
          />
          <Button
            size="sm"
            onClick={() => void submit()}
            disabled={setMutation.isPending || !value}
          >
            <Check size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditing(false);
              setValue('');
            }}
          >
            <X size={14} />
          </Button>
        </>
      ) : (
        <>
          {secret.source !== 'unset' ? (
            <code className="w-32 text-right text-xs text-[var(--fg-muted)]">
              {secret.masked}
            </code>
          ) : (
            <span className="w-32 text-right text-xs text-[var(--fg-subtle)]">not set</span>
          )}
          <SourceBadge source={secret.source} />
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil size={14} />
          </Button>
          {secret.source === 'db' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void deleteMutation.mutate(secret.key)}
              disabled={deleteMutation.isPending}
              title="Reset to env"
            >
              <Trash2 size={14} />
            </Button>
          )}
        </>
      )}
    </div>
  );
}
