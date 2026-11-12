/**
 * Petits composants partagés par les écrans — tous conformes WCAG AA :
 * contraste via les tokens sémantiques du design system, focus visible natif
 * des composants UI Kit, libellés accessibles. Aucun décor gratuit (§10).
 *
 * Règle : zéro valeur brute affichée — ces widgets ne reçoivent que des
 * empreintes, aperçus masqués et scores (types du domaine).
 */

import { Button, Lozenge, SectionMessage, Spinner, Text } from '@forge/react';
import type { FoyerState } from '@placard-wiki/domain';
import { useI18n } from './i18n.js';

/** Apparence sémantique d'un lozenge (design system, contraste AA). */
type LozengeAppearance =
  | 'default'
  | 'success'
  | 'removed'
  | 'inprogress'
  | 'new'
  | 'moved'
  | 'warning'
  | 'danger'
  | 'information'
  | 'neutral'
  | 'discovery';

/** Bascule de langue accessible (§23) : libellé explicite dans les deux sens. */
export function LangToggle(): JSX.Element {
  const { lang, toggle } = useI18n();
  // Le texte du bouton est son nom accessible : il indique la langue cible
  // de la bascule (convention standard). Pas d'aria-label superflu.
  return (
    <Button appearance="subtle" onClick={toggle}>
      {lang === 'en' ? 'Français' : 'English'}
    </Button>
  );
}

/** Indicateur de chargement, avec libellé accessible pour les lecteurs d'écran. */
export function Loading({ label }: { label: string }): JSX.Element {
  return (
    <SectionMessage appearance="information" title={label}>
      <Spinner size="small" />
    </SectionMessage>
  );
}

/**
 * État vide honnête : le résolveur n'a pas encore implémenté la méthode, ou
 * l'appel a échoué. On dit quoi, pourquoi — jamais un faux zéro (§23).
 */
export function EmptyNotice({
  title,
  body,
  appearance = 'information',
}: {
  title: string;
  body: string;
  appearance?: 'information' | 'warning' | 'error' | 'success';
}): JSX.Element {
  return (
    <SectionMessage appearance={appearance} title={title}>
      <Text>{body}</Text>
    </SectionMessage>
  );
}

/** Couleur du score de danger : seuils stables, contraste AA garanti. */
export function scoreAppearance(score: number): LozengeAppearance {
  if (score >= 70) return 'danger';
  if (score >= 40) return 'warning';
  if (score > 0) return 'information';
  return 'neutral';
}

/** Lozenge du score de danger (0-100), avec sa valeur en texte lisible. */
export function ScoreLozenge({ score }: { score: number }): JSX.Element {
  return (
    <Lozenge appearance={scoreAppearance(score)} isBold={score >= 70} maxWidth="4rem">
      {String(score)}
    </Lozenge>
  );
}

/** Apparence sémantique de l'état d'un foyer (le rituel, §9). */
export function stateAppearance(state: FoyerState): LozengeAppearance {
  switch (state) {
    case 'open':
      return 'danger';
    case 'rotation-attested':
      return 'warning';
    case 'redacted':
    case 'purge-requested':
      return 'inprogress';
    case 'purged':
    case 'sealed':
      return 'success';
    case 'purge-impossible':
      return 'removed';
    case 'dismissed':
      return 'neutral';
    default:
      return 'default';
  }
}

/** Lozenge de l'état du foyer, libellé bilingue via le dictionnaire. */
export function StateLozenge({ state }: { state: FoyerState }): JSX.Element {
  const { t } = useI18n();
  return <Lozenge appearance={stateAppearance(state)}>{t('state.' + state)}</Lozenge>;
}
