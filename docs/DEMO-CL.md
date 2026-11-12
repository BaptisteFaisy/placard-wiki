# La démo jouable en local — `pnpm demo`

> La démo rejoue **la chaîne complète du produit** — détection, regroupement
> en foyers, exposition et score, rituel, certificat — **sur la machine, sans
> Atlassian, sans clé, sans réseau**. C'est le storyboard du produit, jouable
> en moins de deux secondes.
>
> Elle sert de **filet de sécurité** pendant le parcours juge
> ([`PARCOURS-JUGES.md`](PARCOURS-JUGES.md)) : si l'app installée est
> indisponible, si le réseau est coupé, ou si vous voulez simplement revoir
> la mécanique du rituel, la démo est là.

## En une phrase

`pnpm demo` affiche la passe de l'app Forge sur des fixtures déterministes :
**48 foyers**, **67 emplacements**, danger maximal **95**, puis le rituel
(verrou → attestation → caviardage masqué → purge impossible et documentée) et
le certificat.

## Prérequis

| Besoin | Version | Pourquoi |
|---|---|---|
| Node | **≥ 22** (`engines` du dépôt) | ESM + `node:crypto` (empreintes HMAC) |
| pnpm | **9.15.9** (`packageManager`) | installation du monorepo |
| Réseau | **aucun** après l'installation | la démo ne lit aucune variable d'environnement ni aucune API |

Installation (une fois) :

```bash
pnpm install --prefer-offline
```

## Lancer la démo

```bash
pnpm demo           # storyboard lisible (texte)
pnpm demo --json    # le même rapport en JSON
pnpm demo:json      # idem, script dédié
```

> pnpm affiche un bandeau de deux lignes avant la sortie. Pour un flux JSON
> pur (à parser ou à rediriger), utilisez `pnpm --silent demo:json`.

**Durée** : moins de deux secondes (la passe elle-même prend ~70 ms). Aucun
temporisateur, aucune attente réseau.

**Code de sortie** : `0` si tout s'est bien passé, `1` si la démo s'est
arrêtée — et dans ce cas, **elle dit pourquoi** sur stderr.

## Ce qu'elle montre, étape par étape

La sortie texte est le storyboard du produit. Chaque bloc est une étape du
parcours juge, rejouée pour de vrai.

### 1. La passe

```
pages balayées 15 · pièces jointes lues 12 · appels oracle 18 (oracle factice) · 68 ms.
84 valeurs factices plantées (12 numéros × 7 gîtes).
→ 48 foyers distincts (une empreinte = un foyer), 67 emplacements
Répartition par gîte : corps-de-page 32 · commentaires 8 · historique-de-versions 8 · pieces-jointes 11 · titres-et-etiquettes 8.
```

- **15 pages balayées** — méthode : trois pages de l'espace de démo (corps,
  historique, page « anyone with the link ») plus les douze pages dont le
  **titre** porte un secret (gîte 6) ;
- **12 pièces jointes lues** — méthode : une pièce jointe textuelle par
  famille, dans le gîte 3 ;
- **84 valeurs factices plantées** — méthode : 12 numéros de famille (§7) ×
  7 gîtes (§6), construites à l'exécution par `@placard/core` (aucune
  valeur n'est écrite en clair dans le dépôt) ;
- **48 foyers** — méthode : une **empreinte HMAC** = un foyer. La même
  empreinte qui dort dans le corps d'une page **et** dans sa copie
  « anyone with the link » ne forme qu'**un** foyer, avec deux emplacements ;
- **67 emplacements** — méthode : la somme des `locations` des 48 foyers ;
  la répartition par gîte est affichée, et sa somme retombe sur 67 (le test
  le vérifie) ;
- **2 gîtes hors de la passe** — les modèles de page (gîte 5) et la
  description d'espace (gîte 7) ne sont pas balayés par la passe de pages :
  c'est un **angle mort déclaré**, pas un silence (voir plus bas).

### 2. L'exposition et le score

```
95/100 · famille « Clés privées (PEM, SSH, PGP) » (private-key).
Le score n'est jamais un nombre nu — chaque terme porte sa méthode :
  + 55 · Base par famille
  + 20 · Toujours présent dans la version courante
  + 15 · Présent dans l'historique
  + 10 · Surface IA : page indexée par Rovo
  + 10 · Propagée : même empreinte sur 3 emplacements ou plus
  − 15 · Page archivée ou restreinte à moins de 3 personnes
```

Méthode du score : la somme des termes appliqués (55 + 20 + 15 + 10 + 10 − 15
= **95**). Chaque terme vient du catalogue de `@placard-wiki/exposure`, avec
son **intitulé**, sa **méthode** et, quand il y en a une, sa **preuve**
(« 5 emplacements distincts encore debout »). Aucun score n'existe sans ses
termes.

### 3. Le rituel, sur le foyer le plus dangereux

| Étape | Ce que la démo joue | Résultat attendu |
|---|---|---|
| Verrou | un agent tente d'attester | refus écrit : *« Un agent ne peut pas attester une rotation »* (§17) |
| Verrou | on caviarde **sans** attestation | refus écrit : *« aucune attestation de rotation humaine (PW-09) »* |
| Attestation | une **personne** atteste (AWS + référence de preuve) | le verrou cède, l'horodatage est posé |
| Caviardage | aperçu puis application | **diff masqué**, réécriture **au nom de la personne** (`asUser`), 2 emplacements écrits |
| Purge | demande de purge d'historique | **impossible** : raison écrite, demande groupée à l'administrateur (page, version, empreinte), **foyer laissé ouvert** |
| Étapes | les cinq du domaine | `rotate` → `redact` → `purge` → `prevent` → `verify`, chacune avec son état |

Le diff de caviardage est **masqué intégralement** : la ligne entière est
passée au masque, pas seulement la valeur ciblée — sur une ligne qui contient
plusieurs valeurs (un tableau d'identifiants), les voisins ne doivent rien
laisser fuir non plus.

### 4. Le certificat

```
périmètre site · ouverts 47 · tournés 1 · caviardés 0 · purgés 0.
résiduel : 47 foyer(s) encore exposé(s).
```

Méthode : ce sont les compteurs de l'app au moment de l'émission — 47 foyers
sont encore ouverts (48 − celui traité), 1 foyer a été **tourné** (attestation
posée). Le foyer caviardé reste en état `purge-impossible` (son historique
dort encore) : l'app **ne le compte ni caviardé ni purgé**, elle ne prétend
jamais avoir purgé. Le certificat contient des compteurs, une date, une
empreinte `hmac256:` d'intégrité et les **angles morts déclarés** — jamais
une valeur.

### 5. Ce qui n'est pas caché

En fin de sortie, la démo rappelle ce qu'elle ne cache pas :

```
ANGLES MORTS DÉCLARÉS (jamais masqués) :
  − Modèles de page et description d'espace (gîtes 5 et 7) : hors de la passe de pages (§6) — angle mort déclaré.
  − Whiteboards et bases Confluence : non balayés (PW-29) — angle mort déclaré.
  − Captures d'écran : aucun OCR, les secrets d'une image échappent au balayage texte (§24) — angle mort déclaré.
```

## Correspondance : démo ↔ app réelle ↔ site public

| Ce que vous voyez | La démo locale (`pnpm demo`) | L'app installée (Forge) | Le site public |
|---|---|---|---|
| Source des données | fixtures déterministes de `@placard-wiki/demo-space` | l'espace `PLACARDDEMO` semé, en lecture/écriture réelle | l'API live du webtrigger, ou ses données embarquées |
| Réseau | **aucun** (client de fixtures en mémoire) | Atlassian | l'API live, sinon repli snapshot |
| Passage de la passe | `runSweep` — **le même code** | `runSweep` — le même code | l'API live publie le résultat de la même passe |
| Foyers / emplacements | **48 / 67** | 24 / 40 au 12 novembre 2026 | **24 / 40** (identique à l'app) |
| Danger maximal | **95** (clé privée) | 70 (cloud key) | **70** (identique à l'app) |
| Écart entre démo et live | la passe voit **tous** les gîtes d'une page (pièces jointes textuelles incluses) | le balayage réel est soumis aux **droits** : pièces jointes non lisibles, gîtes 5 et 7 hors passe | idem l'app |
| Rituel | joué pour de vrai : verrou, attestation, caviardage masqué, purge documentée | idem, sur les données de l'installation | **simulation** de l'écran « Rituel (démo locale) » |
| Certificat | émis (compteurs, angles morts, `hmac256:`) | idem | affiché, issu de l'API live |
| Valeurs brutes | **zéro** (garde-fou actif) | **zéro** (invariant §23) | **zéro** |

> Les chiffres de la démo (48/67/95) et ceux du site (24/40/70) **ne se
> contredisent pas** : ils ne sont pas produits dans les mêmes conditions.
> La démo lit un espace de démonstration **entièrement lisible** ; le live est
> un site réel, soumis aux droits de l'app — pièces jointes illisibles,
> gîtes 5 et 7 hors de la passe de pages. La couverture est **déclarée** dans
> les deux cas, jamais masquée.

## Temps de lecture

| Lecteur | Combien de temps | Sur quoi |
|---|---|---|
| un juge qui découvre | **3 minutes** | la sortie texte de `pnpm demo`, du bloc « PASSE » au bloc « CERTIFICAT » |
| un juge pressé | **90 secondes** | les trois blocs chiffrés : 48 foyers / 67 emplacements, danger 95 avec ses 6 termes, et le refus du verrou |
| un réviseur technique | **10 minutes** | la sortie JSON (`pnpm demo --json`) : les `scoreTerms`, les `diffs` masqués, la `blockedReason` de la purge, le `adminBrief`, le `contentHash` du certificat |

## Garanties (et ce que la démo n'est pas)

**Ce qu'elle garantit :**

- **zéro valeur brute** — les emplacements portent l'aperçu masqué, les
  foyers l'empreinte HMAC ; un garde-fou compare le rapport à toutes les
  valeurs factices plantées et **arrête la démo** si l'une d'elles s'y
  glissait ;
- **zéro réseau** — une garde de sortie remplace `fetch` par un échec
  explicite : si un chemin tentait de sortir, la démo **le dit et s'arrête** ;
- **zéro clé** — aucune variable d'environnement n'est lue, aucune API
  Atlassian n'est appelée ;
- **reproductibilité** — horloge figée, identifiants séquentiels, fixtures à
  graine : deux exécutions donnent le même rapport.

**Ce qu'elle n'est pas :**

- ce n'est **pas une maquette** : le code joué est celui de l'app
  (`runSweep`, le service de rituel, le store, les paquets de pure
  logique) ;
- ce n'est **pas une démonstration du site réel** : pour cela, il faut le
  site public ou l'app installée ;
- elle ne remplace **ni la recette §25** (qui se joue sur l'app installée
  dans un site réel) **ni les tests du dépôt** : `pnpm test` vérifie le
  scénario (48 foyers, 67 emplacements, danger 95, cinq étapes, zéro valeur
  brute).

## Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| `tsx: command not found` | dépendances non installées | `pnpm install --prefer-offline` |
| `[demo] échec : …` en sortie | la démo s'est arrêtée **exprès** | lisez le message : soit une valeur brute a été détectée (bug à corriger), soit une sortie réseau a été tentée |
| la sortie JSON a deux lignes de bannière avant le `{` | pnpm affiche son bandeau de script | `pnpm --silent demo:json` pour un flux JSON pur |
| le compte de foyers n'est pas 48 | les fixtures ont changé | les tests le disent aussi : `pnpm --filter @placard-wiki/demo-space test` |

## Voir aussi

- [`PARCOURS-JUGES.md`](PARCOURS-JUGES.md) — le parcours juge de 10 minutes,
  minute par minute ;
- [`RECETTE-25.md`](RECETTE-25.md) — la recette publique, jouée sur l'app
  installée ;
- `packages/demo-space/src/demo-scenario.ts` — le scénario ;
  `packages/demo-space/src/demo-scenario.test.ts` — ses tests.
