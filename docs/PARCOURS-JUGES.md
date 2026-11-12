# Parcours juge — 10 minutes chrono

> Le parcours minute par minute du **Placard du wiki**. Chaque étape donne le
> **lien exact**, l'**action** à faire, et le **résultat attendu** — ce que
> vous devez voir si le produit tient sa promesse.
>
> Deux entrées possibles, aucune installation obligatoire :
> le **site public** (<https://tradoooo.github.io/placard-wiki/>) et
> l'**app installée** sur le site de démonstration
> (<https://one-atlas-cndz.atlassian.net/wiki/apps/dc47d23f-e4cd-4681-bb64-14ac02ea1c98/187530d6-48dd-414c-8215-ee19afe04033/placard>).
> La minute 0 se fait sur le site public ; les minutes 6 à 8 se font dans
> l'app. Si l'app est indisponible, la dernière section (« si ça échoue »)
> dit quoi faire à la place.
>
> Les chiffres de ce guide sont **vérifiables** : ils viennent de l'API live
> (<https://268bea73-73bf-4b1e-a3e7-862161c6298a.webtrigger.atlassian.app/public/U3iRFUXiNU509Lv_sk5n7382zbI>),
> lue le 12 novembre 2026. La démo locale jouable hors réseau est décrite
> dans [`DEMO-CL.md`](DEMO-CL.md).

## La minute en un coup d'œil

| Minute | Où | Ce que vous devez voir |
|---|---|---|
| 0 | [site public](https://tradoooo.github.io/placard-wiki/) | l'accueil, 16 onglets, aucune installation |
| 1 – 2 | onglet **Registre** | bandeau **LIVE**, **24 foyers réels**, 40 emplacements, danger max 70 |
| 2 – 4 | onglet **Fiche foyer** | les **termes du score** avec leur méthode, l'exposition en fourchette |
| 4 – 6 | onglet **Rituel (démo locale)** | le **verrou PW-09**, le caviardage masqué, la **purge impossible et documentée** |
| 6 – 8 | **app installée** | l'encart de page, la bannière temps réel, le certificat |
| 8 – 9 | onglet **Playground MCP** | `check-text` et `trace-fingerprint`, réponse JSON exacte |
| 9 – 10 | onglet **Agent Rovo** | les 5 questions du §17, des réponses sans valeur |

---

## Minute 0 · Ouvrez le site public

**Lien** : <https://tradoooo.github.io/placard-wiki/>

**Action** : ouvrez l'adresse. Basculez **FR / EN** en haut à droite (le site
est bilingue). Ne rien installer.

**Résultat attendu** : la page d'accueil s'affiche — la promesse du produit,
les **sept gîtes** où un secret peut dormir, et une section qui dit ce que
l'app **ne fait pas**. Le bandeau d'état est en haut de page. La barre
d'onglets offre **seize écrans** : Accueil, Registre, Le bâtiment, Fiche
foyer, Rituel (démo locale), Certificat, Budget & couverture, Playground MCP,
Agent Rovo, Skill before-sharing, Pré-activation IA, Propagation,
Propriétaire, Réglages d'espace, Bannière temps réel, Couverture & angles
morts.

> Le site est **statique** : il ne demande ni compte ni jeton. Il consomme
> l'API live quand elle répond, et bascule sur ses données embarquées sinon —
> le bandeau le dit alors (**SNAPSHOT** au lieu de **LIVE**).

## Minute 1 – 2 · Le bandeau LIVE et les 24 lignes réelles

**Lien** : <https://tradoooo.github.io/placard-wiki/> → onglet **Registre**

**Action** : lisez le bandeau en haut, puis le registre.

**Résultat attendu** :

- le bandeau affiche **LIVE — site réel one-atlas-cndz.atlassian.net, balayé
  il y a N min**. Méthode : le bandeau ne ment pas — il indique la source
  exacte des chiffres (l'API live du webtrigger, réponse HTTP 200 vérifiée le
  12 novembre 2026). Si l'API ne répond pas, le bandeau passe sur
  **SNAPSHOT — données embarquées** et le dit ;
- le registre affiche **24 foyers réels** et **40 emplacements**. Méthode :
  24 lignes = 24 empreintes distinctes relevées par le balayage réel de
  l'espace `PLACARDDEMO` ; 40 emplacements = la somme des `locationCount` de
  ces 24 lignes (2 au maximum par foyer : la page du tableau d'identifiants
  et sa copie « anyone with the link ») ;
- les scores vont de **50 à 70** (4 foyers à 70, 5 à 65, 8 à 60, 7 à 50).
  Méthode : score = somme des termes appliqués, chaque terme affiché dans
  la fiche ;
- le danger maximal **70/100** est un **cloud key** sur la page « Tableau
  d'identifiants — staging (SYNTHÉTIQUE) ». Méthode : base 55 (famille) +
  20 (version courante) + 10 (surface IA) − 15 (lecture restreinte) = 70 ;
- chaque ligne porte un **aperçu masqué** (`AKIA…(20)`), jamais la valeur.

> Le registre du site live est **le même code** que celui de l'app : mêmes
> filtres, même tri, mêmes fiches. La différence : le site lit l'API publique,
> l'app lit la base de l'installation.

## Minute 2 – 4 · Un foyer, ses termes de score, son exposition

**Lien** : <https://tradoooo.github.io/placard-wiki/> → onglet **Registre**
→ cliquez la ligne de danger 70 → onglet **Fiche foyer**

**Action** : ouvrez la fiche du foyer le plus dangereux et lisez-la de haut
en bas.

**Résultat attendu** :

- **les termes du score sont tous là, avec leur méthode** : « Base par
  famille » (+55, méthode : *20 – 55 selon la famille de détection*), «
  Toujours présent dans la version courante » (+20, méthode : *+20 si au
  moins un emplacement `present` dans la version actuelle*), « Surface IA »
  (+10, méthode : *hypothèse conservatrice tant que l'index ne peut pas être
  interrogé*), « Page archivée ou restreinte » (−15, méthode : *−15 si la page
  est archivée, ou si la restriction limite à moins de 3 lecteurs*). Un score
  sans ses termes n'existe pas dans ce produit ;
- **l'exposition porte sa méthode** : une **fourchette** de lecteurs
  potentiels (`0–0` sur le site live, l'espace n'exposant aucun droit lisible),
  la méthode étant écrite sous la fourchette, et les **caveats** (droits
  manquants) listés ;
- la **surface IA** est marquée comme **hypothèse**, pas comme une vérité ;
- l'aperçu masqué de la valeur (`AKIA…(20)`) et l'empreinte HMAC
  (`hmac256:…`) — **jamais la valeur** ;
- la liste des **emplacements** de l'empreinte : gîte, page, version.

> La même fiche existe dans l'app installée : macro **Placard** sur une page
> de l'espace `PLACARDDEMO`. Elle montre en plus le propriétaire résolu
> (méthode de résolution en cascade) et le propriétaire d adopters.

## Minute 4 – 6 · Le rituel : le verrou, le caviardage, la purge impossible

**Lien** : <https://tradoooo.github.io/placard-wiki/> → onglet **Rituel
(démo locale)** — ou, dans l'app installée, la macro **Placard** sur une page
de l'espace `PLACARDDEMO`
(<https://one-atlas-cndz.atlassian.net/wiki/spaces/PLACARDDEMO>).

**Action** : jouez les étapes dans l'ordre. La première tentative doit
**échouer**, c'est le but.

**Résultat attendu** :

1. **Verrou.** Essayez de caviarder **avant** d'avoir attesté la rotation :
   refus écrit — *« Caviarder est verrouillé tant que la rotation n'a pas été
   attestée par une personne »* (PW-09). Une rotation demandée **par un
   agent** est refusée aussi : *« Un agent ne peut pas attester une rotation
   »* (§17). Le verrou s'explique, il ne disparaît pas ;
2. **Attestation.** Déposez une attestation **humaine** (fournisseur + lien
   vers la preuve : ticket, capture d'audit) : le verrou cède. Méthode :
   l'app n'interroge jamais le fournisseur — elle enregistre un **fait
   horodaté posé par une personne**, et le dit ;
3. **Caviardage.** Le diff proposé est **masqué** : le contexte est visible,
   la valeur ne l'est pas. À l'application, la nouvelle version de la page
   est attribuée **à la personne qui approuve** (`asUser`), avec son
   commentaire de version. Les **modèles de page passent en premier**
   (amplification : chaque nouvelle page recopierait la valeur) ;
4. **Purge.** L'API Confluence ne permet pas de supprimer des versions de
   page : l'app **le dit**. Résultat attendu : une raison écrite (« L'API
   Confluence ne permet pas de supprimer des versions de page : l'historique
   reste lisible »), une **demande groupée** à l'administrateur du site
   listant page, numéro de version et empreinte, et un foyer **laissé
   ouvert** — son exposition reste élevée. Dire « on ne peut pas » fait
   partie du produit ;
5. **Cinq étapes** affichées avec leur état : `rotate` → `redact` → `purge`
   → `prevent` → `verify`.

> La démo locale (`pnpm demo`, voir [`DEMO-CL.md`](DEMO-CL.md)) rejoue
> exactement cette séquence **hors réseau** : verrou refusé, attestation
> humaine, diff masqué, purge documentée, certificat émis.

## Minute 6 – 8 · L'app installée : encart de page, bannière, certificat

**Lien** : <https://one-atlas-cndz.atlassian.net/wiki/apps/dc47d23f-e4cd-4681-bb64-14ac02ea1c98/187530d6-48dd-414c-8215-ee19afe04033/placard>
(page globale de l'app **Placard for Confluence**)

**Action** : trois gestes, dans cet ordre.

1. **Encart de page.** Ouvrez une page de `PLACARDDEMO`, insérez la macro
   **Placard** : le panneau d'action s'ouvre sur la page même (il est aussi
   accessible depuis la page globale de l'app, et l'onglet **Réglages d'espace**
   règle les familles détectées, le score minimum et la politique de purge) ;
2. **Bannière temps réel.** Publiez une page contenant un motif de l'espace
   de démo : la **bannière apparaît pour l'auteur** en moins de 10 s, avant
   que la page soit indexée ou recopiée. *Honnêteté : sur le site public,
   l'écran « Bannière temps réel » est une **simulation affichée comme telle** —
   le push ciblé reste à valider sur un vrai site (§22) ; dans l'app installée,
   c'est le vrai déclencheur `content-created` / `content-updated` / `comment-created` ;*
3. **Certificat.** Générez le certificat (macro **Certificat** ou page globale) :
   une page **datée et chiffrée** (`hmac256:…`) avec les compteurs — foyers
   ouverts, tournés, caviardés, purgés —, l'exposition résiduelle et les
   **angles morts déclarés**. Sur le site live : 24 ouverts, 0 tourné, 0
   caviardé, 0 purgé, exposition résiduelle « 24 foyer(s) encore exposé(s) ».
   Méthode : le certificat ne dit jamais « propre » — ce que l'app n'a pas pu
   effacer reste dit, et le certificat le porte. C'est le document qu'un
   auditeur reçoit, sans lui donner accès aux pages.

## Minute 8 – 9 · Le playground MCP : `check-text` et `trace-fingerprint`

**Lien** : <https://tradoooo.github.io/placard-wiki/> → onglet
**Playground MCP** (13 outils listés à gauche)

**Action** : deux appels.

1. **`check-text`** — collez un texte contenant un motif de l'espace de démo
   et lancez l'appel. Résultat attendu : la réponse JSON exacte de l'outil
   (famille, empreinte, aperçu masqué, positions). *Honnêteté : sur le site
   public, `check-text` est un **vrai calcul local** (WebCrypto) ; il ne
   stocke ni ne journalise le texte ;*
2. **`trace-fingerprint`** — prenez une empreinte dans le registre (onglet
   **Registre** ou **Fiche foyer**) et lancez l'appel. Résultat attendu :
   **tous les emplacements** de cette empreinte sur le site — page, version,
   commentaire, modèle. C'est le cœur du produit : *une empreinte = un foyer,
   N emplacements*.

Dans l'app installée, les treize mêmes outils sont exposés à l'agent par
`rovo:mcp` : ils s'exécutent **pour de vrai** sur les données de
l'installation. Deux refus à connaître : `record-rotation` **refuse un agent**
(l'attestation est humaine) et `check-text` ne renvoie jamais la valeur.

## Minute 9 – 10 · Les cinq questions à l'agent Rovo

**Lien** : <https://tradoooo.github.io/placard-wiki/> → onglet **Agent
Rovo** — ou, dans l'app installée, **Rovo Chat** → agent **« Gardien du
placard »**.

**Action** : posez les cinq questions du cahier (§17). Sur le site, elles sont
cliquables ; dans l'app, tapez-les.

1. « Où avons-nous des identifiants lisibles par plus de cent personnes ? »
2. « Qui peut lire la page qui contient ce mot de passe ? »
3. « Qu'est-ce qui reste à traiter avant l'audit de mars ? »
4. « Montre les pages partagées publiquement qui contiennent des chaînes de connexion. »
5. « Si on active l'assistant sur l'espace Support, qu'est-ce qu'il verra ? »

**Résultat attendu** : l'agent répond avec des **empreintes, des emplacements
et des scores** — jamais une valeur. Quand l'information dépend d'un droit
manquant, il **le dit** (« je ne peux pas le savoir ») et **nomme le droit**
manquant. La question 5 est la question piège : la réponse est une
**hypothèse conservatrice** (« ce que l'assistant verrait ») avec les angles
morts, jamais un verdict.

> Sur le site public, ce chat est une **simulation** (aucun réseau, aucun
> appel de modèle) : il montre la forme des réponses. Dans l'app installée,
> c'est l'agent Rovo « Gardien du placard » sur les données réelles.

---

## Ce que l'app ne fait jamais (§5)

- **Jamais de valeur brute** : ni stockée, ni affichée, ni renvoyée par un
  outil. L'app ne garde qu'une **empreinte HMAC** et un **aperçu masqué**.
- **Jamais d'attestation par un agent** : la rotation est un fait posé par une
  personne, avec un lien vers la preuve (§17).
- **Jamais de caviardage sans attestation** : le verrou PW-09 cède sur une
  attestation humaine, pas sur une confiance.
- **Jamais de purge d'historique par elle-même** : quand l'API ne permet pas,
  elle produit une demande groupée et **laisse le foyer ouvert**.
- **Jamais de score sans ses termes** : chaque point porte sa méthode, et une
  preuve quand il y en a une.
- **Jamais de « propre » sans preuve** : le certificat porte ses angles morts.
- **Jamais de modification au nom de quelqu'un d'autre** : l'écriture porte le
  nom de la personne qui approuve.
- **Jamais de balayage de tout le site d'un coup** : la passe est bornée et
  reprise sur curseur (§14).
- **Jamais d'angle mort masqué** : pages illisibles, pièces jointes non
  lues, whiteboards, captures d'écran — tout est déclaré, avec sa raison.
- **Jamais de « je ne sais pas » maquillé en « il n'y a rien »** : l'absence
  de droit est un droit manquant, pas une absence de données.

## Si ça échoue

**Le repli est le site public.** Le site est statique : il ne dépend ni de
l'app installée, ni d'un compte, ni d'un jeton. Si l'app Forge ne s'ouvre
pas, si l'espace `PLACARDDEMO` est inaccessible, ou si le réseau est coupé,
le parcours continue sur <https://tradoooo.github.io/placard-wiki/> —
avec le bandeau qui bascule en **SNAPSHOT** et le dit.

| Symptôme | Ce que c'est | Ce que vous pouvez faire |
|---|---|---|
| le bandeau affiche **SNAPSHOT** | l'API live n'a pas répondu (réseau, latence, rights) | le site affiche ses données embarquées ; le produit est complet, la source change. Rechargez dans quelques instants |
| la page globale de l'app ne s'ouvre pas | l'app n'est pas installée sur *votre* site | le site public prend le relais ; l'app n'est installée que sur `one-atlas-cndz.atlassian.net` |
| l'espace `PLACARDDEMO` est vide ou absent | pas d'accès au site de démonstration | l'espace est semé par le script `pnpm seed:demo` ; en attendant, la démo locale `pnpm demo` rejoue la passe entière hors réseau |
| le playground MCP répond en simulation | c'est le comportement **vendu** du site public | dans l'app installée, les treize outils tournent pour de vrai via `rovo:mcp` |
| la bannière temps réel ne s'affiche pas | le push ciblé reste à valider sur un site réel (§22) | l'écran du site public le montre en simulation, et le déclencheur est bien câblé dans l'app |
| vous voulez tout rejouer **sans réseau ni clé** | — | `pnpm demo` — voir [`DEMO-CL.md`](DEMO-CL.md) |

**La démo locale est le filet de sécurité final** : elle rejoue la chaîne
complète (détection → regroupement → exposition et score → rituel →
certificat) sur des fixtures déterministes, **sans Atlassian, sans clé, sans
réseau**, et s'arrête en criant si un chemin tentait de sortir ou si une
valeur brute s'y glissait.
