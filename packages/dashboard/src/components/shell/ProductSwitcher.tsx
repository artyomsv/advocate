import { ChevronsUpDown, Plus } from 'lucide-react';
import { type JSX, useEffect, useState } from 'react';
import { useProducts } from '../../hooks/useProducts';
import { cn } from '../../lib/cn';
import { useProductStore } from '../../stores/product.store';
import { NewProductDialog } from '../products/NewProductDialog';

export function ProductSwitcher(): JSX.Element {
  const products = useProducts();
  const selected = useProductStore((s) => s.selectedProductId);
  const setSelected = useProductStore((s) => s.setSelectedProductId);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (!selected && products.data && products.data.length > 0) {
      setSelected(products.data[0]!.id);
    }
  }, [selected, products.data, setSelected]);

  const items = products.data ?? [];
  const loading = products.isLoading;

  return (
    <>
      <div className="flex items-center gap-2">
        {loading ? (
          <div className="glass flex h-9 items-center gap-2 px-3 text-sm text-[var(--fg-muted)]">
            Loading products…
          </div>
        ) : items.length === 0 ? (
          <div className="glass flex h-9 items-center gap-2 px-3 text-sm text-[var(--fg-muted)]">
            No products yet
          </div>
        ) : (
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
        )}

        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          aria-label="New product"
          title="New product"
          className="glass glass-hover flex h-9 w-9 items-center justify-center text-[var(--fg-muted)] hover:text-[var(--fg)]"
        >
          <Plus size={16} />
        </button>
      </div>

      <NewProductDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
