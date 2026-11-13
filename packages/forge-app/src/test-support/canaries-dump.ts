/**
 * Sortie du corpus de canaris — le pont entre la preuve TypeScript et le
 * rejeu hors ligne (`tools/leak-check.mjs`).
 *
 * Ce fichier est exécuté (`node --import tsx …`) pour produire la liste des
 * valeurs de test, **en mémoire**, à destination du script de rejeu. Les
 * valeurs ne sont jamais écrites dans le dépôt, ni journalisées : stdout est
 * capturé par le consommateur, pas affiché.
 *
 * La source des valeurs est unique : `test-support/canaries.ts`, lui-même bâti
 * sur `@placard/core` (fake-values) et les fixtures de `@placard-wiki/demo-space`.
 */

import { CANARIES } from './canaries';

const sortie = CANARIES.map((canary) => ({ label: canary.label, value: canary.value }));
process.stdout.write(JSON.stringify(sortie));