# Architecture — Placard du wiki (*Placard for Confluence*)

> Références : cahier des charges [`CAHIER-DES-CHARGES.md`](CAHIER-DES-CHARGES.md),
> en particulier §19 (architecture Forge), §20 (modèle de données), §21 (réemploi
> de `placard`), §22 (contraintes vérifiées et points à valider) et §23 (exigences
> non fonctionnelles).
>
> État au moment de la rédaction : le socle est en place (domaine partagé testé,
> squelettes de paquets, manifeste Forge, CI 5 min). Les paquets fonctionnels
> sont des squelettes annoncés comme tels (`PACKAGE_STATUS = 'skeleton'`) ;
> chaque lot les implémente (voir [`RECETTE-25.md`](RECETTE-25.md)).

## 1. Carte du monorepo

Monorepo pnpm, une seule implémentation par logique (règle de la maison, §21).

```
placard-wiki/
├── README.md                     # vue d'ensemble, tableau des paquets
├── CONTRIBUTING.md               # règles du dépôt (tailles, secrets, CI)
├── packages/
│   ├── domain/                   # ✔ implémenté et testé (socle)
│   │   └── src/
│   │       ├── vocabulary.ts     # vocabulaire produit (§4) : gîtes, familles, états
│   │       ├── types.ts          # Foyer, emplacements, exposition, rituel, certificat (§20)
│   │       ├── score-terms.ts    # termes du score de danger (§8), appliqués et affichés
│   │       ├── sql.ts            # schéma Forge SQL (§20), WIKI_SCHEMA_VERSION
│   │       └── bridge.ts         # contrat UI ↔ résolveur (§6 ci-dessous)
│   ├── wiki-source/              # squelette — lecteurs Confluence : les sept gîtes (§6),
│   │                             #   CQL, pagination par curseur, partage et restrictions
│   ├── detectors/                # squelette — familles wiki 10 à 12 (§7) + pipeline de scan
│   ├── exposure/                 # squelette — lecteurs potentiels, partage, surface IA,
│   │                             #   score de danger et ses termes (§8)
│   ├── propagation/              # squelette — une empreinte → un foyer, N emplacements ;
│   │                             #   datation ; le modèle d'abord (§11)
│   ├── ritual/                   # squelette — tourner, caviarder, purger, empêcher,
│   │                             #   vérifier ; attestation, sceau, certificat (§9)
│   ├── forge-app/                # l'app Forge : manifest.yml, résolveur, déclencheurs,
│   │   ├── manifest.yml          #   consumer, scheduledTriggers, webtrigger, sql, llm,
│   │   ├── src/                  #   13 actions MCP, rovo:agent, rovo:mcp, rovo:skill, écrans
│   │   └── skills/before-sharing-a-page/SKILL.md   # skill ouvert pour agents (§17)
│   └── demo-space/               # squelette — espace de démonstration semé par script,
│                                 #   la démo ET l'oracle de test (§15, PW-20)
├── vendor/placard/               # sous-module Git épinglé (§5 ci-dessous) — JAMAIS copié
├── tools/
│   ├── check_limits.py           # couche 0 : fichiers < 500 lignes, fonctions < 50 lignes
│   │                             #   (suffixes .ts/.tsx/.js/.mjs/.py — les .md ne sont pas concernés)
│   ├── validate_manifest.mjs     # cohérence manifest.yml ↔ exports de forge-app
│   ├── test_triage.py, triage_test.py, replay.mjs   # outils de recette
└── .github/                      # socle CI : verdict en 5 minutes maximum par job
```

Dépendances entre paquets (une seule direction, pas de cycle) :

```
wiki-source ──► detectors ──► propagation ──► exposure ──► ritual
      (tous consomment les types et le vocabulaire de domain)
forge-app ──► tout ce qui précède ; demo-space ──► wiki-source + detectors (fixtures)
```

## 2. Les cinq chaînes de traitement (§19)

| Chaîne | Qui l'exécute | Ce qu'elle produit |
|---|---|---|
| **Détection à la publication** | `trigger` (contenu créé / mis à jour / commenté) + Forge Realtime | Bannière à l'auteur qui est encore sur la page, foyer ouvert |
| **Balayage incrémental** | `scheduledTrigger` à 5 min (le seul autorisé à cet intervalle), CQL `lastModified >= <dernier balayage>` | Foyers des pages modifiées, curseur de reprise |
| **Balayage complet** | `scheduledTrigger` hebdomadaire + `consumer` (jusqu'à 900 s, par tranches) | Couverture par espace, budget consommé |
| **Exposition** | L'app, en arrière-plan | Lecteurs potentiels (fourchette + méthode), partage, surface IA, par page |
| **Rituel** | Une personne, depuis l'écran | Attestations, diffs de caviardage, sceaux de cire, certificat |

## 3. Contraintes de la plateforme (§19, §22)

Ce que Forge impose, et la conséquence produit :

| Contrainte | Valeur vérifiée | Conséquence pour l'app |
|---|---|---|
| Durée d'une fonction interactive | **25 s** en standard ; 55 s pour un web trigger, une action ou un agent | L'encart de page et le registre répondent depuis le cache de détection (< 2 s) ; rien de long dans le chemin interactif |
| Durée d'une fonction non interactive | jusqu'à **900 s** quand elle n'est appelée que par un `consumer` ou un `scheduledTrigger` | Le balayage long passe par `consumer` / déclencheur planifié, par tranches avec curseur (`sweep_cursor`, §20) |
| Payload | **5 Mo** ; 500 Ko depuis une interface custom | Les pièces jointes volumineuses sont listées et déclarées « non lues, et pourquoi » — jamais transportées entières |
| Sorties réseau | **100 requêtes par minute** et par runtime | Le balayage est cadencé ; les appels Confluence sont paginés et bornés par tranche |
| Déclencheurs planifiés | **5 au plus** par app, **un seul à 5 minutes** | L'incrémental prend le seul créneau de 5 min ; la passe complète est hebdomadaire |
| Modèle de l'oracle | **relais InferHub** (`combo/cheap`, jeton de service, la clé ne quitte pas la machine qui la porte) ; repli sur le LLM hébergé Forge si le relais ne répond pas | LLM sur les **seuls candidats ambigus** (familles 9 et 11), cache par empreinte de contenu — jamais le texte brut d'un secret dans une invite (§23) |
| Modules Rovo | `rovo:mcp` et `rovo:skill` en **Preview** ; `rovo:agent` à fenêtre d'exécution courte | Les outils MCP sont des lectures bornées (`limit`, curseurs) ; aucune passe longue derrière un outil |
| Teamwork Graph | Lecture GraphQL **au nom d'un utilisateur connecté** ; un droit manquant ne provoque pas d'erreur mais **vide le résultat** | L'écran de couverture distingue « pas de droit » de « pas de données » (recette 18) ; l'app ne fournit jamais de connecteur et n'ingère rien dans le graphe (§12) |

Le manifeste (`packages/forge-app/manifest.yml`) est une esquisse : noms de
modules, scopes OAuth et chemins d'API v1/v2 passent par `forge lint` et le
prototype de la semaine 1 avant d'être tenus pour vrais — voir
[`VALIDATION-22.md`](VALIDATION-22.md).

**La jambe modèle de l'app (l'oracle).** Forge n'accepte, pour sortir vers un
fournisseur, que l'authentification `oauth2` — une clé statique `sk-…` comme
celle d'InferHub n'y a pas de place. L'oracle passe donc par un **relais**
(`r630`, `~/.config/placard-relay.env`, exposé en HTTPS via `tailscale funnel`),
qui garde la clé InferHub et rend l'appel en format compatible OpenAI. L'app
Forge ne parle qu'au relais (`permissions.external.fetch.backend`, un seul hôte)
avec un jeton de service (variable Forge `PLACARD_RELAY_TOKEN`, hors du dépôt) ;
si le relais est absent ou ne répond pas, elle retombe sur le LLM hébergé, sans
jamais cacher le repli. La garde `network-guard.test.ts` verrouille l'hôte
autorisé et le module du relais.

## 4. Flux : détection → foyer → exposition → rituel → certificat

```
 wiki-source                detectors                  propagation
┌───────────────┐   motifs  ┌────────────────┐  empreintes ┌──────────────────┐
│ les 7 gîtes :  │─────────►│ 9 familles      │───────────►│ une empreinte =   │
│ page, version, │          │ réemployées de  │            │ UN foyer,         │
│ commentaire,   │          │ placard (Git) + │            │ N emplacements ;  │
│ pièce jointe,  │          │ 3 familles wiki │            │ datation ;        │
│ modèle, titre, │          │ + LLM sur les   │            │ le modèle d'abord │
│ description    │          │ ambigus seulement│           └────────┬─────────┘
└───────────────┘           └────────────────┘                     │
                                                                   ▼
   certificat                 ritual                        exposure
┌──────────────────┐  sceau  ┌────────────────────────┐   ┌──────────────────┐
│ page datée,      │◄────────│ 1. tourner (attestation │◄──│ lecteurs (four-  │
│ chiffrée :       │         │    humaine, verrou)     │   │ chette + méthode),│
│ ouverts, tournés,│         │ 2. caviarder (diff,     │   │ partage public,  │
│ caviardés, purgés│         │    asUser(), verrouillé)│   │ restrictions,    │
│ exposition       │         │ 3. purger (ou le dire : │   │ surface IA ;     │
│ résiduelle,      │         │    demande à l'admin)   │   │ score 0-100 avec │
│ angles morts     │         │ 4. empêcher (Realtime + │   │ TOUS ses termes  │
└──────────────────┘         │    skill des agents)    │   └──────────────────┘
                             │ 5. vérifier (rescan)    │
                             └────────────────────────┘
```

- **Détection.** `wiki-source` ramène le contenu des sept gîtes (§6) — y compris
  l'historique de versions, le point aveugle des autres scanners. `detectors`
  applique les douze familles (§7) ; le LLM hébergé ne voit que les candidats
  ambigus, avec cache par empreinte de contenu.
- **Foyer.** `propagation` regroupe : la même empreinte dans six pages, deux
  commentaires, une pièce jointe et un modèle fait **un** foyer de dix
  emplacements (§11). La rotation est unique, le caviardage est proposé en lot,
  et **le modèle est traité en premier**, sinon il recopie le secret dans les
  pages créées ensuite.
- **Exposition.** `exposure` chiffre qui peut lire × depuis quand × quelle
  surface, dont la surface IA (§8, §13). Chaque terme appliqué au score est
  affiché ; l'hypothèse « page lisible par Rovo = page indexée » est affichée
  comme hypothèse conservatrice tant que l'index n'est pas interrogeable (§22).
- **Rituel.** `ritual` déroule les cinq étapes dans l'ordre, avec verrous (§9) :
  l'étape 2 est bloquée tant que la rotation n'a pas été attestée **par une
  personne** ; la purge d'historique, quand l'API ne la permet pas, produit une
  demande groupée à l'administrateur et le foyer **reste ouvert** — dire « on ne
  peut pas » fait partie du produit.
- **Certificat.** Le sceau de cire exige rotation attestée **et** caviardage fait
  **et** purge vérifiée ou impossibilité documentée ; le certificat (§9, §20)
  chiffre tout, y compris les angles morts déclarés.

## 5. Réemploi de `placard` : sous-module épinglé, jamais de copie (§21)

`placard` (Git, Kiroween) contient déjà, écrit et testé, le moteur de détection,
le score explicable et la discipline « zéro secret dans les sorties ». Réemploi :

| Paquet de `placard` | Réemploi ici |
|---|---|
| `packages/detectors` | Les 9 familles, contrôles mod-97 et Luhn, filtre d'entropie |
| `packages/analysis` | Le score explicable et l'affichage de ses termes |
| `packages/core` | Empreinte HMAC, aperçu masqué, valeurs factices de test |
| `packages/ritual` | La séquence et son verrouillage (rotation avant purge) |
| `packages/demo-repo` | Le principe du dépôt synthétique → adapté en espace synthétique (`demo-space`) |

**Aujourd'hui.** Il n'existe pas de compte npm pour publier ces paquets : le
réemploi passe par le **sous-module Git épinglé** `vendor/placard` (commit
figé, `git submodule status` fait foi). Épingler garantit la reproductibilité :
une passe de `placard` ne change jamais sous les pieds de `placard-wiki`.

**Forme cible (§21).** Publier `@placard/detectors`, `@placard/analysis` et
`@placard/core` depuis le dépôt `placard` et les consommer ici en dépendances
npm. Le jour où un registre est disponible, le sous-module est retiré sans
changement de code consommateur : les imports passent déjà par les noms cibles.

**Jamais de copie.** Recopier un détecteur ou le calcul de score dans ce dépôt
est interdit — c'est la règle « une seule implémentation par logique », gardée
en revue.

## 6. Le contrat bridge (`packages/domain/src/bridge.ts`)

Une seule définition de ce que les écrans appellent et de ce qu'ils reçoivent :
l'UI Forge (React, `render: native`) et le résolveur (`index.resolver`) se
conforment au même contrat typé, jamais de noms de méthodes en double côté
consommateur.

- `BridgeRequests` / `BridgeResults` : charge utile et résultat **par méthode**
  (`registry/list`, `finding/get`, `ritual/attest`, `ritual/redaction-preview`,
  `ritual/redaction-apply`, `ritual/purge-request`, `sweep/start`, `budget/get`,
  `coverage/get`, `adoption/list`, `settings/*`, `certificate/*`, `building/get`,
  `exposure/get`…).
- `BRIDGE_METHODS` : la liste exhaustive des méthodes, exportée pour validation
  croisée UI ↔ résolveur (une méthode affichée mais non implémentée est une
  erreur de type, pas une surprise d'exécution).
- Types de retour du domaine : `RegistryRow` (une ligne du registre =
  l'information exacte du bâtiment, PW-15), `RedactionDiff` (**masqué** : le
  contexte est montré, la valeur jamais), `CoverageReport` (angles morts et
  droits manquants déclarés, distincts), `BuildingModel` (le bâtiment en
  données, §10), `SpaceSettings` (réglages par espace, PW-24, dont `demoMode`).
- Règle du contrat : **aucune méthode ne transporte de valeur brute de secret** —
  ni en entrée, ni en sortie. `ritual/attest` porte `actorKind: 'human' | 'agent'`
  parce qu'une attestation d'agent est refusée (§17).

## 7. « Zéro secret persisté » (§23)

L'exigence traverse toute l'architecture, pas un module dédié :

- **Aucune valeur brute hors de la mémoire d'une exécution** : ni Forge SQL
  (aucune table du §20 ne contient de valeur, de texte de page ni de pièce
  jointe), ni journaux, ni invites au LLM, ni sorties MCP, ni certificat,
  ni export.
- Le seul lien persisté avec un secret est son **empreinte** HMAC-SHA-256 (clé
  propre à l'installation) et son **aperçu masqué** (`AKIA…(20)` — famille
  visible, valeur inutilisable).
- **Zéro test de secret** : l'app n'utilise jamais une clé trouvée pour vérifier
  quoi que ce soit ; aucune requête sortante vers un fournisseur avec une
  valeur lue (recette 14, vérifiée par journalisation des sorties réseau).
- **Pas de fuite par le scanner** : un foyer n'est visible que par qui peut lire
  la page ; les autres voient des agrégats par espace (PW-23).
- Les tests utilisent exclusivement les valeurs factices de `@placard/core` ;
  la CI couche 0 rejette tout motif de secret dans les lignes ajoutées.
- L'app **ne modifie jamais** une page sans approbation explicite, et la
  modification est appliquée `asUser()` au nom de la personne qui approuve.
- L'acteur n'est conservé **que pour les attestations** (nécessaire à l'audit) —
  l'app ne note personne (§19, §23).

## 8. Garde-fous du dépôt

- `tools/check_limits.py` : fichiers < 500 lignes, fonctions < 50 lignes (code
  seulement — les `.md` ne sont pas dans ses `SUFFIXES`, la documentation reste
  lisible).
- `tools/validate_manifest.mjs` : chaque `function` du manifeste correspond à un
  export réel de `packages/forge-app/src/index.ts`.
- CI bornée à 5 minutes par job, `fetch-depth: 1`, Mergify sur PR, verdict
  rapide — et `pnpm verify` en local : typecheck + tests + limites + manifeste.
