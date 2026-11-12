# API live — contrat public

Le webtrigger Forge `pw-public-demo` sert, en JSON, la **chaîne live** du
Placard du wiki : les données réellement balayées sur le site de démonstration
(`one-atlas-cndz.atlassian.net`, espace `PLACARDDEMO`). Ce document est le
**contrat public** de cette API : ce qui est stable, ce qui peut évoluer, et
comment un tiers la consomme.

- **Version du contrat : `1.1.0`**
- **Schéma qui fait foi : [`api-live.schema.json`](./api-live.schema.json)**
  (JSON Schema, draft 2020-12).
- **En-tête de version : `X-Placard-Contract: 1.1.0`** sur chaque réponse.

```
GET https://268bea73-73bf-4b1e-a3e7-862161c6298a.webtrigger.atlassian.app/public/U3iRFUXiNU509Lv_sk5n7382zbI
```

## Ce qui est stable (garanti pour toute la série 1.x)

- La forme d'ensemble : `generatedAt`, `mode: "live"`, `site`, `registry`,
  `building`, `foyers`, `budget`, `coverage`, `certificate` — les neuf clés
  de premier niveau sont **obligatoires**, aucune clé supplémentaire n'est
  émise sans être décrite dans le schéma.
- Les énumérations : les onze familles de détection, les huit états de foyer,
  les sept gîtes, les types de conteneur, les champs de contenu, les états
  d'emplacement, les états de partage et les méthodes de propriétaire.
- Les formats : `hmac256:` + 32 hexadécimaux pour l'empreinte d'un foyer,
  `hmac256:` + 64 pour l'empreinte d'un certificat, `cert:` + 16 pour
  l'identifiant d'un certificat, dates ISO 8601 (`date-time`), jours ISO
  (`date`).
- **L'engagement du contrat : aucune valeur brute.** Ni le secret, ni un
  extrait de contexte, ni une valeur qui s'en approche. Seules des empreintes
  HMAC, des aperçus masqués (`AKIA…(20)`, `sk-p…(48)`), des scores et leurs
  termes sont publiés. C'est une promesse opposable, pas une habitude.

## Ce qui peut évoluer (et comment)

| Évolution | Niveau de version |
| --- | --- |
| Ajout d'un **champ optionnel** (clé décrite comme non obligatoire) | `mineure` |
| Ajout d'une **valeur d'énumération** (nouvelle famille, nouvel état) | `mineure` |
| Texte des angles morts, des libellés, des notes d'honnêteté | sans rupture |
| Suppression, renommage ou changement de type d'une clé | `majeure` |

Les clés optionnelles de diagnostic `refresh` (`?sweep=1`), `queued`
(`?queue=<ESPACE>`) et `probe` (`?probe=1`) sont décrites dans le schéma mais
peuvent être absentes : un consommateur ne doit jamais compter sur leur
présence.

## Changelog

- **1.1.0** (2026-11-12) — la couverture enrichie fait partie du contrat :
  pourcentage, méthode, gîtes couverts et détail gîte par gîte (pages lues,
  illisibles, refusées, état).
- **1.0.0** (2026-11-12) — contrat initial : charge utile exacte du
  webtrigger, figée dans `api-live.schema.json`, versionnée par
  `X-Placard-Contract`.

## Consommer l'API

```bash
curl -i 'https://268bea73-73bf-4b1e-a3e7-862161c6298a.webtrigger.atlassian.app/public/U3iRFUXiNU509Lv_sk5n7382zbI'
```

```
HTTP/2 200
content-type: application/json
x-placard-contract: 1.1.0
access-control-allow-origin: *
```

La réponse est longue (~64 Ko pour 24 foyers) ; en voici un **extrait
tronqué** — les valeurs sont déjà masquées par le producteur, jamais chez le
consommateur :

```json
{
  "generatedAt": "2026-11-12T16:21:47.041Z",
  "mode": "live",
  "site": {
    "name": "one-atlas-cndz.atlassian.net",
    "url": "https://one-atlas-cndz.atlassian.net/wiki",
    "spaces": [{ "key": "PLACARDDEMO", "fr": "PLACARDDEMO", "en": "PLACARDDEMO" }],
    "titles": { "3932169": "accès staging (mdp: sk-p…(48)) [SYNTHÉTIQUE]" }
  },
  "registry": [
    {
      "foyerId": "foyer-hmac256:bf6bad33",
      "family": "cloud-key",
      "maskedPreview": "AKIA…(20)",
      "score": 70,
      "state": "open",
      "spaceKey": "PLACARDDEMO",
      "pageTitle": "Tableau d'identifiants — staging (SYNTHÉTIQUE)",
      "pageId": "3964930",
      "locationCount": 2,
      "inCurrentVersion": true,
      "inHistory": false,
      "readersLow": 0,
      "readersHigh": 0,
      "sharing": "space-default",
      "aiSurface": true,
      "lastSeenAt": "2026-11-12T15:17:29.370Z"
    }
  ],
  "foyers": {
    "foyer-hmac256:09360132": {
      "id": "foyer-hmac256:09360132",
      "fingerprint": "hmac256:09360132fe34a06768d051fe0166b307",
      "family": "platform-token",
      "score": 65,
      "state": "open",
      "locations": [
        { "pageId": "3932169", "containerType": "page", "field": "body",
          "maskedPreview": "sk-p…(48)", "status": "present", "gite": "corps-de-page" }
      ]
    }
  },
  "budget": { "day": "2026-11-12", "pagesScanned": 264, "tokens": 0, "costEstimate": 0 },
  "certificate": {
    "id": "cert:15ad2d0df1596e7a",
    "scope": "site",
    "issuedAt": "2026-11-12T16:21:46.520Z",
    "open": 24,
    "residualExposure": "24 foyer(s) encore exposé(s)",
    "contentHash": "hmac256:15ad2d0df1596e7a804a0a539362469c98baa766b766b47f69ecd354348e8285"
  }
}
```

*(extraits : plusieurs champs et emplacements sont retirés — `…` — le schéma
décrit leur totalité ; `fingerprint` et `contentHash` ci-dessus sont tronqués.)*

## Ce que fait le site public

Le site (`site/src/lib/contract.ts`) valide **chaque** réponse contre ce même
schéma, puis compare l'en-tête `X-Placard-Contract` à la version attendue.
Si la réponse ne correspond plus au contrat, le site n'affiche **jamais** de
données incohérentes : il bascule sur son jeu embarqué (SNAPSHOT) et affiche
la raison. C'est la même garantie, des deux côtés du fil.
