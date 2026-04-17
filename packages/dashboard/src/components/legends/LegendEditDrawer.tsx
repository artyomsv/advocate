import { type JSX, useState } from 'react';
import { Button } from '../ui/button';
import { Drawer } from '../ui/drawer';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { ListInput } from '../ui/list-input';
import { useUpdateLegend } from '../../hooks/useLegendMutations';
import type { Legend } from '../../hooks/useLegends';

export function LegendEditDrawer({
  legend,
  onClose,
}: {
  legend: Legend | null;
  onClose: () => void;
}): JSX.Element {
  return (
    <Drawer open={!!legend} onOpenChange={(v) => !v && onClose()} title="Edit legend" width="w-[560px]">
      {legend && <EditForm key={legend.id} legend={legend} onClose={onClose} />}
    </Drawer>
  );
}

function EditForm({ legend, onClose }: { legend: Legend; onClose: () => void }): JSX.Element {
  const update = useUpdateLegend(legend.id);
  const [firstName, setFirstName] = useState(legend.firstName);
  const [lastName, setLastName] = useState(legend.lastName);
  const [age, setAge] = useState(String(legend.age));
  const [occupation, setOccupation] = useState(legend.professional.occupation ?? '');
  const [company, setCompany] = useState(legend.professional.company ?? '');
  const [city, setCity] = useState(legend.location.city ?? '');
  const [country, setCountry] = useState(legend.location.country ?? '');
  const [expertiseAreas, setExpertiseAreas] = useState<string[]>([...legend.expertiseAreas]);
  const [hobbies, setHobbies] = useState<string[]>([...legend.hobbies]);
  const [maturity, setMaturity] = useState<string>(legend.maturity);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    try {
      await update.mutateAsync({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        age: Number(age),
        maturity,
        professional: { ...legend.professional, occupation, company },
        location: { ...legend.location, city, country },
        expertiseAreas,
        hobbies,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name">
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
        </Field>
        <Field label="Last name">
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Age">
          <Input
            type="number"
            min={18}
            max={99}
            value={age}
            onChange={(e) => setAge(e.target.value)}
          />
        </Field>
        <Field label="Maturity">
          <select
            value={maturity}
            onChange={(e) => setMaturity(e.target.value)}
            className="w-full rounded border border-[var(--glass-border)] bg-transparent px-3 py-2 text-sm text-[var(--fg)] outline-none hover:border-[var(--color-accent)]"
          >
            <option value="lurking" className="bg-[var(--bg-elevated)]">lurking</option>
            <option value="engaging" className="bg-[var(--bg-elevated)]">engaging</option>
            <option value="established" className="bg-[var(--bg-elevated)]">established</option>
            <option value="promoting" className="bg-[var(--bg-elevated)]">promoting</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Occupation">
          <Input value={occupation} onChange={(e) => setOccupation(e.target.value)} />
        </Field>
        <Field label="Company">
          <Input value={company} onChange={(e) => setCompany(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="City">
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
        </Field>
        <Field label="Country">
          <Input value={country} onChange={(e) => setCountry(e.target.value)} />
        </Field>
      </div>
      <Field label="Expertise areas">
        <ListInput value={expertiseAreas} onChange={setExpertiseAreas} placeholder="add and press enter" />
      </Field>
      <Field label="Hobbies">
        <ListInput value={hobbies} onChange={setHobbies} placeholder="add and press enter" />
      </Field>

      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-2 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
