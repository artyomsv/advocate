import { ArrowLeft, ArrowRight, Check, Trash2 } from 'lucide-react';
import { type JSX, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Field } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { ListInput } from '../../components/ui/list-input';
import { Textarea } from '../../components/ui/textarea';
import { useCreateLegend } from '../../hooks/useLegendMutations';
import { useProducts } from '../../hooks/useProducts';
import { cn } from '../../lib/cn';
import {
  type LegendFormValues,
  emptyLegendForm,
  validateStep,
} from '../../lib/legend-form';
import { useProductStore } from '../../stores/product.store';

const DRAFT_KEY = 'mynah-legend-draft';
const STEPS = ['Identity', 'Personality', 'Professional', 'Product', 'Preview'] as const;

export function LegendNew(): JSX.Element {
  const nav = useNavigate();
  const currentProductId = useProductStore((s) => s.selectedProductId) ?? '';
  const products = useProducts();
  const create = useCreateLegend();
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [values, setValues] = useState<LegendFormValues>(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) return JSON.parse(saved) as LegendFormValues;
    } catch {
      /* ignore */
    }
    return emptyLegendForm(currentProductId);
  });

  // Debounced persist to localStorage
  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(values));
    }, 500);
    return () => clearTimeout(t);
  }, [values]);

  const discardDraft = (): void => {
    localStorage.removeItem(DRAFT_KEY);
    setValues(emptyLegendForm(currentProductId));
    setStep(0);
    setErr(null);
  };

  const next = (): void => {
    const e = validateStep(step, values);
    if (e) {
      setErr(e);
      return;
    }
    setErr(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = (): void => {
    setErr(null);
    setStep((s) => Math.max(s - 1, 0));
  };

  const submit = async (): Promise<void> => {
    for (let i = 0; i < STEPS.length - 1; i++) {
      const e = validateStep(i, values);
      if (e) {
        setStep(i);
        setErr(e);
        return;
      }
    }
    try {
      await create.mutateAsync(values);
      localStorage.removeItem(DRAFT_KEY);
      nav('/legends');
    } catch (ex) {
      setErr((ex as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium">New legend</h1>
        <Button variant="ghost" size="sm" onClick={discardDraft}>
          <Trash2 size={14} />
          Discard draft
        </Button>
      </div>

      <div className="glass flex items-center gap-2 p-2 text-sm">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(i)}
            className={cn(
              'rounded-[10px] px-3 py-1.5 transition-colors',
              i === step
                ? 'bg-[var(--accent-muted)] text-[var(--color-accent)]'
                : i < step
                  ? 'text-[var(--fg)]'
                  : 'text-[var(--fg-subtle)]',
            )}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      <div className="glass space-y-5 p-6">
        {step === 0 && (
          <IdentityStep
            values={values}
            setValues={setValues}
            productOptions={products.data ?? []}
          />
        )}
        {step === 1 && <PersonalityStep values={values} setValues={setValues} />}
        {step === 2 && <ProfessionalStep values={values} setValues={setValues} />}
        {step === 3 && <ProductRelationshipStep values={values} setValues={setValues} />}
        {step === 4 && <PreviewStep values={values} />}

        {err && <div className="text-sm text-red-400">{err}</div>}

        <div className="flex items-center justify-between pt-2">
          <Button
            variant="ghost"
            type="button"
            onClick={back}
            disabled={step === 0}
          >
            <ArrowLeft size={14} />
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={next}>
              Next
              <ArrowRight size={14} />
            </Button>
          ) : (
            <Button type="button" onClick={() => void submit()} disabled={create.isPending}>
              <Check size={14} />
              {create.isPending ? 'Creating…' : 'Create legend'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

interface StepProps {
  values: LegendFormValues;
  setValues: React.Dispatch<React.SetStateAction<LegendFormValues>>;
}

function IdentityStep({
  values,
  setValues,
  productOptions,
}: StepProps & { productOptions: { id: string; name: string }[] }): JSX.Element {
  const set = <K extends keyof LegendFormValues>(k: K, v: LegendFormValues[K]): void =>
    setValues((prev) => ({ ...prev, [k]: v }));
  const setLoc = <K extends keyof LegendFormValues['location']>(
    k: K,
    v: LegendFormValues['location'][K],
  ): void =>
    setValues((prev) => ({ ...prev, location: { ...prev.location, [k]: v } }));
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Product">
        <select
          className="h-9 w-full rounded border border-[var(--glass-border)] bg-transparent px-3 text-sm outline-none focus:border-[var(--color-accent)]"
          value={values.productId}
          onChange={(e) => set('productId', e.target.value)}
        >
          <option value="" className="bg-[var(--bg-elevated)]">
            — select —
          </option>
          {productOptions.map((p) => (
            <option key={p.id} value={p.id} className="bg-[var(--bg-elevated)]">
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Maturity">
        <select
          className="h-9 w-full rounded border border-[var(--glass-border)] bg-transparent px-3 text-sm outline-none focus:border-[var(--color-accent)]"
          value={values.maturity}
          onChange={(e) => set('maturity', e.target.value as LegendFormValues['maturity'])}
        >
          {(['lurking', 'engaging', 'established', 'promoting'] as const).map((m) => (
            <option key={m} value={m} className="bg-[var(--bg-elevated)]">
              {m}
            </option>
          ))}
        </select>
      </Field>
      <Field label="First name">
        <Input value={values.firstName} onChange={(e) => set('firstName', e.target.value)} />
      </Field>
      <Field label="Last name">
        <Input value={values.lastName} onChange={(e) => set('lastName', e.target.value)} />
      </Field>
      <Field label="Gender">
        <select
          className="h-9 w-full rounded border border-[var(--glass-border)] bg-transparent px-3 text-sm outline-none focus:border-[var(--color-accent)]"
          value={values.gender}
          onChange={(e) => set('gender', e.target.value as LegendFormValues['gender'])}
        >
          <option value="female" className="bg-[var(--bg-elevated)]">female</option>
          <option value="male" className="bg-[var(--bg-elevated)]">male</option>
          <option value="non-binary" className="bg-[var(--bg-elevated)]">non-binary</option>
        </select>
      </Field>
      <Field label="Age">
        <Input
          type="number"
          min={18}
          max={120}
          value={values.age}
          onChange={(e) => set('age', Number(e.target.value))}
        />
      </Field>
      <Field label="City">
        <Input value={values.location.city} onChange={(e) => setLoc('city', e.target.value)} />
      </Field>
      <Field label="State / region">
        <Input value={values.location.state} onChange={(e) => setLoc('state', e.target.value)} />
      </Field>
      <Field label="Country">
        <Input
          value={values.location.country}
          onChange={(e) => setLoc('country', e.target.value)}
        />
      </Field>
      <Field label="Timezone" hint="IANA timezone (e.g. America/Chicago)">
        <Input
          value={values.location.timezone}
          onChange={(e) => setLoc('timezone', e.target.value)}
        />
      </Field>
    </div>
  );
}

function PersonalityStep({ values, setValues }: StepProps): JSX.Element {
  const setBf = <K extends keyof LegendFormValues['bigFive']>(k: K, v: number): void =>
    setValues((prev) => ({ ...prev, bigFive: { ...prev.bigFive, [k]: v } }));
  const setTs = <K extends keyof LegendFormValues['typingStyle']>(
    k: K,
    v: LegendFormValues['typingStyle'][K],
  ): void =>
    setValues((prev) => ({ ...prev, typingStyle: { ...prev.typingStyle, [k]: v } }));
  const bf = values.bigFive;
  const ts = values.typingStyle;
  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 text-sm font-medium">Big Five (1-10)</div>
        <div className="grid gap-3 md:grid-cols-2">
          {(['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'] as const).map(
            (k) => (
              <Field key={k} label={k}>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={bf[k]}
                  onChange={(e) => setBf(k, Number(e.target.value))}
                />
              </Field>
            ),
          )}
        </div>
      </div>

      <Field label="Tech-savviness (1-10)">
        <Input
          type="number"
          min={1}
          max={10}
          value={values.techSavviness}
          onChange={(e) =>
            setValues((prev) => ({ ...prev, techSavviness: Number(e.target.value) }))
          }
        />
      </Field>

      <div>
        <div className="mb-2 text-sm font-medium">Typing style</div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Capitalization">
            <select
              className="h-9 w-full rounded border border-[var(--glass-border)] bg-transparent px-3 text-sm outline-none"
              value={ts.capitalization}
              onChange={(e) =>
                setTs('capitalization', e.target.value as LegendFormValues['typingStyle']['capitalization'])
              }
            >
              <option value="proper" className="bg-[var(--bg-elevated)]">proper</option>
              <option value="lowercase" className="bg-[var(--bg-elevated)]">lowercase</option>
              <option value="mixed" className="bg-[var(--bg-elevated)]">mixed</option>
            </select>
          </Field>
          <Field label="Punctuation">
            <select
              className="h-9 w-full rounded border border-[var(--glass-border)] bg-transparent px-3 text-sm outline-none"
              value={ts.punctuation}
              onChange={(e) =>
                setTs('punctuation', e.target.value as LegendFormValues['typingStyle']['punctuation'])
              }
            >
              <option value="correct" className="bg-[var(--bg-elevated)]">correct</option>
              <option value="minimal" className="bg-[var(--bg-elevated)]">minimal</option>
              <option value="excessive" className="bg-[var(--bg-elevated)]">excessive</option>
            </select>
          </Field>
          <Field label="Paragraph style">
            <select
              className="h-9 w-full rounded border border-[var(--glass-border)] bg-transparent px-3 text-sm outline-none"
              value={ts.paragraphStyle}
              onChange={(e) =>
                setTs('paragraphStyle', e.target.value as LegendFormValues['typingStyle']['paragraphStyle'])
              }
            >
              <option value="short" className="bg-[var(--bg-elevated)]">short</option>
              <option value="walls_of_text" className="bg-[var(--bg-elevated)]">walls of text</option>
              <option value="varied" className="bg-[var(--bg-elevated)]">varied</option>
            </select>
          </Field>
          <Field label="List style">
            <select
              className="h-9 w-full rounded border border-[var(--glass-border)] bg-transparent px-3 text-sm outline-none"
              value={ts.listStyle}
              onChange={(e) =>
                setTs('listStyle', e.target.value as LegendFormValues['typingStyle']['listStyle'])
              }
            >
              <option value="never" className="bg-[var(--bg-elevated)]">never</option>
              <option value="sometimes" className="bg-[var(--bg-elevated)]">sometimes</option>
              <option value="frequently" className="bg-[var(--bg-elevated)]">frequently</option>
            </select>
          </Field>
          <Field label="Formality (1-10)">
            <Input
              type="number"
              min={1}
              max={10}
              value={ts.formality}
              onChange={(e) => setTs('formality', Number(e.target.value))}
            />
          </Field>
          <Field label="Uses emojis">
            <label className="flex h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={ts.usesEmojis}
                onChange={(e) => setTs('usesEmojis', e.target.checked)}
              />
              <span>{ts.usesEmojis ? 'Yes' : 'No'}</span>
            </label>
          </Field>
        </div>
      </div>

      <Field label="Common phrases" hint="Things this persona naturally says.">
        <ListInput value={ts.commonPhrases} onChange={(v) => setTs('commonPhrases', v)} />
      </Field>

      <Field label="Avoided phrases">
        <ListInput value={ts.avoidedPhrases} onChange={(v) => setTs('avoidedPhrases', v)} />
      </Field>
    </div>
  );
}

function ProfessionalStep({ values, setValues }: StepProps): JSX.Element {
  const setP = <K extends keyof LegendFormValues['professional']>(
    k: K,
    v: LegendFormValues['professional'][K],
  ): void =>
    setValues((prev) => ({ ...prev, professional: { ...prev.professional, [k]: v } }));
  const setLife = <K extends keyof LegendFormValues['lifeDetails']>(
    k: K,
    v: LegendFormValues['lifeDetails'][K],
  ): void =>
    setValues((prev) => ({ ...prev, lifeDetails: { ...prev.lifeDetails, [k]: v } }));
  const pr = values.professional;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Occupation">
          <Input value={pr.occupation} onChange={(e) => setP('occupation', e.target.value)} />
        </Field>
        <Field label="Company">
          <Input value={pr.company} onChange={(e) => setP('company', e.target.value)} />
        </Field>
        <Field label="Industry">
          <Input value={pr.industry} onChange={(e) => setP('industry', e.target.value)} />
        </Field>
        <Field label="Years of experience">
          <Input
            type="number"
            min={0}
            value={pr.yearsExperience}
            onChange={(e) => setP('yearsExperience', Number(e.target.value))}
          />
        </Field>
        <Field label="Education">
          <Input value={pr.education} onChange={(e) => setP('education', e.target.value)} />
        </Field>
        <Field label="Marital status">
          <select
            className="h-9 w-full rounded border border-[var(--glass-border)] bg-transparent px-3 text-sm outline-none"
            value={values.lifeDetails.maritalStatus}
            onChange={(e) =>
              setLife(
                'maritalStatus',
                e.target.value as LegendFormValues['lifeDetails']['maritalStatus'],
              )
            }
          >
            <option value="single" className="bg-[var(--bg-elevated)]">single</option>
            <option value="married" className="bg-[var(--bg-elevated)]">married</option>
            <option value="partner" className="bg-[var(--bg-elevated)]">partner</option>
            <option value="divorced" className="bg-[var(--bg-elevated)]">divorced</option>
          </select>
        </Field>
        <Field label="Children">
          <Input
            type="number"
            min={0}
            value={values.lifeDetails.children ?? 0}
            onChange={(e) => setLife('children', Number(e.target.value))}
          />
        </Field>
      </div>

      <Field label="Hobbies">
        <ListInput
          value={values.hobbies}
          onChange={(v) => setValues((prev) => ({ ...prev, hobbies: v }))}
        />
      </Field>
      <Field label="Expertise areas">
        <ListInput
          value={values.expertiseAreas}
          onChange={(v) => setValues((prev) => ({ ...prev, expertiseAreas: v }))}
        />
      </Field>
      <Field label="Knowledge gaps" hint="Things this persona isn't expected to know.">
        <ListInput
          value={values.knowledgeGaps}
          onChange={(v) => setValues((prev) => ({ ...prev, knowledgeGaps: v }))}
        />
      </Field>
    </div>
  );
}

function ProductRelationshipStep({ values, setValues }: StepProps): JSX.Element {
  const setPr = <K extends keyof LegendFormValues['productRelationship']>(
    k: K,
    v: LegendFormValues['productRelationship'][K],
  ): void =>
    setValues((prev) => ({
      ...prev,
      productRelationship: { ...prev.productRelationship, [k]: v },
    }));
  const pr = values.productRelationship;
  return (
    <div className="space-y-5">
      <Field label="Discovery story" hint="How this legend first found the product.">
        <Textarea
          value={pr.discoveryStory}
          onChange={(e) => setPr('discoveryStory', e.target.value)}
        />
      </Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Usage duration" hint="e.g. 3 months, 2 years">
          <Input value={pr.usageDuration} onChange={(e) => setPr('usageDuration', e.target.value)} />
        </Field>
        <Field label="Satisfaction (1-10)">
          <Input
            type="number"
            min={1}
            max={10}
            value={pr.satisfactionLevel}
            onChange={(e) => setPr('satisfactionLevel', Number(e.target.value))}
          />
        </Field>
      </div>
      <Field label="Use case" hint="What they actually use the product for.">
        <Textarea value={pr.useCase} onChange={(e) => setPr('useCase', e.target.value)} />
      </Field>
      <Field label="Complaints">
        <ListInput value={pr.complaints} onChange={(v) => setPr('complaints', v)} />
      </Field>
      <Field label="Alternatives considered">
        <ListInput
          value={pr.alternativesConsidered}
          onChange={(v) => setPr('alternativesConsidered', v)}
        />
      </Field>
    </div>
  );
}

function PreviewStep({ values }: { values: LegendFormValues }): JSX.Element {
  return (
    <div className="space-y-4 text-sm">
      <div className="text-[var(--fg-muted)]">Review — click Back to change anything.</div>
      <div>
        <div className="text-lg font-medium">
          {values.firstName} {values.lastName}
        </div>
        <div className="text-[var(--fg-muted)]">
          {values.professional.occupation} at {values.professional.company} · {values.age} ·{' '}
          {values.gender}
        </div>
        <div className="text-xs text-[var(--fg-subtle)]">
          {values.location.city}, {values.location.country} · {values.location.timezone}
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        <Badge tone="warn">{values.maturity}</Badge>
        {values.expertiseAreas.filter(Boolean).map((e) => (
          <Badge key={e}>{e}</Badge>
        ))}
      </div>
      <pre className="glass max-h-64 overflow-y-auto p-3 text-xs text-[var(--fg-muted)]">
        {JSON.stringify(values, null, 2)}
      </pre>
    </div>
  );
}
