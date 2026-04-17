import { ChevronsUpDown } from 'lucide-react';
import type { JSX } from 'react';
import { useEffect } from 'react';
import { useProducts } from '../../hooks/useProducts';
import { cn } from '../../lib/cn';
import { useProductStore } from '../../stores/product.store';

export function ProductSwitcher(): JSX.Element {
  const products = useProducts();
  const selected = useProductStore((s) => s.selectedProductId);
  const setSelected = useProductStore((s) => s.setSelectedProductId);

  useEffect(() => {
    if (!selected && products.data && products.data.length > 0) {
      setSelected(products.data[0]!.id);
    }
  }, [selected, products.data, setSelected]);

  if (products.isLoading) {
    return (
      <div className="glass flex h-9 items-center gap-2 px-3 text-sm text-[var(--fg-muted)]">
        Loading products…
      </div>
    );
  }

  const items = products.data ?? [];
  if (items.length === 0) {
    return (
      <div className="glass flex h-9 items-center gap-2 px-3 text-sm text-[var(--fg-muted)]">
        No products yet
      </div>
    );
  }

  return (
    <label
      className={cn(
        'glass glass-hover flex h-9 cursor-pointer items-center gap-2 px-3 text-sm',
        'focus-within:ring-2 focus-within:ring-[var(--accent-ring)]',
      )}
    >
      <select
        value={selected ?? ''}
        onChange={(e) => setSelected(e.target.value)}
        className="appearance-none bg-transparent pr-6 text-[var(--fg)] outline-none"
      >
        {items.map((p) => (
          <option
            key={p.id}
            value={p.id}
            className="bg-[var(--bg-elevated)] text-[var(--fg)]"
          >
            {p.name}
          </option>
        ))}
      </select>
      <ChevronsUpDown size={16} className="text-[var(--fg-muted)]" />
    </label>
  );
}
