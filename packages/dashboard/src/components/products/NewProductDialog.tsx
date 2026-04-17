import { type JSX, useState } from 'react';
import { useCreateProduct } from '../../hooks/useProductMutations';
import { useProductStore } from '../../stores/product.store';
import { Button } from '../ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '../ui/dialog';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100);
}

export function NewProductDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}): JSX.Element {
  const create = useCreateProduct();
  const setSelected = useProductStore((s) => s.setSelectedProductId);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugDirty, setSlugDirty] = useState(false);
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reset(): void {
    setName('');
    setSlug('');
    setSlugDirty(false);
    setDescription('');
    setUrl('');
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    const effectiveSlug = slug || slugify(name);
    try {
      const created = await create.mutateAsync({
        name: name.trim(),
        slug: effectiveSlug,
        description: description.trim(),
        url: url.trim() || undefined,
      });
      setSelected(created.id);
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create product');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent title="New product">
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <Field label="Name">
              <Input
                autoFocus
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugDirty) setSlug(slugify(e.target.value));
                }}
                placeholder="Fairy Book Store"
              />
            </Field>
            <Field label="Slug" hint="lowercase alphanumeric + hyphen, 3-100 chars">
              <Input
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugDirty(true);
                }}
                placeholder="fairy-book-store"
              />
            </Field>
            <Field label="Description">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Online bookstore specialising in children fairy tales."
                rows={3}
              />
            </Field>
            <Field label="URL" hint="optional">
              <Input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://fairybookstore.com"
              />
            </Field>
            {error && (
              <div className="rounded border border-red-500/40 bg-red-500/10 p-2 text-sm text-red-400">
                {error}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                create.isPending ||
                !name.trim() ||
                !slug.trim() ||
                !description.trim()
              }
            >
              {create.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
