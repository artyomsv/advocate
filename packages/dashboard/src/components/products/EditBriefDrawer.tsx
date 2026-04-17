import { type JSX, useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { Drawer } from '../ui/drawer';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { ListInput } from '../ui/list-input';
import { Textarea } from '../ui/textarea';
import type { ProductDashboard } from '../../hooks/useProductDashboard';
import { useUpdateProduct } from '../../hooks/useProductMutations';

interface AudienceRow {
  segment: string;
  platforms: string; // comma-separated on the client, split on save
}

interface CompetitorRow {
  name: string;
  comparison: string;
}

export function EditBriefDrawer({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductDashboard['product'];
}): JSX.Element {
  const mutation = useUpdateProduct(product.id);

  const [description, setDescription] = useState(product.description);
  const [url, setUrl] = useState(product.url ?? '');
  const [valueProps, setValueProps] = useState<string[]>(product.valueProps ?? []);
  const [painPoints, setPainPoints] = useState<string[]>(product.painPoints ?? []);
  const [talkingPoints, setTalkingPoints] = useState<string[]>(product.talkingPoints ?? []);
  const [neverSay, setNeverSay] = useState<string[]>(product.neverSay ?? []);
  const [audiences, setAudiences] = useState<AudienceRow[]>(
    (product.targetAudiences ?? []).map((a) => ({
      segment: a.segment,
      platforms: a.platforms.join(', '),
    })),
  );
  const [competitors, setCompetitors] = useState<CompetitorRow[]>(
    product.competitorComparisons ?? [],
  );

  // Reset form when product changes or drawer re-opens
  useEffect(() => {
    if (open) {
      setDescription(product.description);
      setUrl(product.url ?? '');
      setValueProps(product.valueProps ?? []);
      setPainPoints(product.painPoints ?? []);
      setTalkingPoints(product.talkingPoints ?? []);
      setNeverSay(product.neverSay ?? []);
      setAudiences(
        (product.targetAudiences ?? []).map((a) => ({
          segment: a.segment,
          platforms: a.platforms.join(', '),
        })),
      );
      setCompetitors(product.competitorComparisons ?? []);
    }
  }, [open, product]);

  const handleSave = async (): Promise<void> => {
    await mutation.mutateAsync({
      description,
      url: url.trim() || null,
      valueProps: valueProps.filter(Boolean),
      painPoints: painPoints.filter(Boolean),
      talkingPoints: talkingPoints.filter(Boolean),
      neverSay: neverSay.filter(Boolean),
      targetAudiences: audiences
        .filter((a) => a.segment.trim())
        .map((a) => ({
          segment: a.segment.trim(),
          platforms: a.platforms
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean),
        })),
      competitorComparisons: competitors.filter((c) => c.name.trim()),
    });
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={`Edit brief — ${product.name}`}>
      <div className="space-y-5">
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        <Field label="URL" hint="Full URL including https://">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </Field>

        <Field label="Value props" hint="What makes this product worth recommending.">
          <ListInput
            value={valueProps}
            onChange={setValueProps}
            placeholder="e.g. Personalized stories starring your child"
          />
        </Field>

        <Field label="Pain points" hint="Problems this product solves.">
          <ListInput
            value={painPoints}
            onChange={setPainPoints}
            placeholder="e.g. Generic books don't engage children"
          />
        </Field>

        <Field label="Talking points" hint="Topics that connect naturally.">
          <ListInput
            value={talkingPoints}
            onChange={setTalkingPoints}
            placeholder="e.g. Bedtime routine stress"
          />
        </Field>

        <Field label="Never say" hint="Red lines. Phrases the agents must avoid.">
          <ListInput
            value={neverSay}
            onChange={setNeverSay}
            placeholder="e.g. AI-generated"
          />
        </Field>

        <Field label="Target audiences">
          <div className="space-y-2">
            {audiences.map((a, i) => (
              <div key={i} className="glass grid gap-2 p-3 md:grid-cols-[1fr_1fr_auto]">
                <Input
                  placeholder="Segment (e.g. Parents of 3-8 yr olds)"
                  value={a.segment}
                  onChange={(e) => {
                    const next = [...audiences];
                    next[i] = { ...a, segment: e.target.value };
                    setAudiences(next);
                  }}
                />
                <Input
                  placeholder="Platforms (comma-separated)"
                  value={a.platforms}
                  onChange={(e) => {
                    const next = [...audiences];
                    next[i] = { ...a, platforms: e.target.value };
                    setAudiences(next);
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => setAudiences(audiences.filter((_, idx) => idx !== i))}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setAudiences([...audiences, { segment: '', platforms: '' }])}
            >
              Add audience
            </Button>
          </div>
        </Field>

        <Field label="Competitor comparisons">
          <div className="space-y-2">
            {competitors.map((c, i) => (
              <div key={i} className="glass space-y-2 p-3">
                <Input
                  placeholder="Competitor name"
                  value={c.name}
                  onChange={(e) => {
                    const next = [...competitors];
                    next[i] = { ...c, name: e.target.value };
                    setCompetitors(next);
                  }}
                />
                <Textarea
                  placeholder="How we compare — what's different / better."
                  value={c.comparison}
                  onChange={(e) => {
                    const next = [...competitors];
                    next[i] = { ...c, comparison: e.target.value };
                    setCompetitors(next);
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => setCompetitors(competitors.filter((_, idx) => idx !== i))}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setCompetitors([...competitors, { name: '', comparison: '' }])}
            >
              Add competitor
            </Button>
          </div>
        </Field>

        {mutation.isError && (
          <div className="text-sm text-red-400">
            Save failed: {(mutation.error as Error).message}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
