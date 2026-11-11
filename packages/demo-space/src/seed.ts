/**
 * Seed de l'espace de démonstration (§15) — squelette.
 *
 * Usage cible : `pnpm seed:demo` avec CONFLUENCE_BASE_URL, CONFLUENCE_EMAIL et
 * CONFLUENCE_API_TOKEN dans l'environnement (jamais dans le dépôt). Le lot
 * « demo-space » implémente : création de l'espace, une page par gîte, un faux
 * secret de chaque famille (valeurs de @placard/core fake-values), une version
 * historique corrigée, un modèle, une page partagée « anyone with the link »,
 * un commentaire et une pièce jointe — tout marqué « SYNTHÉTIQUE — démo ».
 */

const REQUIRED_ENV = ['CONFLUENCE_BASE_URL', 'CONFLUENCE_EMAIL', 'CONFLUENCE_API_TOKEN'] as const;

function missingEnv(): string[] {
  return REQUIRED_ENV.filter((name) => !process.env[name]);
}

async function main(): Promise<void> {
  const missing = missingEnv();
  if (missing.length > 0) {
    console.error(`[demo-space] variables manquantes : ${missing.join(', ')}`);
    console.error('[demo-space] le seed n’est pas encore implémenté (lot « demo-space »).');
    process.exit(1);
  }
  console.error('[demo-space] seed pas encore implémenté — aucune écriture effectuée.');
  process.exit(1);
}

void main();
