/**
 * Internationalisation de l'interface (cahier §23 : anglais + français).
 *
 * Discipline : la langue par défaut est l'ANGLAIS (soumission en anglais).
 * La bascule est accessible (un simple bouton, libellé dans les deux langues).
 *
 * Les libellés du domaine (familles, partages, étapes du rituel, gîtes,
 * méthodes de propriétaire, termes du score) viennent du vocabulaire du
 * paquet `@placard-wiki/domain` — déjà bilingues, jamais recopiés ici.
 *
 * Le store est un module singleton (pas de JSX dans ce fichier) : chaque
 * écran Forge est une racine React séparée, la bascule vaut pour l'écran
 * courant. `useSyncExternalStore` garantit le re-render synchronisé.
 */

import { useCallback, useSyncExternalStore } from 'react';

/** Les deux langues supportées (§23). Défaut : anglais. */
export type Lang = 'en' | 'fr';
export const DEFAULT_LANG: Lang = 'en';

/** Une entrée du dictionnaire : la même clé dans les deux langues. */
type Entry = { en: string; fr: string };

/**
 * Le dictionnaire de l'interface. Clés stables, valeurs courtes. Les
 * variables d'interpolation sont notées `{nom}` (une passe, pas de
 * dépendance externe).
 */
const MESSAGES: Record<string, Entry> = {
  // ---------------------------------------------------------------- commun
  'app.name': { en: 'Placard', fr: 'Placard' },
  'app.tagline': {
    en: 'Secrets sleeping in the wiki — found, counted, fixed in order.',
    fr: 'Les secrets qui dorment dans le wiki — trouvés, chiffrés, réparés dans l’ordre.',
  },
  'common.loading': { en: 'Loading…', fr: 'Chargement…' },
  'common.retry': { en: 'Retry', fr: 'Réessayer' },
  'common.error': { en: 'Something went wrong', fr: 'Une erreur est survenue' },
  'common.empty': { en: 'Nothing to show yet', fr: 'Rien à afficher pour l’instant' },
  'common.save': { en: 'Save', fr: 'Enregistrer' },
  'common.saved': { en: 'Saved', fr: 'Enregistré' },
  'common.cancel': { en: 'Cancel', fr: 'Annuler' },
  'common.close': { en: 'Close', fr: 'Fermer' },
  'common.view': { en: 'View', fr: 'Voir' },
  'common.redact': { en: 'Redact', fr: 'Caviarder' },
  'common.count': { en: 'count', fr: 'nombre' },
  'common.lang.switch': { en: 'Switch to French', fr: 'Basculer en anglais' },
  'common.lang.label': { en: 'Language', fr: 'Langue' },

  // ---------------------------------------------------- état vide honnête
  // « en l'absence de réponse, affiche un état vide honnête » (consigne).
  'empty.pending.title': {
    en: 'Backend not wired yet',
    fr: 'Backend pas encore branché',
  },
  'empty.pending.body': {
    en: 'This screen calls the bridge method “{method}”. The resolver answers honestly that it is not implemented yet, so there is no data to display.',
    fr: 'Cet écran appelle la méthode du bridge « {method} ». Le résolveur répond honnêtement qu’elle n’est pas encore implémentée : il n’y a donc aucune donnée à afficher.',
  },
  'empty.noData.title': { en: 'No data', fr: 'Aucune donnée' },
  'empty.noData.body': {
    en: 'Nothing matched. Either the wiki is clean, or a sweep has not run yet.',
    fr: 'Aucun résultat. Soit le wiki est propre, soit aucun balayage n’a encore tourné.',
  },

  // ---------------------------------------------------- page globale
  'global.title': { en: 'The building and the registry', fr: 'Le bâtiment et le registre' },
  'global.subtitle': {
    en: 'The registry carries exactly the same information as the building — both keyboard-navigable, WCAG AA.',
    fr: 'Le registre porte exactement la même information que le bâtiment — les deux navigables au clavier, WCAG AA.',
  },
  'global.tab.registry': { en: 'Registry', fr: 'Registre' },
  'global.tab.building': { en: 'Building', fr: 'Bâtiment' },
  'global.tab.budget': { en: 'Budget & coverage', fr: 'Budget & couverture' },
  'global.tab.adoption': { en: 'Adoption queue', fr: 'File d’adoption' },

  // ---------------------------------------------------- registre (PW-15)
  'registry.caption': { en: 'Findings registry — fingerprints and masked previews only', fr: 'Registre des foyers — empreintes et aperçus masqués seulement' },
  'registry.filter.space': { en: 'Space', fr: 'Espace' },
  'registry.filter.family': { en: 'Family', fr: 'Famille' },
  'registry.filter.state': { en: 'State', fr: 'État' },
  'registry.filter.minScore': { en: 'Minimum score', fr: 'Score minimum' },
  'registry.filter.any': { en: 'Any', fr: 'Tous' },
  'registry.col.space': { en: 'Space', fr: 'Espace' },
  'registry.col.page': { en: 'Page', fr: 'Page' },
  'registry.col.family': { en: 'Family', fr: 'Famille' },
  'registry.col.preview': { en: 'Masked preview', fr: 'Aperçu masqué' },
  'registry.col.score': { en: 'Score', fr: 'Score' },
  'registry.col.state': { en: 'State', fr: 'État' },
  'registry.col.locations': { en: 'Locations', fr: 'Emplacements' },
  'registry.col.readers': { en: 'Readers', fr: 'Lecteurs' },
  'registry.col.sharing': { en: 'Sharing', fr: 'Partage' },
  'registry.col.ai': { en: 'AI surface', fr: 'Surface IA' },
  'registry.col.owner': { en: 'Owner', fr: 'Propriétaire' },
  'registry.col.lastSeen': { en: 'Last seen', fr: 'Vu le' },
  'registry.sortHint': {
    en: 'Click a column heading to sort; arrow keys move through the table.',
    fr: 'Cliquez sur un en-tête de colonne pour trier ; les flèches parcourent le tableau.',
  },
  'registry.rows': { en: '{n} findings', fr: '{n} foyers' },
  'registry.ai.yes': { en: 'Presumed indexed', fr: 'Présumée indexée' },
  'registry.ai.no': { en: 'Not presumed', fr: 'Non présumée' },

  // ---------------------------------------------------- bâtiment (§10)
  'building.title': { en: 'The building', fr: 'Le bâtiment' },
  'building.hint': {
    en: 'Wings are spaces, floors are page depth, rooms are pages (size = audience). The registry is the accessible equivalent.',
    fr: 'Les ailes sont les espaces, les étages la profondeur des pages, les pièces les pages (taille = audience). Le registre en est l’équivalent accessible.',
  },
  'building.wing': { en: 'Wing — space {key}', fr: 'Aile — espace {key}' },
  'building.floor': { en: 'Floor (depth {depth})', fr: 'Étage (profondeur {depth})' },
  'building.room': { en: 'Room — page {title}', fr: 'Pièce — page {title}' },
  'building.audience': { en: '{n} potential readers', fr: '{n} lecteurs potentiels' },
  'building.door.locked': { en: 'Locked door — restricted page', fr: 'Porte verrouillée — page restreinte' },
  'building.window.open': { en: 'Open window — public or link sharing', fr: 'Fenêtre ouverte — partage public ou par lien' },
  'building.glow': { en: 'Glow under the door — max danger {score}', fr: 'Lueur sous la porte — danger max {score}' },
  'building.cellar': { en: 'Cellar — version history', fr: 'Cave — historique de versions' },
  'building.cellar.open': { en: 'Open trapdoor — a secret is still readable in an old version', fr: 'Trappe ouverte — un secret reste lisible dans une ancienne version' },
  'building.draft': { en: 'Draft between {a} and {b} — same fingerprint propagated', fr: 'Courant d’air entre {a} et {b} — même empreinte propagée' },
  'building.poster': { en: 'Poster on the wall — template that copies its content', fr: 'Affiche au mur — modèle qui recopie son contenu' },
  'building.walled': { en: 'Walled room — orphan page, no resolved owner', fr: 'Pièce murée — page orpheline, sans propriétaire résolu' },
  'building.seal': { en: '{n} wax seals — closed findings', fr: '{n} sceaux de cire — foyers clos' },
  'building.ribbon': { en: '{n} ribbons — dismissed false positives', fr: '{n} rubans — faux positifs écartés' },
  'building.legend': { en: 'Legend', fr: 'Légende' },

  // ---------------------------------------------------- budget (§14, PW-19)
  'budget.title': { en: 'Budget and coverage', fr: 'Budget et couverture' },
  'budget.pagesScanned': { en: 'Pages scanned', fr: 'Pages balayées' },
  'budget.attachmentsRead': { en: 'Attachments read', fr: 'Pièces jointes lues' },
  'budget.attachmentsSkipped': { en: 'Attachments skipped', fr: 'Pièces jointes non lues' },
  'budget.llmCalls': { en: 'LLM calls (ambiguous candidates only)', fr: 'Appels LLM (candidats ambigus seulement)' },
  'budget.tokens': { en: 'Tokens consumed', fr: 'Jetons consommés' },
  'budget.cost': { en: 'Estimated cost', fr: 'Coût estimé' },
  'budget.lastPass': { en: 'Last pass', fr: 'Dernière passe' },
  'budget.coverageNote': { en: 'Coverage note', fr: 'Note de couverture' },
  'budget.skipped.title': { en: 'Unread files — and why', fr: 'Fichiers non lus — et pourquoi' },
  'budget.skipped.row': { en: '{kind}: {reason} ({count})', fr: '{kind} : {reason} ({count})' },
  'budget.coverage.title': { en: 'Coverage per hiding place', fr: 'Couverture par gîte' },
  'budget.coverage.row': { en: '{gite}: {scanned} scanned, {skipped} skipped', fr: '{gite} : {scanned} balayés, {skipped} ignorés' },
  'budget.blindSpots.title': { en: 'Declared blind spots', fr: 'Angles morts déclarés' },
  'budget.blindSpots.empty': { en: 'None declared.', fr: 'Aucun déclaré.' },
  'budget.missingRights.title': { en: 'Missing rights (not the same as “no data”)', fr: 'Droits manquants (différent de « pas de données »)' },
  'budget.missingRights.empty': { en: 'No missing rights.', fr: 'Aucun droit manquant.' },

  // ---------------------------------------------------- adoption (§12, PW-14)
  'adoption.title': { en: 'Adoption queue', fr: 'File d’adoption' },
  'adoption.hint': {
    en: 'Pages with no resolved owner. The space designates someone — never a ranking of people.',
    fr: 'Pages sans propriétaire résolu. L’espace désigne quelqu’un — jamais un classement de personnes.',
  },
  'adoption.empty': { en: 'No orphan pages. Every page has a resolved owner.', fr: 'Aucune page orpheline. Chaque page a un propriétaire résolu.' },
  'adoption.col.page': { en: 'Page', fr: 'Page' },
  'adoption.col.space': { en: 'Space', fr: 'Espace' },
  'adoption.col.editors': { en: 'Last editors', fr: 'Derniers éditeurs' },
  'adoption.col.assign': { en: 'Assign', fr: 'Assigner' },
  'adoption.assignTo': { en: 'Assign to…', fr: 'Assigner à…' },
  'adoption.assigned': { en: 'Assigned', fr: 'Assigné' },

  // ---------------------------------------------------- réglages espace (PW-24)
  'settings.title': { en: 'Space settings', fr: 'Réglages de l’espace' },
  'settings.hint': {
    en: 'Detection families, alert threshold, exclusions with a reason, purge policy, default owner, demo mode.',
    fr: 'Familles de détection, seuil d’alerte, exclusions avec raison, politique de purge, propriétaire par défaut, mode démo.',
  },
  'settings.families': { en: 'Active families', fr: 'Familles actives' },
  'settings.minScore': { en: 'Alert threshold (0–100)', fr: 'Seuil d’alerte (0–100)' },
  'settings.minScore.help': {
    en: 'Below this score the finding still exists but does not alert.',
    fr: 'En dessous de ce score le foyer existe mais n’alerte pas.',
  },
  'settings.exclusions': { en: 'Exclusions (with reason)', fr: 'Exclusions (avec raison)' },
  'settings.exclusions.empty': { en: 'No exclusions.', fr: 'Aucune exclusion.' },
  'settings.exclusion.reason': { en: 'Reason', fr: 'Raison' },
  'settings.exclusion.fingerprint': { en: 'Fingerprint', fr: 'Empreinte' },
  'settings.exclusion.pattern': { en: 'Pattern', fr: 'Motif' },
  'settings.purgePolicy': { en: 'Purge policy', fr: 'Politique de purge' },
  'settings.purge.requestAdmin': { en: 'Ask the site administrator', fr: 'Demander à l’administrateur du site' },
  'settings.purge.apiIfPossible': { en: 'Use the API when possible', fr: 'Utiliser l’API si possible' },
  'settings.defaultOwner': { en: 'Default owner', fr: 'Propriétaire par défaut' },
  'settings.demoMode': { en: 'Demo mode', fr: 'Mode démonstration' },
  'settings.demoMode.help': {
    en: 'Seeded space with a fake secret per family in every hiding place. Marked as such in the interface.',
    fr: 'Espace semé d’un faux secret par famille dans chaque gîte. Marqué comme tel dans l’interface.',
  },
  'settings.save': { en: 'Save settings', fr: 'Enregistrer les réglages' },

  // ---------------------------------------------------- encart page (§18.2)
  'action.title': { en: 'Findings on this page', fr: 'Foyers sur cette page' },
  'action.summary': { en: '{n} findings, max danger {max}', fr: '{n} foyers, danger max {max}' },
  'action.summary.zero': { en: 'No findings on this page', fr: 'Aucun foyer sur cette page' },
  'action.ritual': { en: 'Ritual state', fr: 'État du rituel' },
  'action.noPage': { en: 'No page in context.', fr: 'Aucune page dans le contexte.' },
  'action.locations': { en: '{n} locations', fr: '{n} emplacements' },
  'action.scoreTerms': { en: 'Score terms (every applied term, with its method)', fr: 'Termes du score (chaque terme appliqué, avec sa méthode)' },
  'action.ritualSteps': { en: 'Ritual steps', fr: 'Étapes du rituel' },
  'action.preview': { en: 'Proposed diff (masked — the value is never shown)', fr: 'Diff proposé (masqué — la valeur n’est jamais montrée)' },
  'action.apply': { en: 'Apply redaction', fr: 'Appliquer le caviardage' },
  'action.listening': { en: 'Listening for new publications on this page…', fr: 'À l’écoute des nouvelles publications sur cette page…' },
  'action.redactComment': {
    en: 'Redacted via Placard — rotation attested, value removed',
    fr: 'Caviardé via Placard — rotation attestée, valeur retirée',
  },

  // ---------------------------------------------------- bannière temps réel (§18.3)
  'realtime.banner.title': {
    en: 'This page contains a {family} pattern — danger {score}',
    fr: 'Cette page contient un motif de {family} — danger {score}',
  },
  'realtime.banner.hint': {
    en: 'Pushed to you right after publishing, before the page is indexed or copied.',
    fr: 'Poussée juste après publication, avant que la page soit indexée ou recopiée.',
  },
  'realtime.banner.api': {
    en: 'Realtime channel — API to be validated in week 1 (per the spec).',
    fr: 'Canal temps réel — API à valider en semaine 1 (selon le cahier).',
  },

  // ---------------------------------------------------- certificat (§18.8)
  'certificate.title': { en: 'Certificate', fr: 'Certificat' },
  'certificate.hint': {
    en: 'A dated, encrypted page for an auditor: figures, blind spots, content fingerprint. Never a raw value.',
    fr: 'Une page datée et chiffrée pour un auditeur : chiffres, angles morts, empreinte du contenu. Jamais de valeur brute.',
  },
  'certificate.scope': { en: 'Scope', fr: 'Périmètre' },
  'certificate.issuedAt': { en: 'Issued at', fr: 'Émis le' },
  'certificate.open': { en: 'Open findings', fr: 'Foyers ouverts' },
  'certificate.rotated': { en: 'Rotated', fr: 'Tournés' },
  'certificate.redacted': { en: 'Redacted', fr: 'Caviardés' },
  'certificate.purged': { en: 'Purged', fr: 'Purgés' },
  'certificate.residual': { en: 'Residual exposure', fr: 'Exposition résiduelle' },
  'certificate.blindSpots': { en: 'Declared blind spots', fr: 'Angles morts déclarés' },
  'certificate.contentHash': { en: 'Content fingerprint', fr: 'Empreinte du contenu' },
  'certificate.generate': { en: 'Generate', fr: 'Générer' },
  'certificate.noCert': { en: 'No certificate generated yet.', fr: 'Aucun certificat généré pour l’instant.' },

  // ---------------------------------------------------- états foyer
  'state.open': { en: 'Open', fr: 'Ouvert' },
  'state.rotation-attested': { en: 'Rotation attested', fr: 'Rotation attestée' },
  'state.redacted': { en: 'Redacted', fr: 'Caviardé' },
  'state.purge-requested': { en: 'Purge requested', fr: 'Purge demandée' },
  'state.purged': { en: 'Purged', fr: 'Purgé' },
  'state.purge-impossible': { en: 'Purge impossible', fr: 'Purge impossible' },
  'state.sealed': { en: 'Sealed', fr: 'Clos (sceau de cire)' },
  'state.dismissed': { en: 'Dismissed', fr: 'Écarté (ruban)' },
};

/** Le store de langue : un singleton par écran (pas de JSX ici). */
let currentLang: Lang = DEFAULT_LANG;
const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Lang {
  return currentLang;
}

/** Change la langue courante (la bascule accessible). */
export function setLang(lang: Lang): void {
  if (lang === currentLang) return;
  currentLang = lang;
  emitChange();
}

/** Interpole `{nom}` dans un gabarit — une passe, aucune dépendance. */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  let out = template;
  for (const [name, value] of Object.entries(vars)) {
    out = out.split('{' + name + '}').join(String(value));
  }
  return out;
}

/**
 * Traduit une clé dans la langue courante. Retourne la clé elle-même si
 * absente du dictionnaire (jamais de `undefined` affiché — honnêteté).
 */
export function translate(key: string, lang: Lang, vars?: Record<string, string | number>): string {
  const entry: Entry | undefined = MESSAGES[key];
  if (!entry) return key;
  return interpolate(entry[lang], vars);
}

/** Résultat du hook : langue courante, traducteur, bascule. */
export interface I18n {
  lang: Lang;
  /** Traduit `key` dans la langue courante, avec interpolation optionnelle. */
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Bascule anglais ↔ français (la bascule accessible, §23). */
  toggle: () => void;
}

/**
 * Hook d'accès à l'i18n. Chaque écran Forge est une racine React distincte ;
 * le store singleton tient pour la durée de l'écran courant.
 */
export function useI18n(): I18n {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => translate(key, lang, vars),
    [lang],
  );

  const toggle = useCallback(() => {
    setLang(lang === 'en' ? 'fr' : 'en');
  }, [lang]);

  return { lang, t, toggle };
}
