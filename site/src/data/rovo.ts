// Agent Rovo « Gardien du placard » (§17) — les 5 questions du cahier et des
// réponses GÉNÉRÉES depuis les données de démo. Discipline de vocabulaire :
// empreintes courtes, aperçus masqués, fourchettes — jamais une valeur brute ;
// « je ne peux pas le savoir » quand l'information dépend d'un droit manquant.

import { FAMILY_LABELS, REMEDIATION_COST_HOURS } from '@placard-wiki/domain';
import { preActivationReport } from '@placard-wiki/exposure';
import type { Lang } from '../i18n.js';
import { EXPOSURES, FOYERS } from './demo.js';
import { TITLES } from './demo-site.js';
import type { Foyer } from '@placard-wiki/domain';

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

/** Ligne de réponse : famille, empreinte, page, fourchette, danger. */
function foyerLine(foyer: Foyer, lang: Lang): string {
  const family = FAMILY_LABELS[foyer.family][lang];
  const pageId = foyer.primaryPageId ?? foyer.locations[0]?.pageId ?? '?';
  const expo = EXPOSURES[pageId];
  const title = TITLES[pageId] ?? pageId;
  const readers = expo ? `${String(expo.readers.low)}–${String(expo.readers.high)}` : '?';
  return `• ${family} — ${shortFp(foyer)} — « ${title} » — ${readers} lecteurs potentiels — danger ${String(foyer.score)}/100`;
}

/** Q1 : identifiants lisibles par plus de cent personnes (fourchette haute). */
function answerQ1(lang: Lang): string {
  const hits = Object.values(FOYERS)
    .filter((f) => (EXPOSURES[f.primaryPageId ?? '']?.readers.high ?? 0) > 100)
    .filter((f) => f.state !== 'sealed' && f.state !== 'dismissed')
    .sort((a, b) => b.score - a.score);
  const head = lang === 'fr'
    ? `${String(hits.length)} foyers ont une fourchette haute de lecteurs au-dessus de 100 :`
    : `${String(hits.length)} foyers have a reader-range ceiling above 100:`;
  const tail = lang === 'fr'
    ? 'Les fourchettes, pas des nombres exacts : les groupes imbriqués ne sont pas toujours résolus (§8).'
    : 'Ranges, not exact counts: nested groups are not always resolved (§8).';
  return [head, ...hits.map((f) => foyerLine(f, lang)), tail].join('\n');
}

/** Q2 : qui peut lire — fourchette + méthode + CAS « DROIT MANQUANT ». */
function answerQ2(lang: Lang): string {
  const foyer = FOYERS['F-7']!;
  const expo = EXPOSURES['P-140']!;
  const fr = [
    `Le mot de passe en clair (empreinte ${shortFp(foyer)}, aperçu « mdp: …(12) ») dort dans le TITRE de « ${TITLES['P-140']} », partagée « anyone with the link ».`,
    `Lecteurs potentiels : entre ${String(expo.readers.low)} et ${String(expo.readers.high)} personnes — fourchette issue des permissions de l’espace + état du partage.`,
    'La liste nominative exacte : je ne peux pas le savoir. Énumérer les visionneurs d’un lien public exige un droit d’administration que l’app n’a pas — c’est un droit manquant, pas une absence de données.',
    'Je ne cite jamais la valeur : l’aperçu masqué et l’empreinte suffisent pour agir (rituel, onglet Rituel).',
  ];
  const en = [
    `The plaintext password (fingerprint ${shortFp(foyer)}, preview “mdp: …(12)”) sleeps in the TITLE of “${TITLES['P-140']}”, shared as “anyone with the link”.`,
    `Potential readers: between ${String(expo.readers.low)} and ${String(expo.readers.high)} people — a range from space permissions + sharing state.`,
    'The exact list of names: I cannot know it. Enumerating viewers of a public link requires an admin right the app does not have — that is a missing right, not missing data.',
    'I never quote the value: the masked preview and the fingerprint are enough to act (see the Ritual tab).',
  ];
  return (lang === 'fr' ? fr : en).join('\n');
}

/** Q3 : reste à traiter avant l'audit — agrégats par état + coût en heures. */
function answerQ3(lang: Lang): string {
  const open = Object.values(FOYERS).filter((f) => f.state === 'open' || f.state === 'purge-requested' || f.state === 'rotation-attested');
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
  return [head, cost, ...open.sort((a, b) => b.score - a.score).map((f) => foyerLine(f, lang)), tail].join('\n');
}

/** Q4 : pages publiques avec chaînes de connexion — réponse honnête. */
function answerQ4(lang: Lang): string {
  const fr = [
    'Dans le jeu de démonstration : AUCUNE page partagée publiquement ne contient de chaîne de connexion. Je le dis plutôt que d’inventer.',
    'La plus proche : empreinte 11aa22bb33cc…, famille « chaînes de connexion », page « Accès à la base staging » — partage interne, 25–90 lecteurs, purge de l’historique demandée.',
    'La seule page partagée « anyone with the link » (« Accès au compte de démo ») contient un mot de passe en clair dans son titre — empreinte f0e0d0c0b0a0…, danger 95/100.',
    'Aucune valeur citée : uniquement empreintes, familles et fourchettes.',
  ];
  const en = [
    'In the demo dataset: NO publicly shared page contains a connection string. I say so rather than invent one.',
    'Closest match: fingerprint 11aa22bb33cc…, family “connection strings”, page “Accès à la base staging” — internal sharing, 25–90 readers, history purge requested.',
    'The only “anyone with the link” page (“Accès au compte de démo”) holds a plaintext password in its title — fingerprint f0e0d0c0b0a0…, danger 95/100.',
    'No value quoted: fingerprints, families and ranges only.',
  ];
  return (lang === 'fr' ? fr : en).join('\n');
}

/** Q5 : pré-activation — VRAI rapport du paquet exposure, sur DEMO. */
function answerQ5(lang: Lang): string {
  const foyers = Object.values(FOYERS)
    .filter((f) => f.spaceKey === 'DEMO')
    .map((f) => ({
      id: f.id,
      family: f.family,
      score: f.score,
      state: f.state,
      presumedIndexed: EXPOSURES[f.primaryPageId ?? '']?.aiSurface.presumedIndexed ?? false,
    }));
  const report = preActivationReport({ spaceKey: 'DEMO', foyers, now: '2026-11-10T10:00:00Z' });
  const worst = report.maxExposure;
  const fr = [
    'L’espace « Support » n’existe pas dans le jeu de démonstration — je réponds pour l’espace DEMO, avec le vrai rapport de pré-activation (§13).',
    `${String(report.scannedFoyers)} foyers scannés, ${String(report.exposedFoyers)} exposent encore du texte lisible, dont ${String(report.presumedIndexedFoyers)} présumés indexés par Rovo (hypothèse conservatrice).`,
    worst ? `Exposition maximale : ${worst.foyerId} (${FAMILY_LABELS[worst.family].fr}), danger ${String(worst.score)}/100.` : 'Aucune exposition.',
    `${String(report.byFamily.length)} familles concernées ; rapport complet + certificat dans l’onglet « Pré-activation IA ».`,
  ];
  const en = [
    'There is no “Support” space in the demo dataset — I answer for the DEMO space, with the real pre-activation report (§13).',
    `${String(report.scannedFoyers)} foyers scanned, ${String(report.exposedFoyers)} still expose readable text, of which ${String(report.presumedIndexedFoyers)} presumed indexed by Rovo (conservative hypothesis).`,
    worst ? `Max exposure: ${worst.foyerId} (${FAMILY_LABELS[worst.family].en}), danger ${String(worst.score)}/100.` : 'No exposure.',
    `${String(report.byFamily.length)} families involved; full report + certificate in the “AI pre-activation” tab.`,
  ];
  return (lang === 'fr' ? fr : en).join('\n');
}

/** Réponse de l'agent à une question du §17 (génération locale, aucun réseau). */
export function rovoAnswer(id: RovoQuestion['id'], lang: Lang): string {
  switch (id) {
    case 'q1': return answerQ1(lang);
    case 'q2': return answerQ2(lang);
    case 'q3': return answerQ3(lang);
    case 'q4': return answerQ4(lang);
    case 'q5': return answerQ5(lang);
  }
}

/** Réponse aux saisies libres : la simulation reste dans le cadre du §17. */
export function rovoFallback(lang: Lang): string {
  return lang === 'fr'
    ? 'Dans cette simulation statique, je réponds aux cinq questions du cahier des charges (§17) — cliquez sur une suggestion. Je ne cite jamais de valeur, et je dis « je ne peux pas le savoir » quand un droit manque.'
    : 'In this static simulation I answer the five spec questions (§17) — click a suggestion. I never quote a value, and I say “I cannot know” when a right is missing.';
}
