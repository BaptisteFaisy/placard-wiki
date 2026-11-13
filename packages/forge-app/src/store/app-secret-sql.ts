/**
 * DDL de la table technique de l'app : elle ne porte aucune donnée métier du
 * §20 (aucun secret, aucune empreinte) — uniquement le secret applicatif
 * persisté une fois (la clé HMAC, voir `runtime/secret.ts`).
 */
export const APP_SECRET_DDL = `CREATE TABLE IF NOT EXISTS app_secret (
  name TEXT,
  value TEXT,
  created_at TEXT
)`;
