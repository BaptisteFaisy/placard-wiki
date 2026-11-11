/**
 * `@placard-wiki/detectors` — familles wiki (§7, familles 10 à 12), pipeline
 * de balayage et port LLM avec cache.
 *
 * Réemploi (cahier §21, jamais de copie) :
 *  - `@placard/detectors` : les neuf familles Git, le moteur ligne à ligne,
 *    `scanPath`, les validateurs (entropie, plausibilité) ;
 *  - `@placard/core` : empreinte HMAC (`computeFingerprint`), aperçu masqué
 *    (`redactPreview`), filtre de valeurs factices (`isDummyValue`).
 *
 * Écrit ici : chaînes de connexion (10), tableaux d'identifiants (11), pièces
 * jointes sensibles (12), pipeline `scanItem`, port `LlmOracle` injectable
 * avec cache par empreinte de contenu — invite sans valeur brute.
 */

export const PACKAGE_NAME = '@placard-wiki/detectors';
export const PACKAGE_STATUS = 'implemented' as const;

export type {
  DetectionCandidate,
  ScanItem,
  VendorEngine,
  VendorRawDetection,
  WikiScanDeps,
} from './types.js';

export { createWikiScanner, scanItem } from './scan.js';

export {
  RULE_CONNECTION_JDBC_PARAM,
  RULE_CONNECTION_URI,
  findConnectionStrings,
  isRealisticPassword,
} from './rules/connection-strings.js';
export type { ConnectionMatch } from './rules/connection-strings.js';

export {
  MAX_STRUCTURE_CHARS,
  RULE_CREDENTIAL_LIST,
  RULE_CREDENTIAL_TABLE,
  findCredentialTables,
  tableIsKnownFake,
} from './rules/credential-tables.js';
export type { TableMatch } from './rules/credential-tables.js';

export {
  BINARY_ENTROPY_THRESHOLD,
  RULE_ATTACHMENT_ENTROPY,
  findWikiRiskyExtension,
  isAttachmentOfInterest,
  isHighEntropyBlob,
  screenshotBlindSpot,
} from './rules/attachments.js';
export type { BlindSpot, WikiExtensionMatch } from './rules/attachments.js';

export {
  ORACLE_SYSTEM_PROMPT_FR,
  buildQuestion,
  createCachedOracle,
  maskSpans,
} from './llm-oracle.js';
export type {
  CachedOracle,
  LlmOracle,
  LlmOracleQuestion,
  LlmOracleVerdict,
  OracleAnswer,
  OracleCacheOptions,
  OracleStats,
} from './llm-oracle.js';
