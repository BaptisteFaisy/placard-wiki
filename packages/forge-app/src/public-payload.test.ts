/**
 * Le contrat public, vérifié sur la charge utile RÉELLE.
 *
 * Ce test ne valide pas une copie de la charge utile : il appelle la
 * fonction qui la produit (`buildPublicPayload`) et valide son résultat
 * contre `docs/api-live.schema.json` (JSON Schema draft 2020-12).
 *
 * Deux vérifications :
 *  1. **validité** — la charge utile produite est conforme au schéma ;
 *  2. **complétude** — le schéma décrit EXACTEMENT ce qui est produit :
 *     aucune clé émise non décrite, aucun champ requis décrit non émis.
 *
 * Si la fonction et le schéma divergent, ce test casse. C'est la garantie
 * qu'un tiers peut s'appuyer sur le contrat.
 */

import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import type { AnySchemaObject } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import schema from '../../../docs/api-live.schema.json';
import { LIVE_CONTRACT_VERSION } from '@placard-wiki/domain';
import type { Foyer } from '@placard-wiki/domain';
import { buildPublicPayload } from './public-payload';
import { makeTestContext } from './services/test-support';

/** Le schéma qui fait foi — versionné comme le contrat qu'il décrit. */
const SCHEMA = schema as unknown as AnySchemaObject;

/**
 * Un validateur ajv 2020-12, strict : une clé inconnue est une erreur.
 *
 * `x-contract-version` et `x-contract-header` sont déclarés comme vocabulaire
 * connu : ce sont des annotations du contrat, pas des mots-clés de validation.
 */
const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addVocabulary(['x-contract-version', 'x-contract-header']);
addFormats(ajv as never);
const validate = ajv.compile(SCHEMA);

/** Une clé d'emplacement de test : `loc-` + huit caractères hexadécimaux. */
const LOC_ID = 'loc-913eefba';

/** Un foyer complet : tous les champs optionnels sont exercising. */
function richFoyer(): Foyer {
  return {
    id: 'foyer-hmac256:09360132',
    fingerprint: 'hmac256:09360132fe34a06768d051fe0166b307',
    family: 'platform-token',
    baseScore: 50,
    score: 65,
    scoreTerms: [
      { id: 'base-family', points: 50, label: 'Base par famille', method: 'Base par la famille de détection.' },
      {
        id: 'current-version',
        points: 20,
        label: 'Toujours présent dans la version courante',
        method: '+20 si au moins un emplacement présent.',
        evidence: '1 emplacement dans la version courante',
      },
    ],
    state: 'rotation-attested',
    firstSeenAt: '2026-11-12T15:10:18.081Z',
    lastSeenAt: '2026-11-12T15:17:16.464Z',
    rotatedAt: '2026-11-12T16:00:00.000Z',
    rotationEvidenceRef: 'JIRA-SEC-1',
    dismissedReason: 'Faux positif — clé de test',
    dismissedReviewAt: '2026-11-12T16:05:00.000Z',
    primaryPageId: '3932169',
    spaceKey: 'PLACARDDEMO',
    locations: [
      {
        id: LOC_ID,
        foyerId: 'foyer-hmac256:09360132',
        containerType: 'page',
        containerAri: 'ari:cloud:confluence::page/3932169',
        pageId: '3932169',
        versionNumber: 1,
        field: 'body',
        charStart: 20,
        charEnd: 68,
        maskedPreview: 'sk-p…(48)',
        detectedAt: '2026-11-12T15:17:16.464Z',
        redactedAt: '2026-11-12T16:10:00.000Z',
        status: 'redacted',
        gite: 'corps-de-page',
      },
    ],
  };
}

/** Le contexte de test, enrichi d'un foyer et d'une exposition. */
async function richContext() {
  const ctx = makeTestContext();
  await ctx.store.saveFoyer(richFoyer());
  await ctx.store.exposures.put({
    pageId: '3932169',
    spaceKey: 'PLACARDDEMO',
    readers: { low: 0, high: 0, method: 'Permissions de l’espace.', caveats: [] },
    sharing: 'space-default',
    restrictions: [],
    aiSurface: { presumedIndexed: true, hypothesis: true, method: 'Hypothèse conservatrice (§13).' },
    computedAt: '2026-11-12T15:20:00.000Z',
  });
  return ctx;
}

/** Un nœud de schéma, résolu : les `$ref` sont suivies. */
type SchemaNode = Record<string, unknown>;

/** Résout une `$ref` locale (`#/$defs/…`) dans le schéma. */
function resolveRef(node: SchemaNode, root: SchemaNode): SchemaNode {
  const ref = node['$ref'];
  if (typeof ref !== 'string') return node;
  const name = ref.replace('#/$defs/', '');
  const defs = root['$defs'] as Record<string, SchemaNode> | undefined;
  const target = defs?.[name];
  if (target === undefined) throw new Error(`référence de schéma inconnue : ${ref}`);
  return resolveRef(target, root);
}

/** Un écart entre le schéma et ce qui est réellement produit. */
interface Drift {
  path: string;
  problem: string;
}

/** Compare une valeur produite et le nœud de schéma qui la décrit. */
function compare(value: unknown, node: SchemaNode, root: SchemaNode, path: string, drifts: Drift[]): void {
  const resolved = resolveRef(node, root);
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const properties = (resolved['properties'] as Record<string, SchemaNode> | undefined) ?? {};
    const required = (resolved['required'] as string[] | undefined) ?? [];
    const additional = resolved['additionalProperties'];
    const emitted = Object.keys(value as Record<string, unknown>);
    for (const key of emitted) {
      if (properties[key] !== undefined) {
        compare((value as Record<string, unknown>)[key], properties[key] as SchemaNode, root, `${path}.${key}`, drifts);
      } else if (typeof additional === 'object' && additional !== null) {
        compare((value as Record<string, unknown>)[key], additional as SchemaNode, root, `${path}.${key}`, drifts);
      } else {
        drifts.push({ path: `${path}.${key}`, problem: 'clé émise non décrite par le schéma' });
      }
    }
    for (const key of required) {
      if (!emitted.includes(key)) {
        drifts.push({ path: `${path}.${key}`, problem: 'champ requis décrit mais non émis' });
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    const items = resolved['items'];
    if (items === undefined) return;
    value.forEach((item, index) => compare(item, items as SchemaNode, root, `${path}[${String(index)}]`, drifts));
  }
}

describe('contrat public — validité de la charge utile réelle', () => {
  it('la charge utile produite par la fonction réelle est conforme au schéma', async () => {
    const ctx = await richContext();
    const payload = await buildPublicPayload(ctx);
    const ok = validate(payload);
    expect(validate.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
  });

  it('le schéma porte la version du contrat', () => {
    expect(schema['x-contract-version']).toBe(LIVE_CONTRACT_VERSION);
    expect(schema['$id']).toContain(LIVE_CONTRACT_VERSION);
  });
});

describe('contrat public — complétude du schéma', () => {
  it('aucune clé émise non décrite, aucun champ requis décrit non émis', async () => {
    const ctx = await richContext();
    const payload = await buildPublicPayload(ctx);
    const drifts: Drift[] = [];
    compare(payload, SCHEMA, SCHEMA, 'payload', drifts);
    expect(drifts).toEqual([]);
  });
});
