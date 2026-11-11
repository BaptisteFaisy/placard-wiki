/**
 * Contrôles de formulaire accessibles, partagés par le registre et les
 * réglages d'espace. Chaque contrôle est associé à un `<Label>` programmatique
 * (`labelFor` ↔ `id`) — WCAG AA : tout champ a un nom accessible, le focus est
 * visible nativement, la navigation clavier est assurée par UI Kit.
 *
 * Les gestionnaires `onChange` reçoivent l'événement sérialisable d'UI Kit ;
 * on lit la valeur sur la cible en la traitant comme `unknown` (jamais `any`).
 */

import { Label, Range, Select, Stack, Textfield, Toggle } from '@forge/react';

/** Une option de Select : libellé visible + valeur stable. */
export interface SelectOption {
  label: string;
  value: string;
}

/** Lit la valeur texte d'un événement UI Kit, sans propager de `any`. */
function readTextValue(target: { value?: unknown }): string {
  const raw: unknown = target.value;
  return typeof raw === 'string' ? raw : raw == null ? '' : String(raw);
}

interface FilterSelectProps {
  id: string;
  label: string;
  options: readonly SelectOption[];
  /** Valeur courante ; chaîne vide = « tous » / non défini. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/** Select étiqueté : une seule sélection, effaçable (retour à « tous »). */
export function FilterSelect({
  id,
  label,
  options,
  value,
  onChange,
  placeholder,
}: FilterSelectProps): JSX.Element {
  const selected: SelectOption | null = options.find((o) => o.value === value) ?? null;
  return (
    <Stack space="space.050">
      <Label labelFor={id}>{label}</Label>
      <Select
        id={id}
        options={[...options]}
        value={selected}
        placeholder={placeholder}
        isClearable
        onChange={(opt: SelectOption | null) => onChange(opt ? opt.value : '')}
      />
    </Stack>
  );
}

interface FilterTextProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/** Champ texte étiqueté (filtre libre : espace, motif, raison…). */
export function FilterText({
  id,
  label,
  value,
  onChange,
  placeholder,
}: FilterTextProps): JSX.Element {
  return (
    <Stack space="space.050">
      <Label labelFor={id}>{label}</Label>
      <Textfield
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(readTextValue(event.target))}
      />
    </Stack>
  );
}

interface FilterRangeProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

/** Curseur étiqueté (seuil, score minimum) — UI Kit livre directement le nombre. */
export function FilterRange({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: FilterRangeProps): JSX.Element {
  return (
    <Stack space="space.050">
      <Label labelFor={id}>{label + ' — ' + String(value)}</Label>
      <Range id={id} value={value} min={min} max={max} step={step} onChange={onChange} />
    </Stack>
  );
}

interface FilterToggleProps {
  id: string;
  label: string;
  isChecked: boolean;
  onChange: (isChecked: boolean) => void;
}

/** Interrupteur étiqueté (le `label` UI Kit est le nom accessible). */
export function FilterToggle({
  id,
  label,
  isChecked,
  onChange,
}: FilterToggleProps): JSX.Element {
  return (
    <Toggle
      id={id}
      label={label}
      isChecked={isChecked}
      onChange={(event) => onChange(event.target.checked === true)}
    />
  );
}
