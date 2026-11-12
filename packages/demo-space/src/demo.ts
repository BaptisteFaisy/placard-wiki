/**
 * `pnpm demo` — la démo jouable hors réseau, sortie texte ou JSON.
 *
 * Usage :
 *   pnpm demo           # storyboard lisible
 *   pnpm demo --json    # même rapport en JSON (idem `pnpm demo:json`)
 *
 * Aucune clé, aucun réseau : `runDemoScenario()` branche les vrais services
 * sur un client de fixtures et un store en mémoire. La garde de sortie
 * remplace `fetch` par un échec explicite : si un chemin tentait de sortir,
 * la démo le dit et s'arrête.
 */

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { runDemoScenario } from './demo-scenario';
import type { DemoReport } from './demo-types';
import type { AppliedScoreTerm } from '@placard-wiki/domain';

/** La garde de sortie : toute tentative de `fetch` échoue avec un message clair. */
async function avecGardeDeSortie<T>(action: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.reject(new Error('Démo hors réseau : une sortie réseau a été tentée, la démo s’arrête.'));
  try {
    return await action();
  } finally {
    globalThis.fetch = original;
  }
}

/** Une barre de séparation du storyboard. */
function barre(largeur = 72): string {
  return '─'.repeat(largeur);
}

/** Un terme de score, en une ligne (signe + points + libellé). */
function rendTerme(terme: AppliedScoreTerm): string {
  const signe = terme.points >= 0 ? '+' : '−';
  return `    ${signe} ${Math.abs(terme.points)} · ${terme.label}`;
}

/** Fenêtre lisible autour d'une aiguille dans une ligne (pour un extrait masqué). */
function extraitAutour(ligne: string, aiguille: string): string {
  const index = ligne.indexOf(aiguille);
  if (index < 0) return ligne.slice(0, 90);
  const debut = Math.max(0, index - 40);
  const fin = Math.min(ligne.length, index + aiguille.length + 40);
  return (debut > 0 ? '…' : '') + ligne.slice(debut, fin) + (fin < ligne.length ? '…' : '');
}

/** La répartition par gîte, lisible. */
function formatParGite(parGite: Record<string, number>): string {
  return Object.entries(parGite)
    .map(([gite, nombre]) => `${gite} ${nombre}`)
    .join(' · ');
}

/** La passe : ce qui a été lu, et ce qui a été regroupé. */
function rendPasse(report: DemoReport): string[] {
  const { sweep, scores } = report;
  return [
    'PASSE — hors réseau, sans clé (client de fixtures + store mémoire).',
    `  pages balayées ${sweep.pagesScanned} · pièces jointes lues ${sweep.attachmentsRead} · ` +
      `appels oracle ${sweep.llmCalls} (oracle factice) · ${sweep.durationMs} ms.`,
    `  ${scores.plantes} valeurs factices plantées (12 numéros × 7 gîtes).`,
    `  → ${scores.foyers} foyers distincts (une empreinte = un foyer), ${scores.emplacements} emplacements`,
    '    (la même empreinte dort à plusieurs endroits ; un foyer = sa réparation suit).',
    `  Répartition par gîte : ${formatParGite(scores.parGite)}.`,
  ];
}

/** Le score : jamais un nombre nu, toujours ses termes et leurs méthodes. */
function rendScore(report: DemoReport): string[] {
  const { scores, foyer } = report;
  return [
    'EXPOSITION + SCORE — le plus dangereux du registre.',
    `  ${scores.dangerMax}/100 · famille « ${foyer.familyLabel} » (${foyer.family}).`,
    '  Le score n’est jamais un nombre nu — chaque terme porte sa méthode :',
    ...foyer.scoreTerms.map(rendTerme),
  ];
}

/** Le rituel : verrou, attestation, caviardage, purge, étapes. */
function rendRituel(report: DemoReport): string[] {
  const { ritual } = report;
  const premierDiff = ritual.redaction.diffs[0];
  const lignes = [
    'RITUEL — joué sur le foyer le plus dangereux.',
    '  1. Verrou : caviarder est refusé avant l’attestation humaine.',
    `       refus agent (rotation) : ${ritual.verrou.refusAgent}`,
    `       refus caviardage : ${ritual.verrou.refusCaviardage}`,
    `  2. Attestation humaine (${ritual.attestation.provider}, ${ritual.attestation.attestedAt}) → déverrouille.`,
    `  3. Caviardage : ${ritual.redaction.diffs.length} diff(s), ` +
      `${ritual.redaction.applied} emplacement(s) écrit(s) au nom de ${ritual.redaction.asUser}.`,
  ];
  if (premierDiff !== undefined) {
    lignes.push(`       avant : ${extraitAutour(premierDiff.maskedBefore, '[REDACTED:')}`);
    lignes.push(`       après : ${extraitAutour(premierDiff.after, premierDiff.replacement)}`);
  }
  lignes.push(`  4. Purge : ${ritual.purge.apiCanPurge ? 'possible' : 'impossible'} — foyer laissé ouvert.`);
  lignes.push(`       ${ritual.purge.blockedReason}`);
  lignes.push(`  5. Étapes : ${ritual.steps.map((s) => `${s.step}=${s.state}`).join(' → ')}.`);
  return lignes;
}

/** Le certificat : des compteurs, une date, une empreinte — et l'honnêteté. */
function rendCertificat(report: DemoReport): string[] {
  const { certificate } = report;
  return [
    'CERTIFICAT — daté, signé, vérifiable (aucun secret, que des compteurs).',
    `  périmètre ${certificate.scope} · ouverts ${certificate.open} · tournés ${certificate.rotated}` +
      ` · caviardés ${certificate.redacted} · purgés ${certificate.purged}.`,
    `  résiduel : ${certificate.residualExposure}.`,
    '  Le foyer caviardé reste en état purge-impossible (son historique dort encore) :',
    '  l’app ne le compte ni caviardé ni purgé — elle ne prétend jamais avoir purgé.',
  ];
}

/** La confidentialité : ce que l'on peut montrer, et comment. */
function rendConfidentialite(report: DemoReport): string[] {
  const lignes = ['AUCUNE VALEUR BRUTE — chaque emplacement est vu par son aperçu masqué.'];
  for (const location of report.foyer.locations) {
    lignes.push(`    ${location.gite} : ${location.maskedPreview}`);
  }
  lignes.push('');
  lignes.push('ANGLES MORTS DÉCLARÉS (jamais masqués) :');
  for (const avertissement of report.avertissements) lignes.push(`  − ${avertissement}`);
  return lignes;
}

/** Le storyboard, ligne à ligne : détection → regroupement → score → rituel → certificat. */
export function renderReportText(report: DemoReport): string[] {
  return [
    report.scenario,
    barre(),
    '',
    ...rendPasse(report),
    '',
    ...rendScore(report),
    '',
    ...rendRituel(report),
    '',
    ...rendCertificat(report),
    '',
    ...rendConfidentialite(report),
  ];
}

/** Le même rapport, en JSON (pas de valeur brute non plus). */
export function renderReportJson(report: DemoReport): string {
  return JSON.stringify(report, null, 2);
}

/** Point d'entrée : renvoie le code de sortie (0 = succès). */
export async function main(
  argv: readonly string[] = process.argv.slice(2),
  log: (ligne: string) => void = console.log,
): Promise<number> {
  const json = argv.includes('--json');
  try {
    const report = await avecGardeDeSortie(runDemoScenario);
    if (json) {
      log(renderReportJson(report));
    } else {
      for (const ligne of renderReportText(report)) log(ligne);
    }
    return 0;
  } catch (error) {
    log(`[demo] échec : ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

/** Garde d'exécution directe (ESM) : `tsx src/demo.ts`. */
const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  void main().then((code) => {
    process.exitCode = code;
  });
}
