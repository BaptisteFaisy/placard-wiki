// Empreinte HMAC-SHA-256 via WebCrypto — SHIM navigateur.
//
// Écart documenté (règle du dépôt) : `@placard/core.computeFingerprint`
// (utilisé par `@placard-wiki/detectors`) repose sur `node:crypto` et n'est
// donc pas importable côté navigateur. Ce fichier réimplémente la même
// discipline — HMAC-SHA-256 hexadécimal d'une valeur, avec une clé — via
// l'API WebCrypto (`crypto.subtle`), disponible dans tous les navigateurs
// modernes et dans Node >= 19.
//
// Différence assumée : la clé de démo est publique (site statique, aucune
// donnée réelle) ; dans l'app Forge, la clé d'installation est secrète et
// l'empreinte n'est jamais réversible vers la valeur.

/** Clé de démonstration — publique, comme tout le reste du site (§15). */
export const DEMO_HMAC_KEY = 'placard-wiki-demo-public-key';

/** Encode une chaîne en octets UTF-8 (copie dans un ArrayBuffer frais, type WebCrypto). */
function bytes(value: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new TextEncoder().encode(value));
}

/** Octets → hexadécimal minuscule (empreinte de 64 caractères). */
export function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Empreinte HMAC-SHA-256 (hex) d'une valeur — même contrat de sortie que
 * `computeFingerprint` du paquet Git : 64 caractères hexadécimaux, aucun
 * moyen de retrouver la valeur sans la clé.
 */
export async function hmacFingerprint(
  value: string,
  key: string = DEMO_HMAC_KEY,
): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    bytes(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, bytes(value));
  return toHex(signature);
}
