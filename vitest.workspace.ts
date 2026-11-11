import { defineWorkspace } from 'vitest/config';

// Seuls les paquets du dépôt sont testés ici ; vendor/placard a sa propre CI
// dans son propre dépôt (aucun doublon de vérification).
export default defineWorkspace(['packages/*']);
