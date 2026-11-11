/**
 * Le résolveur unique de tous les écrans (contrat : BRIDGE_METHODS dans
 * @placard-wiki/domain). Chaque méthode renvoie aujourd'hui un « pas encore
 * implémenté » honnête ; les lots du chantier remplacent ces corps un par un.
 *
 * Règle : aucune méthode ne renvoie de valeur brute de secret — empreintes et
 * aperçus masqués seulement.
 */

import Resolver from '@forge/resolver';
import { BRIDGE_METHODS } from '@placard-wiki/domain';

const resolverInstance = new Resolver();

for (const method of BRIDGE_METHODS) {
  resolverInstance.define(method, async () => {
    return {
      notImplemented: method,
      honesty: 'Méthode déclarée au contrat bridge, implémentation en cours.',
    };
  });
}

export const resolver = resolverInstance.getDefinitions();
