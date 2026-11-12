/**
 * Le rituel wiki (§9) : tourner → caviarder → purger → empêcher → vérifier,
 * avec ses verrous. La séquence et son verrouillage s'inspirent de
 * `@placard/ritual` (Git) — adaptés au wiki, jamais recopiés (cahier §21) :
 *
 * - l'attestation de rotation est humaine et refusée à un agent (§17, §25.8) ;
 * - le verrou PW-09 bloque le caviardage tant qu'aucune attestation humaine
 *   n'existe (§25.7) — variante wiki du verrou d'ordre PLA-F-23 ;
 * - les diffs de caviardage sont masqués (PW-04/PW-10) : cette logique ne
 *   reçoit jamais la valeur brute, seulement des positions dans le texte ;
 * - la purge d'historique est l'étape honnête (§9, §25.10) : liste exacte si
 *   c'est possible, impossibilité écrite + demande groupée à l'administrateur
 *   sinon, et le foyer reste ouvert — comme `@placard/ritual` refuse de
 *   réécrire l'historique lui-même (PLA-F-24) ;
 * - le certificat reprend la discipline de celui de `@placard/ritual`
 *   (compteurs + angles morts déclarés + intégrité par empreinte), en donnée
 *   du registre signée HMAC-SHA-256 sur JSON canonique (§25.16).
 *
 * Tout est logique pure ; les effets de bord passent par des ports
 * injectables (`ports.ts`) que le résolveur Forge implémente.
 */

export * from './ports';
export * from './attestation';
export * from './lock';
export * from './redaction';
export * from './purge';
export * from './purge-verify';
export * from './purge-report';
export * from './seal';
export * from './ribbon';
export * from './certificate';
export * from './jira';

export const PACKAGE_NAME = '@placard-wiki/ritual';
export const PACKAGE_STATUS = 'implemented' as const;
