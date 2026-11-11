// Petits composants partagés — affichage cohérent score / état / famille / gîte,
// et mise en forme de dates. Aucun état, aucune logique métier.

import { FAMILY_LABELS, GITES } from '@placard-wiki/domain';
import type { FoyerState, WikiFamily } from '@placard-wiki/domain';
import { useLang } from './i18n.js';
import type { DictKey } from './i18n-dict.js';
import { STATE_KEYS } from './data/demo.js';

/** Classe de couleur du score — jamais la couleur seule : le chiffre est affiché. */
export function dangerClass(score: number): 'danger-low' | 'danger-mid' | 'danger-high' {
  if (score < 35) return 'danger-low';
  if (score < 70) return 'danger-mid';
  return 'danger-high';
}

/** Badge de danger : couleur + valeur numérique (contraste + redondance). */
export function DangerBadge({ score }: { score: number }): JSX.Element {
  return <span className={`badge ${dangerClass(score)}`}>{score}/100</span>;
}

/** Badge d'état du foyer, libellé traduit. */
export function StateBadge({ state }: { state: FoyerState }): JSX.Element {
  const { t } = useLang();
  return <span className="badge state">{t(STATE_KEYS[state] as DictKey)}</span>;
}

/** Libellé de famille, dans la langue courante. */
export function FamilyLabel({ family }: { family: WikiFamily }): JSX.Element {
  const { pick } = useLang();
  return <>{pick(FAMILY_LABELS[family])}</>;
}

/** Libellé de gîte, dans la langue courante (table du domaine §6). */
export function GiteLabel({ gite }: { gite: string }): JSX.Element {
  const { pick } = useLang();
  const found = GITES.find((g) => g.gite === gite);
  return <>{found ? pick(found) : gite}</>;
}

/** Date ISO → date lisible, dans la langue courante. */
export function formatDate(iso: string, lang: 'en' | 'fr'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}