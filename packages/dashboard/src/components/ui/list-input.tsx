import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import type { JSX } from 'react';
import { cn } from '../../lib/cn';
import { Button } from './button';
import { Input } from './input';

export function ListInput({
  value,
  onChange,
  placeholder,
  emptyLabel = 'No items — click Add to start.',
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  emptyLabel?: string;
}): JSX.Element {
  const setAt = (i: number, v: string): void => {
    const next = [...value];
    next[i] = v;
    onChange(next);
  };
  const removeAt = (i: number): void => {
    onChange(value.filter((_, idx) => idx !== i));
  };
  const swap = (i: number, j: number): void => {
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  const add = (): void => onChange([...value, '']);

  return (
    <div className="space-y-2">
      {value.length === 0 ? (
        <div className="text-xs text-[var(--fg-subtle)]">{emptyLabel}</div>
      ) : (
        value.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={item}
              onChange={(e) => setAt(i, e.target.value)}
              placeholder={placeholder}
            />
            <div className="flex shrink-0 gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => swap(i, i - 1)}
                disabled={i === 0}
                title="Move up"
              >
                <ChevronUp size={14} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => swap(i, i + 1)}
                disabled={i === value.length - 1}
                title="Move down"
              >
                <ChevronDown size={14} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => removeAt(i)}
                title="Remove"
              >
                <Trash2 size={14} />
              </Button>
            </div>
          </div>
        ))
      )}
      <Button variant="outline" size="sm" type="button" onClick={add} className={cn(value.length === 0 && 'mt-2')}>
        <Plus size={14} />
        Add
      </Button>
    </div>
  );
}
