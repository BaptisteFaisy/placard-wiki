/**
 * La page globale : le bâtiment (§10), le registre, le budget, l'adoption.
 * Le registre porte exactement la même information que le bâtiment ; les deux
 * sont navigables au clavier et conformes WCAG AA.
 */

import { Text } from '@forge/react';

export default function GlobalPage(): JSX.Element {
  return (
    <Text>
      Placard — le bâtiment et le registre sont en construction (lot « écrans »).
      Aucun secret n’est affiché ici : empreintes et aperçus masqués seulement.
    </Text>
  );
}
