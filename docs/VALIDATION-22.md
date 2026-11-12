# Validation §22 — contraintes vérifiées, à confirmer, à prototyper

> Référence : cahier des charges [`CAHIER-DES-CHARGES.md`](CAHIER-DES-CHARGES.md) §22.
> Trois niveaux de confiance, et rien d'autre :
>
> 1. **Vérifié** dans la documentation Forge (relevé du 11 novembre 2026) ;
> 2. **À confirmer** : les noms exacts (modules, scopes, chemins d'API) — tout
>    passe par `forge lint` avant d'être tenu pour vrai ;
> 3. **À valider par un prototype** sur un vrai site, la première semaine
>    (11 – 17 novembre, §28) : ce que la documentation ne tranche pas.
>
> Discipline du dépôt : aucune de ces trois listes n'est décorative — le
> manifeste (`packages/forge-app/manifest.yml`) et les écrans citent ces pages
> tant qu'un point n'a pas changé de colonne.

## 1. Les 9 points à valider par prototype (§22)

| # | Point | Pourquoi | Solution de repli | Statut |
|---|---|---|---|---|
| 1 | Supprimer une version précise d'une page depuis Forge | Fonde l'étape 3 du rituel (purger l'historique) | Demande groupée à l'administrateur (page, numéro de version, empreinte), exposition maintenue élevée, foyer **ouvert** | À valider — prototype semaine 1 |
| 2 | Lire le binaire d'une pièce jointe, et jusqu'à quelle taille | Famille 12 (pièces jointes sensibles) | Nom, extension, taille : déclarées « non lues », angle mort affiché dans la couverture | À valider — prototype semaine 1 |
| 3 | Extraire le texte d'un PDF/DOCX/XLSX dans le bundle Forge | Pièces jointes bureautiques (exports, captures de terminal) | Extensions à risque signalées, sans lecture de contenu | À valider — prototype semaine 1 |
| 4 | État du partage « anyone with the link » lisible par API | Terme d'exposition +10 (§8) | Hypothèse conservatrice, affichée comme telle | À valider — prototype semaine 1 |
| 5 | Realtime : cibler un utilisateur précis sur une page donnée | Bannière à l'auteur juste après publication (§9, étape 4) | Commentaire automatique sur la page + notification | À valider — prototype semaine 1 |
| 6 | Whiteboards et bases Confluence accessibles | Couverture honnête (§6) | Angle mort **déclaré** dans l'écran de couverture — pas silently ignoré | À valider — prototype semaine 1 |
| 7 | `asUser()` en écriture sur une page dont l'utilisateur n'est pas propriétaire | Qui peut caviarder (§9, étape 2) | Caviardage limité aux personnes ayant le droit d'édition | À valider — prototype semaine 1 |
| 8 | Volume réel : 50 000 pages en une passe, temps et coût | Le budget de balayage (§14) | Tranches par espace, priorisation par exposition | À valider — prototype semaine 1 |
| 9 | Résolution des groupes imbriqués pour compter les lecteurs | L'exposition chiffrée (§8) | Fourchette basse/haute assumée (« entre 340 et 1 200 personnes ») | À valider — prototype semaine 1 |

Aucun de ces points ne bloque le démarrage : chacun a son repli, et chaque repli
est un comportement produit assumé (déclaré à l'écran), pas une dégradation
silencieuse. Le prototype de la semaine 1 les fait passer un par un à
« validé » ou bascule le repli en comportement nominal — la colonne Statut est
mise à jour dans cette page, pas dans un coin de tête.

Note annexe : `app.id` n'est pas dans le manifeste tant que `forge create` n'a
pas été exécuté sur l'app réelle — c'est attendu, pas un oubli.

## 2. Vérifié dans la documentation (relevé du 11 novembre 2026)

- **Fonctions** : 25 s en standard ; jusqu'à 900 s quand la fonction n'est
  appelée que par un `consumer` ou un déclencheur planifié ; 55 s pour un web
  trigger, une action ou un agent. Mémoire 512 Mo à 1 Go, `/tmp` 512 Mo éphémère.
- **Payload** : 5 Mo ; depuis une interface custom, requête limitée à 500 Ko.
- **Sorties réseau** : 100 requêtes par minute et par runtime ; limites
  d'invocation 1 200/min par utilisateur, 7 000/min par installation.
- **Déclencheurs planifiés** : 5 au plus par app, **un seul** avec un intervalle
  de 5 minutes. Événements asynchrones possibles pour les traitements longs.
- **LLM hébergé** : Haiku (200K/64K), Sonnet et Opus (1M/128K) ; 100 invites/min
  par installation, 500K jetons/min par modèle, jusqu'à 5 min d'inférence avec
  les événements asynchrones.
- **Stockage** : KVS, Entity Store, SQL, Object Store (Preview) ; facturation à
  la consommation depuis le 1ᵉʳ janvier 2026.
- **Forge Realtime** : disponible sur Jira et Confluence ; événements du backend
  vers le front, multi-onglets et multi-utilisateurs.
- **Rovo** : `rovo:agent` disponible, fenêtre d'exécution courte, soumis au
  contrôle de sécurité d'Atlassian ; `rovo:mcp` et `rovo:skill` en Preview ;
  `rovo:action` = entrées simples.
- **Teamwork Graph** : lecture par GraphQL (requêtes prêtes à l'emploi ou Cypher
  persisté), au nom d'un utilisateur, un droit par type d'objet, droit manquant =
  données omises sans erreur ; parmi les 27 types d'objet : `document`, `space`,
  `project`, `software-service`, `comment`. **L'ingestion dans le graphe interdit
  les données personnelles, de santé, financières ou RH** — d'où le choix de ne
  lire que le graphe, jamais d'y écrire.

## 3. À confirmer (tout passe par `forge lint`)

Vérification en cours au moment de la rédaction — les noms exacts ne sont tenus
pour vrais qu'après `forge lint` sur le manifeste réel :

- **Modules Confluence** : `confluence:globalPage`, `confluence:spaceSettingsPage`,
  `confluence:contentAction`, `confluence:macro` (clés et propriétés attendues,
  `render: native`, ressources).
- **Scopes OAuth** : `read:confluence-content.all`, `write:confluence-content`,
  droits pièces jointes, espaces, restrictions, utilisateurs ; `read:graph:document`,
  `read:graph:project` (un droit par type d'objet) ; droits Jira pour les tickets
  de réparation. Sans `content.styles` (unsafe — l'app n'exécute aucun contenu
  tiers) ni `external.images` (aucun besoin démontré).
- **Chemins d'API v1/v2** : versions de page (historique), commentaires, pièces
  jointes, restrictions et état de partage — y compris les noms d'événements AVI
  des `trigger` (`avi:content:created:page` et consorts).

Tant qu'un nom de cette liste n'est pas confirmé par `forge lint`, il reste
commenté comme « à valider » dans le manifeste et référencé vers cette page.

## Vérifications réelles — 12 novembre 2026 (forge CLI 15.1.0, auth réussie)

Premier passage de `forge lint` et `forge build` avec les vraies clés
(`FORGE_EMAIL` + `FORGE_API_TOKEN`, wrapper `~/bin/forge-atlassian`). Verdicts :

### Confirmé par `forge lint` (0 erreur après correctifs)

- **App enregistrée** : `ari:cloud:ecosystem::app/dc47d23f-e4cd-4681-bb64-14ac02ea1c98`,
  Developer Space « laddition », site cible `one-atlas-cndz.atlassian.net`.
- **Modules Confluence réels** : `confluence:globalPage`, `confluence:spaceSettings`
  (PAS `spaceSettingsPage`), `confluence:contentAction`, `confluence:customContent`.
  **`confluence:macro` n'existe pas** dans le schéma (@forge/manifest) : le
  certificat passe par `customContent` (`supportedContainerTypes: [page]`).
- **Écrans UI Kit** : `{key, title, route?, function}` — ni `render`, ni
  `resource`, ni `resolver` (contraire au patron Jira ; le template officiel
  `confluence-global-page-ui-kit` génère lui-même une forme rejetée par le lint).
- **scheduledTrigger** : `{key, interval, function}` avec `interval` parmi
  `fiveMinute | hour | day | week` (pas de cron). Un seul `fiveMinute` (règle plateforme).
- **Scopes exacts** (source : `@forge/manifest/out/scopes/shipyard-scopes.json`) :
  `read:attachment:confluence`, `read:space:confluence`, `read:space.permission:confluence`,
  `read:content.restriction:confluence`, `read:template:confluence`, `search:confluence`,
  `read:confluence-content.all`, `read:content:confluence`, `read:confluence-user`,
  `write:confluence-content`.
- **Scopes Teamwork Graph exacts** (source : `teamwork-graph-scopes.json`) :
  `read:graph:page:confluence` (le « document » d'une page), `read:graph:project:atlassian`,
  `read:graph:space:confluence`. Les formes `read:graph:document` / `read:graph:project`
  / `read:graph:space` sont INVALIDES.
- `sql` (engine mysql), `llm` (claude), `action`/`rovo:mcp`/`rovo:agent`/`rovo:skill`,
  `trigger` (événements AVI) et `webtrigger` : acceptés sans erreur par le lint.

### Mesuré par `forge build` / `deploy` / `install` — 12 novembre 2026

- Le bundler Forge (webpack + ts-loader) exige un `tsconfig.json` dans le
  dossier de l'app — ajouté (`packages/forge-app/tsconfig.json`, hérite de la
  racine, `noEmit: false` sinon « TypeScript emitted no output »).
- **Webpack ne résout PAS les imports relatifs avec extension `.js` vers les
  fichiers `.ts`** (« Can't resolve './resolver.js' ») — conforme à la contrainte
  mesurée sur tickets-pieges. Corrigé en deux temps : (1) codemod des imports
  sans extension dans `packages/*` (PR #24) ; (2) PR amont `placard` #34
  (fusionnée) pour les quatre paquets réutilisés — aucune copie.
- **`forge build` : ✅ réussi** (tag 437be0da-2f34-48b7-b3eb-d928dc628710) après
  bump du sous-module vers placard `6664cfc`.
- **`forge deploy` : ✅ v2.0.0 déployée sur l'environnement `development`**
  (l'avis d'éligibilité « Runs on Atlassian » est informatif — modules Rovo
  en Preview).
- **`forge install` : ✅ installée sur le site réel** `one-atlas-cndz.atlassian.net`
  (Confluence, environnement development, scopes confirmés) :
  `https://one-atlas-cndz.atlassian.net/wiki/apps/dc47d23f-e4cd-4681-bb64-14ac02ea1c98/f111a00f-824c-499c-8735-eaa68ab44ac5/placard`
- Restent à valider en situation (prototypes de la semaine 1) : purge d'une
  version précise, lecture binaire des pièces jointes, Realtime ciblé,
  `asUser()` en écriture, état de partage via API, groupes imbriqués.

## Chaîne live du 12 novembre 2026 — l'app EN VRAI, sur le site réel

> Ce qui suit est **mesuré**, pas théorique :logs `forge logs -e production`,
> réponses HTTP du webtrigger public, base Forge SQL. Site :
> `one-atlas-cndz.atlassian.net` (site de démo Atlassian, espace `PLACARDDEMO`
> semé de **faux** secrets — 16 pages, 12 commentaires, 12 pièces jointes,
> une page à 2 versions, un modèle).

### 1. Le blocage historique : le schéma SQL n'était jamais créé

Le déclencheur planifié `pw-incremental` échouait toutes les 5 minutes :

```
ERROR ForgeSQLAPIError : Table '…sweep_cursor' doesn't exist
  sql: 'SELECT * FROM sweep_cursor WHERE scope = ? AND mode = ? LIMIT 1'
```

`initSchema()` existait dans `packages/forge-app/src/store/forge-store.ts` mais
**n'était appelée par personne** : la migration était écrite, jamais exécutée.

**Correctif** : `ensureSchema()` — le `migrationRunner` est exécuté **et
attendu** avant chaque lecture et chaque écriture (`CREATE TABLE IF NOT EXISTS`,
passages journalisés dans `__migrations`). Aucune requête ne part avant que les
onze tables du §20 existent.

> Extrait de log après le correctif :
> `INFO [placard] schéma SQL prêt (onze tables du §20 + app_secret).`

### 2. La clé HMAC : stable, générée une fois, jamais affichée

`ctx.hmacKey` (`src/services/ports.ts`) venait de `installationKey()`, dérivée de
l'identifiant d'installation : stable, mais devinable. Elle vient maintenant
d'une résolution en trois temps (`src/runtime/secret.ts`) :

1. **variable statique Forge** (`forge variables set PW_HMAC_KEY …`, chiffrée) ;
2. **table technique `app_secret`** du store SQL : la clé y est générée **une
   fois** puis relue à chaque invocation (c'est le chemin mesuré en
   production — la variable statique n'est pas exposée au runtime par
   `process.env.FORGE_VARIABLES`) ;
3. **repli** dérivé de l'identifiant d'installation, signalé dans le journal.

Le journal ne dit que la **source**, jamais la valeur :

```
INFO [placard] clé HMAC : source=sql-app_secret (valeur jamais journalisée).
```

### 3. Ce qui marche en vrai

| Chaîne | État | Preuve |
|---|---|---|
| Migration SQL (11 tables + `app_secret`) | ✅ | log « schéma SQL prêt » |
| Clé HMAC stable entre invocations | ✅ | source `sql-app_secret`, même clé d'une passe à l'autre |
| Balayage **réel** de `PLACARDDEMO` | ✅ | 16 pages lues, **24 foyers** détectés, **40 emplacements**, ~29 s |
| Détection dans les 9 familles vues | ✅ | `bank-data`, `cloud-key`, `connection-string`, `credential-table`, `identity`, `platform-token`, `private-key`, `signed-token`, `suspicious-string` |
| Scores et termes appliqués | ✅ | score 60–70 sur les foyers, termes avec libellé, méthode et preuve |
| Webtrigger public `pw-public-demo` | ✅ | HTTP 200 + JSON (voir §5) |
| CORS (`*`, `OPTIONS` géré) | ✅ | en-têtes `access-control-allow-origin: *` sur la réponse |

### 4. Ce qui a dû être corrigé en cours de route (pièges mesurés)

- **CQL incrémental sans filtre de type** : la recherche ramène aussi les
  **pièces jointes** (1 276 sur ce site). La passe les traitait comme des
  pages, chaque lecture échouait, et le balayage ne trouvait rien. Correction :
  `type = page` ajouté au CQL incrémental (`src/services/sweep.ts`).
- **Réponse `@forge/llm` en blocs** : `content: [{ type: 'text', text }]`, pas
  une chaîne — `String(...)` donnait `[object Object]` et tout verdict
  devenait « non exploitable » (`src/runtime/context.ts`).
- **Événement du consumer** : c'est un `AsyncEvent` `{ body, … }`, pas
  `{ payload }` — la tranche revenait toujours en mode `incremental` sur
  `site` (`src/consumer.ts`).
- **En-têtes d'une réponse dynamique** : `{ [clé]: string[] }`, pas une chaîne
  seule. Une chaîne seule fait échouer la sérialisation : la plateforme
  répond **424 « Failed Dependency »** *sans journal d'erreur*. C'est ce qui
  rendait le webtrigger muet (les deux webtriggers, y compris celui de
  `origin/main`, étaient concernés).
- **401 sur tous les points d'accès directs de contenu** : avec l'identité de
  l'app (`asApp`), seul le point d'accès de **recherche** répond 200 :

  ```
  200  /wiki/rest/api/content/search?cql=id%3D…&expand=body.storage,version
  401  /wiki/rest/api/content/{id}                  (v1)
  401  /wiki/rest/api/content/{id}/child/comment
  401  /wiki/rest/api/content/{id}/child/attachment
  401  /wiki/api/v2/pages/{id}                      (v2)
  200  /wiki/rest/api/content/{id}/restriction
  ```

  La page (corps, titre, version, étiquettes) est donc lue **par la
  recherche** (`src/runtime/confluence.ts`), et les gîtes hors de portée sont
  lus **un par un** : chaque gîte inaccessible est **déclaré** en angle mort,
  il ne fait pas perdre la page entière (`src/services/scan-page.ts`).

### 5. L'URL du webtrigger public et un exemple de réponse

URL (`forge webtrigger create -f pw-public-demo -e production`) :

```
https://268bea73-73bf-4b1e-a3e7-862161c6298a.webtrigger.atlassian.app/public/U3iRFUXiNU509Lv_sk5n7382zbI
```

`GET` (réponse tronquée) :

```json
{
  "generatedAt": "2026-11-12T15:14:02.318Z",
  "mode": "live",
  "site": {
    "name": "one-atlas-cndz.atlassian.net",
    "url": "https://one-atlas-cndz.atlassian.net/wiki",
    "spaces": [{ "key": "PLACARDDEMO", "fr": "PLACARDDEMO", "en": "PLACARDDEMO" }],
    "titles": { "3964930": "Tableau d'identifiants — staging (SYNTHÉTIQUE)" }
  },
  "registry": [
    {
      "foyerId": "foyer-hmac256:bf6bad33",
      "family": "cloud-key",
      "maskedPreview": "AKIA…(20)",
      "score": 70,
      "state": "open",
      "spaceKey": "PLACARDDEMO",
      "pageId": "3964930",
      "locationCount": 2,
      "inCurrentVersion": true,
      "inHistory": false,
      "readersLow": 0,
      "readersHigh": 0,
      "sharing": "space-default",
      "aiSurface": true
    }
  ],
  "foyers": { "foyer-hmac256:7e9c6c70": { "family": "bank-data", "score": 60, "…": "…" } },
  "budget": { "day": "2026-11-12", "pagesScanned": 232, "llmCalls": 16, "…": "…" },
  "coverage": { "perGite": [{ "gite": "corps-de-page", "scanned": 232, "skipped": 0 }], "…": "…" },
  "certificate": { "scope": "site", "open": 24, "…": "…" }
}
```

Les **formes** sont celles des données embarquées du site public
(`site/src/data/demo.ts` et `demo-site.ts`) : `registry` = `REGISTRY_ROWS`,
`building` = `BUILDING`, `foyers` = `FOYERS` (indexé par identifiant),
`budget` = `BUDGET`, `coverage` = `COVERAGE`, `certificate` = `CERTIFICATE` —
les deux sources sont donc interchangeables côté site.

**Aucune valeur brute** : les aperçus sont masqués (`AKIA…(20)`), les
empreintes sont des HMAC, et les **titres de page sont masqués eux aussi**
(l'espace de démonstration place des faux secrets dans les titres — mesuré le
12 novembre 2026 ; les valeurs brutes ont été retirées de la charge utile).

### 6. Ce qui reste à faire (honnêteté)

- **Gîtes hors de portée pour l'identité de l'app** : commentaires, pièces
  jointes, historique de versions renvoient 401. Ils sont déclarés en angles
  morts à chaque passe. Les 24 foyers détectés viennent donc du gîte
  « corps de page » seul ; un contexte **utilisateur** (`asUser`) les rendrait
  lisibles — à prototyper (§22).
- **La file `pw-sweep-queue` ne répond pas** : `Queue.push` renvoie 400 Bad
  Request en production, la chaîne de tranches ne s'enchaîne donc pas. La
  passe planifiée et la passe **en ligne** du webtrigger (`?sweep=1`, bornée à
  25 pages) couvrent le besoin ; le point d'accès de la file reste à
  corriger (probablement le module `consumer` à redéclarer).
- **Passe complète du site** : le site de démo compte ~3 100 pages ; une passe
  complète dépasse le budget d'appels réseau d'une fonction. La validation porte
  donc sur l'espace `PLACARDDEMO` (16 pages), pas sur le site entier.
- **Exposition** : `readersLow`/`readersHigh` valent 0 et le partage est
  présumé `space-default` : les permissions d'espace ne sont pas lisibles par
  l'app non plus. C'est **déclaré** (`missingRights`), pas masqué.
- **`/wiki/api/v2/spaces/{clé}`** répond 400 (l'API v2 attend un identifiant
  numérique, pas une clé) : la description d'espace est donc absente.
- Les points §22 non encore traités (purge d'une version, Realtime ciblé,
  `asUser()` en écriture, groupes imbriqués) restent ouverts.
