// Agent Rovo « Gardien du placard » (§17) — les 5 questions du cahier et des
// réponses GÉNÉRÉES depuis le DATASET (live si disponible, snapshot sinon).
// Discipline de vocabulaire : empreintes courtes, aperçus masqués, fourchettes
// — jamais une valeur brute ; « je ne peux pas le savoir » quand
// l'information dépend d'un droit manquant.

import { FAMILY_LABELS, REMEDIATION_COST_HOURS } from '@placard-wiki/domain';
import { preActivationReport } from '@placard-wiki/exposure';
import type { Lang } from '../i18n.js';
import type { Foyer } from '@placard-wiki/domain';
import type { PlacardDataset } from './dataset.js';

/** Une question du §17, cliquable (conversation starter). */
export interface RovoQuestion {
  id: 'q1' | 'q2' | 'q3' | 'q4' | 'q5';
  fr: string;
  en: string;
}

export const ROVO_QUESTIONS: readonly RovoQuestion[] = [
  { id: 'q1', fr: 'Où avons-nous des identifiants lisibles par plus de cent personnes ?', en: 'Where do we have credentials readable by more than a hundred people?' },
  { id: 'q2', fr: 'Qui peut lire la page qui contient ce mot de passe ?', en: 'Who can read the page that contains this password?' },
  { id: 'q3', fr: 'Qu’est-ce qui reste à traiter avant l’audit de mars ?', en: 'What is left to handle before the March audit?' },
  { id: 'q4', fr: 'Montre les pages partagées publiquement qui contiennent des chaînes de connexion.', en: 'Show publicly shared pages that contain connection strings.' },
  { id: 'q5', fr: 'Si on active l’assistant sur l’espace Support, qu’est-ce qu’il verra ?', en: 'If we enable the assistant on the Support space, what will it see?' },
];

/** Empreinte raccourcie : les 12 premiers caractères suffisent à pointer. */
function shortFp(foyer: Foyer): string {
  return `${foyer.fingerprint.slice(0, 12)}…`;
}

/** La page principale d'un foyer, ou sa première page connue. */
function pageOf(foyer: Foyer): string {
  return foyer.primaryPageId ?? foyer.locations[0]?.pageId ?? '';
}

/** Titre d'une page, selon le dataset. */
function titleOf(pageId: string, data: PlacardDataset): string {
  return data.titles[pageId] ?? pageId;
}

/** Ligne de réponse : famille, empreinte, page, fourchette, danger. */
function foyerLine(foyer: Foyer, lang: Lang, data: PlacardDataset): string {
  const family = FAMILY_LABELS[foyer.family][lang];
  const pageId = pageOf(foyer);
  const expo = data.exposures[pageId];
  const title = titleOf(pageId, data);
  const readers = expo ? `${String(expo.readers.low)}–${String(expo.readers.high)}` : '?';
  return `• ${family} — ${shortFp(foyer)} — « ${title} » — ${readers} lecteurs potentiels — danger ${String(foyer.score)}/100`;
}

/** Q1 : identifiants lisibles par plus de cent personnes (fourchette haute). */
function answerQ1(lang: Lang, data: PlacardDataset): string {
  const hits = Object.values(data.foyers)
    .filter((f) => (data.exposures[pageOf(f)]?.readers.high ?? 0) > 100)
    .filter((f) => f.state !== 'sealed' && f.state !== 'dismissed')
    .sort((a, b) => b.score - a.score);
  const head = lang === 'fr'
    ? `${String(hits.length)} foyers ont une fourchette haute de lecteurs au-dessus de 100 :`
    : `${String(hits.length)} foyers have a reader-range ceiling above 100:`;
  const tail = lang === 'fr'
    ? 'Les fourchettes, pas des nombres exacts : les groupes imbriqués ne sont pas toujours résolus (§8).'
    : 'Ranges, not exact counts: nested groups are not always resolved (§8).';
  return [head, ...hits.map((f) => foyerLine(f, lang, data)), tail].join('\n');
}

/** Le foyer « mot de passe en clair » le plus exposé (pour Q2). */
function passwordFoyer(data: PlacardDataset): Foyer | undefined {
  const candidates = Object.values(data.foyers).filter((f) => f.family === 'plaintext-password');
  return candidates.sort((a, b) => b.score - a.score)[0];
}

/** Q2 : qui peut lire — fourchette + méthode + CAS « DROIT MANQUANT ». */
function answerQ2(lang: Lang, data: PlacardDataset): string {
  const foyer = passwordFoyer(data);
  if (!foyer) {
    return lang === 'fr'
      ? 'Aucun mot de passe en clair dans ce jeu de données — je ne peux rien dire de sa lecture.'
      : 'No plaintext password in this dataset — I cannot say anything about who reads it.';
  }
  const pageId = pageOf(foyer);
  const expo = data.exposures[pageId];
  const title = titleOf(pageId, data);
  const low = expo ? String(expo.readers.low) : '?';
  const high = expo ? String(expo.readers.high) : '?';
  const sharing = expo ? expo.sharing : 'space-default';
  const fr = [
    `Le mot de passe en clair (empreinte ${shortFp(foyer)}) dort dans « ${title} », page ${pageId}.`,
    `Lecteurs potentiels : entre ${low} et ${high} personnes — fourchette issue des permissions de l’espace + état du partage (${sharing}).`,
    'La liste nominative exacte : je ne peux pas le savoir. Énumérer les visionneurs d’un lien public exige un droit d’administration que l’app n’a pas — c’est un droit manquant, pas une absence de données.',
    'Je ne cite jamais la valeur : l’aperçu masqué et l’empreinte suffisent pour agir (rituel, onglet Rituel).',
  ];
  const en = [
    `The plaintext password (fingerprint ${shortFp(foyer)}) sleeps in “${title}”, page ${pageId}.`,
    `Potential readers: between ${low} and ${high} people — a range from space permissions + sharing state (${sharing}).`,
    'The exact list of names: I cannot know it. Enumerating viewers of a public link requires an admin right the app does not have — that is a missing right, not missing data.',
    'I never quote the value: the masked preview and the fingerprint are enough to act (see the Ritual tab).',
  ];
  return (lang === 'fr' ? fr : en).join('\n');
}

/** Q3 : reste à traiter avant l'audit — agrégats par état + coût en heures. */
function answerQ3(lang: Lang, data: PlacardDataset): string {
  const open = Object.values(data.foyers).filter((f) => f.state === 'open' || f.state === 'purge-requested' || f.state === 'rotation-attested');
  const hours = open.reduce(
    (acc, f) => ({
      low: acc.low + REMEDIATION_COST_HOURS[f.family].low,
      high: acc.high + REMEDIATION_COST_HOURS[f.family].high,
    }),
    { low: 0, high: 0 },
  );
  const byState = open.reduce<Record<string, number>>((acc, f) => ({ ...acc, [f.state]: (acc[f.state] ?? 0) + 1 }), {});
  const states = Object.entries(byState).map(([s, n]) => `${s}: ${String(n)}`).join(', ');
  const head = lang === 'fr'
    ? `${String(open.length)} foyers restent ouverts ou en cours (${states}).`
    : `${String(open.length)} foyers remain open or in progress (${states}).`;
  const cost = lang === 'fr'
    ? `Coût de remise en état estimé : entre ${String(hours.low)} et ${String(hours.high)} heures (rotation + caviardage + purge + vérification, §8).`
    : `Estimated remediation cost: between ${String(hours.low)} and ${String(hours.high)} hours (rotation + redaction + purge + verification, §8).`;
  const tail = lang === 'fr'
    ? 'Je raisonne en foyers et en empreintes — jamais en personnes : les propriétaires sont nommés, pas classés (§5).'
    : 'I reason in foyers and fingerprints — never in people: owners are named, never ranked (§5).';
  return [head, cost, ...open.sort((a, b) => b.score - a.score).map((f) => foyerLine(f, lang, data)), tail].join('\n');
}

/** Q4 : pages partagées publiquement avec chaînes de connexion — réponse honnête. */
function answerQ4(lang: Lang, data: PlacardDataset): string {
  const shared = Object.values(data.foyers).filter((f) => {
    const sharing = data.exposures[pageOf(f)]?.sharing;
    return f.family === 'connection-string' && (sharing === 'anyone-with-link' || sharing === 'public');
  });
  if (shared.length === 0) {
    return lang === 'fr'
      ? 'Aucune page partagée publiquement ne contient de chaîne de connexion dans ce jeu de données. Je le dis plutôt que d’inventer.'
      : 'No publicly shared page contains a connection string in this dataset. I say so rather than invent one.';
  }
  const lines = shared.map((f) => {
    const expo = data.exposures[pageOf(f)];
    const readers = expo ? `${String(expo.readers.low)}–${String(expo.readers.high)}` : '?';
    return `• ${titleOf(pageOf(f), data)} (${pageOf(f)}) — ${readers} lecteurs potentiels — danger ${String(f.score)}/100`;
  });
  const head = lang === 'fr'
    ? `${String(shared.length)} page(s) partagée(s) publiquement avec une chaîne de connexion :`
    : `${String(shared.length)} publicly shared page(s) with a connection string:`;
  const tail = lang === 'fr' ? 'Aucune valeur citée : uniquement empreintes, familles et fourchettes.' : 'No value quoted: fingerprints, families and ranges only.';
  return [head, ...lines, tail].join('\n');
}

/** Q5 : pré-activation — VRAI rapport du paquet exposure, sur le 1er espace. */
function answerQ5(lang: Lang, data: PlacardDataset): string {
  const spaceKey = data.spaces[0]?.key ?? '';
  const foyers = Object.values(data.foyers)
    .filter((f) => f.spaceKey === spaceKey)
    .map((f) => ({
      id: f.id,
      family: f.family,
      score: f.score,
      state: f.state,
      presumedIndexed: data.exposures[pageOf(f)]?.aiSurface.presumedIndexed ?? false,
    }));
  const report = preActivationReport({ spaceKey, foyers, now: data.generatedAt ?? '2026-11-10T10:00:00Z' });
  const worst = report.maxExposure;
  const fr = [
    `L’espace « Support » n’existe pas dans ce jeu de données — je réponds pour l’espace ${spaceKey}, avec le vrai rapport de pré-activation (§13).`,
    `${String(report.scannedFoyers)} foyers scannés, ${String(report.exposedFoyers)} exposent encore du texte lisible, dont ${String(report.presumedIndexedFoyers)} présumés indexés par Rovo (hypothèse conservatrice).`,
    worst ? `Exposition maximale : ${worst.foyerId} (${FAMILY_LABELS[worst.family].fr}), danger ${String(worst.score)}/100.` : 'Aucune exposition.',
    `${String(report.byFamily.length)} familles concernées ; rapport complet + certificat dans l’onglet « Pré-activation IA ».`,
  ];
  const en = [
    `There is no “Support” space in this dataset — I answer for the ${spaceKey} space, with the real pre-activation report (§13).`,
    `${String(report.scannedFoyers)} foyers scanned, ${String(report.exposedFoyers)} still expose readable text, of which ${String(report.presumedIndexedFoyers)} presumed indexed by Rovo (conservative hypothesis).`,
    worst ? `Max exposure: ${worst.foyerId} (${FAMILY_LABELS[worst.family].en}), danger ${String(worst.score)}/100.` : 'No exposure.',
    `${String(report.byFamily.length)} families involved; full report + certificate in the “AI pre-activation” tab.`,
  ];
  return (lang === 'fr' ? fr : en).join('\n');
}

/** Réponse de l'agent à une question du §17 (génération locale, aucun réseau). */
export function rovoAnswer(id: RovoQuestion['id'], lang: Lang, data: PlacardDataset): string {
  switch (id) {
    case 'q1': return answerQ1(lang, data);
    case 'q2': return answerQ2(lang, data);
    case 'q3': return answerQ3(lang, data);
    case 'q4': return answerQ4(lang, data);
    case 'q5': return answerQ5(lang, data);
  }
}

/** Réponse aux saisies libres : la simulation reste dans le cadre du §17. */
export function rovoFallback(lang: Lang): string {
  return lang === 'fr'
    ? 'Dans cette simulation, je réponds aux cinq questions du cahier des charges (§17) — cliquez sur une suggestion. Je ne cite jamais de valeur, et je dis « je ne peux pas le savoir » quand un droit manque.'
    : 'In this simulation I answer the five spec questions (§17) — click a suggestion. I never quote a value, and I say “I cannot know” when a right is missing.';
}
