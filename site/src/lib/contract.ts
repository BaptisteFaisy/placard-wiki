// Le contrat public de l'API live, côté navigateur.
//
// Le site ne fait pas confiance à la réponse : il la valide contre le MÊME
// schéma que celui qui fait foi côté app (`docs/api-live.schema.json`,
// JSON Schema draft 2020-12). Une réponse qui ne correspond plus au contrat
// n'est JAMAIS affichée comme si elle était valide : le site bascule sur le
// jeu embarqué (snapshot) et affiche la raison (§4, §5 — l'honnêteté avant
// la démonstration).
//
// Deux contrôles, un seul schéma :
//  1. le **corps** de la réponse est validé contre le schéma ;
//  2. l'**en-tête** `X-Placard-Contract` porte la version du contrat servi.
//     S'il est présent et différent de la version attendue, c'est un refus :
//     le site ne parle pas une langue qu'il ne connaît pas.
//     S'il est absent (déploiement de l'app en cours), le corps fait foi.

import Ajv2020 from 'ajv/dist/2020';
import type { AnySchemaObject } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import schema from '../../../docs/api-live.schema.json';
import { LIVE_CONTRACT_HEADER, LIVE_CONTRACT_VERSION } from '@placard-wiki/domain';

/** Le schéma publié — importé tel quel : l'app et le site partagent le même. */
const SCHEMA = schema as unknown as AnySchemaObject;

/**
 * Le validateur (ajv, draft 2020-12, strict).
 *
 * `x-contract-version` et `x-contract-header` sont des annotations du
 * contrat : elles sont déclarées comme vocabulaire connu, sinon ajv les
 * prendrait pour des mots-clés de validation inconnus.
 */
const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addVocabulary(['x-contract-version', 'x-contract-header']);
// `addFormats` attend la classe `Ajv` ; `Ajv2020` en est le cousin strict.
addFormats(ajv as never);

const validate = ajv.compile(SCHEMA);

/** Le verdict d'un contrôle de contrat. */
export type ContractVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly detail: string };

/** Un message court : les erreurs de validation, à plat. */
function describeErrors(errors: readonly { instancePath: string; message?: string }[] | null | undefined): string {
  if (errors === null || errors === undefined || errors.length === 0) return 'contrat non respecté';
  return errors
    .slice(0, 4)
    .map((error) => `${error.instancePath === '' ? '/' : error.instancePath} ${error.message ?? 'invalide'}`)
    .join(' ; ');
}

/** Le corps de la réponse respecte-t-il le contrat publié ? */
export function checkContractBody(raw: unknown): ContractVerdict {
  if (validate(raw)) return { ok: true };
  return { ok: false, detail: describeErrors(validate.errors) };
}

/** L'en-tête de version est-il compatible avec le contrat que le site connaît ? */
export function checkContractHeader(version: string | null | undefined): ContractVerdict {
  if (version === null || version === undefined || version.trim() === '') {
    // En-tête absent : le corps fait foi (déploiement de l'app en cours).
    return { ok: true };
  }
  if (version.trim() === LIVE_CONTRACT_VERSION) return { ok: true };
  return {
    ok: false,
    detail: `version servie « ${version.trim()} » ≠ version attendue « ${LIVE_CONTRACT_VERSION} »`,
  };
}

/**
 * Le contrôle complet : corps + en-tête.
 *
 * Renvoie le verdict et, en cas de refus, la raison affichable.
 */
export function checkContract(raw: unknown, headerVersion?: string | null): ContractVerdict {
  const header = checkContractHeader(headerVersion);
  if (!header.ok) return header;
  return checkContractBody(raw);
}

/** La version du contrat que ce site attend (affichée dans l'indicateur). */
export const EXPECTED_CONTRACT_VERSION = LIVE_CONTRACT_VERSION;

/** Le nom de l'en-tête qui porte la version (affiché dans l'indicateur). */
export const CONTRACT_HEADER_NAME = LIVE_CONTRACT_HEADER;
