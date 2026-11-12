# `@placard-wiki/surfaces` — la même empreinte, sur plusieurs surfaces

Ce paquet porte la **vision multi-surfaces** du Placard du wiki : un même
secret repéré dans un dépôt Git, dans Confluence et dans Jira doit porter **la
même empreinte**, pour qu'on puisse dire « ce secret a fui là, là et là »
(cahier §4 « Propagation », §30, PW-31).

Aucune valeur brute, jamais : une observation porte une empreinte HMAC, un
identifiant d'emplacement et une étiquette lisible — rien qui permette de
reconstruire le secret (§23).

---

## 1. Le namespace d'empreinte — opt-in

### Par défaut : clé propre à l'installation

L'empreinte d'une valeur est `HMAC-SHA-256(clé de l'installation, valeur)`.
La clé de l'installation vient de la variable statique Forge `PW_HMAC_KEY`,
d'une table technique `app_secret`, ou d'un repli dérivé de l'identifiant
d'installation (`packages/forge-app/src/runtime/secret.ts`).

> Deux installations sur le même site ont donc des empreintes **non
> comparables** — c'est voulu, et c'est ce que dit le cahier (§4).

### Activer le partage : deux variables, des deux côtés

L'administrateur pose :

| Variable | Rôle | Secret ? |
|---|---|---|
| `PW_FINGERPRINT_NAMESPACE_KEY` | la clé HMAC partagée | **oui** — jamais journalisée, jamais exposée par un webtrigger |
| `PW_FINGERPRINT_NAMESPACE` | l'identifiant du namespace (ex. `atlassian:acme`) | non — c'est une donnée publique |

La **clé HMAC effective** n'est pas la clé partagée : c'est

```
clé effective = HMAC-SHA-256(clé partagée, identifiant du namespace)
```

Deux installations qui partagent la clé **et** l'identifiant produisent donc
la même clé effective, donc la même empreinte pour le même secret. Deux
namespaces différents ne se comparent pas, même quand la clé partagée est la
même — et le produit le dit au lieu de laisser croire à une absence.

Si la clé est posée **sans** identifiant, le partage reste désactivé et
l'installation le dit dans son journal (aucune devinette à la place de
l'administrateur).

---

## 2. Le lien avec le dépôt Git (`placard`)

Le moteur Git calcule ses empreintes de la même façon :
`computeFingerprint(valeur, sel)` dans
`vendor/placard/packages/core/src/redact.ts`, où le sel est aujourd'hui
**propre au dépôt** — dérivé du premier commit par `repoSalt()` dans
`vendor/placard/packages/cli/src/salt.ts`. Les contrôles de validité des
valeurs (`vendor/placard/packages/core/src/checksums.ts`) sont partagés par
les deux côtés.

Pour que les deux empreintes coïncident, l'administrateur pose **la même clé
et le même namespace des deux côtés** :

1. **côté wiki** — `PW_FINGERPRINT_NAMESPACE_KEY` + `PW_FINGERPRINT_NAMESPACE` ;
2. **côté Git** — la clé HMAC du dépôt doit être la même clé dérivée, c'est-à-dire
   `deriveNamespaceKey(clé partagée, identifiant)`, la fonction exportée par ce
   paquet.

⚠ **Limite explicite** : le sous-module `vendor/placard` est épinglé et **non
modifié** ici. Son sel par défaut reste propre au dépôt ; le passage à la clé
partagée côté Git suppose une évolution du CLI `placard` (`repoSalt`), qui
n'appartient pas à ce dépôt. Tant que ce n'est pas fait, le registre
multi-surfaces accueille bien les observations Git, mais les empreintes des
deux côtés ne se croiseront pas — et l'outil `trace-fingerprint` le dira
explicitement au lieu de prétendre que le secret n'a pas fui.

---

## 3. Le registre multi-surfaces

### Le port

```ts
interface SurfaceRegistry {
  record(seen: SurfaceSeen): Promise<void>;
  listByFingerprint(fingerprint: string): Promise<SurfaceSeen[]>;
  listByFoyer(foyerId: string): Promise<SurfaceSeen[]>;
}
```

- **port** : `src/registry.ts` ;
- **adaptateur SQL Forge** : table `surface_seen`
  (`fingerprint`, `surface`, `external_id`, `label`, `namespace_id`,
  `foyer_id`, `state`, `method`, `source`, `first_seen_at`, `last_seen_at`) —
  `packages/forge-app/src/store/forge-store.ts` ;
- **implémentation mémoire** : `createMemorySurfaceRegistry()` — pour les
  tests et le mode hors-ligne.

### L'observation

```ts
interface SurfaceSeen {
  fingerprint: string;   // l'empreinte HMAC — jamais la valeur
  surface: 'confluence' | 'git' | 'jira' | 'ticket' | 'autre';
  externalId: string;    // l'emplacement chez la surface (« repo:fichier », « SEC-1 »)
  label: string;         // étiquette lisible (un chemin, un titre)
  namespaceId: string;   // le namespace sous lequel l'empreinte a été calculée
  foyerId?: string;      // le foyer wiki correspondant, quand il existe
  state: 'detecte' | 'confirme' | 'traite' | 'ignore';
  method: string;        // comment l'observation a été obtenue
  source: string;        // d'où viennent les données (« git-cli », « jira-api »…)
  firstSeenAt: string;
  lastSeenAt: string;
}
```

Le couple (surface, externalId) dit « le même endroit » : c'est ce qui permet
de distinguer « le même emplacement vu sous deux namespaces différents » d'un
tout autre secret.

---

## 4. La correspondance — « le même secret, deux surfaces »

```ts
matchAcrossSurfaces(fingerprint, surfaces, { namespaceId })
```

Fonction **pure** : elle ne lit rien, elle n'écrit rien.

| Situation | Résultat |
|---|---|
| même empreinte sur plusieurs surfaces | `matched` non vide, `comparable: true`, le message dit où |
| empreintes différentes | `matched` vide, `comparable: false`, aucune correspondance |
| namespaces différents | `matched` vide, `comparable: false`, et le message **dit** que la comparaison exige la même clé partagée des deux côtés |

Le résultat porte `divergent` : les surfaces connues qui ne portent pas
l'empreinte cherchée, avec la raison (`namespace-différent` ou
`empreinte-différente`).

---

## 5. L'outil MCP `trace-fingerprint`

L'outil rend les emplacements **du site** et les **surfaces externes** connues
pour cette empreinte, avec la méthode et la source de chaque observation :

```json
{
  "fingerprint": "hmac256:…",
  "locations": [ … emplacements Confluence … ],
  "surfaces": [
    { "surface": "Git", "externalId": "placard:config/env", "state": "detecte",
      "method": "scan-local", "source": "git-cli", "lastSeenAt": "…" }
  ],
  "comparison": { "comparable": true, "namespaces": ["atlassian:acme"], "message": "…" }
}
```

Jamais de valeur brute : uniquement des empreintes, des identifiants et des
étiquettes lisibles.
