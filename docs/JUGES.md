# Guide des juges — 10 minutes chrono

> Référence : cahier des charges [`CAHIER-DES-CHARGES.md`](CAHIER-DES-CHARGES.md) §27.
>
> Ce guide accompagne la **soumission** (avant le mardi 22 décembre 2026, 21 h,
> Paris). Les éléments marqués *(placeholder)* y seront complétés au moment du
> dépôt : lien d'installation réel, identifiants de démonstration — ce sont les
> deux seules informations qui manquent, et **elles ne doivent jamais être
> inventées** (qui les fournit est indiqué ci-dessous).
>
> État du dépôt au 12 novembre 2026 : les huit paquets sont implémentés et
> mergés, **298 tests** (34 fichiers) sont verts, le manifeste est cohérent avec
> les exports réels de l'app, et le site de démonstration public est en ligne et
> répond. La recette publique suit [`RECETTE-25.md`](RECETTE-25.md), jamais
> l'inverse.

## Tester le produit sans rien installer (en dehors du chrono)

**Site de démonstration public** :
<https://baptistefaisy.github.io/placard-wiki/> — statique, données 100 %
synthétiques (fixtures `demo-space`, §15), bilingue EN/FR, seize écrans : de
quoi comprendre le produit en deux minutes, sans installation, sans site
Confluence, sans identifiants. Réponse HTTP 200 vérifiée le 12 novembre 2026.
Le chrono ci-dessous, lui, se joue sur **l'app installée** dans votre site,
avec l'espace de démonstration semé.

### Le parcours de 10 minutes sur le site public (si vous n'installez rien)

| Onglet | Ce qu'il montre | Source, honnêtement |
|---|---|---|
| Home | la promesse, les sept gîtes, ce que l'app ne fait pas | textes du dépôt |
| Register | le registre : tri, filtres, une ligne = un foyer | données de démo |
| Building | le bâtiment (PW-25) : aile, pièce, lueur sous la porte, trappe de cave, courant d'air | rendu local |
| Foyer sheet | la fiche : **tous les termes du score**, l'exposition et sa méthode, la surface IA | données de démo |
| Ritual | les cinq étapes et leurs verrous | état local, aucun backend |
| Certificate | le certificat daté et chiffré | données de démo |
| Propagation | une empreinte, N emplacements, le modèle traité en premier | données de démo |
| Owner | la résolution de propriétaire en cascade (§12) | données de démo |
| Pre-activation | « qu'est-ce que l'assistant verrait ? » et les angles morts | **vrai paquet** `@placard-wiki/exposure` |
| MCP | les treize outils, réponses JSON exactes | exécution **simulée** sur le jeu de démo ; les verrous, les refus et l'ordre de caviardage viennent du **vrai code** des paquets ; `check-text` est un **vrai calcul local** (WebCrypto) |
| Rovo | les cinq questions de l'agent | chat **simulé** — aucun réseau, aucun appel LLM |
| Skill | `before-sharing-a-page` : vérifier un texte avant publication | vrai calcul local |
| Banner | la bannière temps réel à l'auteur | **simulation** affichée comme telle — le push ciblé reste à valider sur un vrai site ([validation n° 5](VALIDATION-22.md)) |
| Budget, Coverage, Space settings | budget de balayage, couverture et angles morts, réglages par espace | données de démo |

Trois écrans sont explicitement des **simulations** (bannière, chat Rovo,
exécution MCP) : ils montrent le comportement et la forme des réponses, pas une
intégration live. Les autres tournent sur le vrai code des paquets.

## Avant de commencer (0 min, en dehors du chrono)

- **Lien d'installation Marketplace** : *(placeholder — l'URL de la fiche
  Marketplace publique, fournie par **Baptiste Faisy** dans la soumission
  Devpost après le dépôt du listing prévu à partir du 16 décembre 2026 (§28).
  **À ne jamais inventer.** En attendant, l'app tourne réellement sur le site
  de démonstration ci-dessous — ce n'est pas une maquette)*.
- **App installée et vérifiée (12 novembre 2026)** : `Placard for Confluence`,
  app.id `ari:cloud:ecosystem::app/dc47d23f-e4cd-4681-bb64-14ac02ea1c98`
  (Developer Space « laddition »), déployée en v2.0.0 (`forge deploy`,
  environnements `development` et `production`) et installée sur le site
  Confluence `one-atlas-cndz.atlassian.net` :
  <https://one-atlas-cndz.atlassian.net/wiki/apps/dc47d23f-e4cd-4681-bb64-14ac02ea1c98/187530d6-48dd-414c-8215-ee19afe04033/placard>
- **Espace de démonstration semé** : `PLACARDDEMO` sur ce même site —
  <https://one-atlas-cndz.atlassian.net/wiki/spaces/PLACARDDEMO> (faux secrets
  de chaque famille dans chaque gîte, §15 ; accès fourni aux juges sur demande).
- **Identifiants de démonstration** : *(placeholder — le compte Confluence
  Cloud donnant un accès en lecture au site ci-dessus et à l'espace semé
  `PLACARDDEMO`, fourni par **Baptiste Faisy** dans le champ privé de la
  soumission Devpost (« accès fourni aux juges sur demande »). **À ne jamais
  inventer.** Aucun secret réel n'est nécessaire : l'app apporte son propre
  contenu de test)*.
- Aucun secret réel n'est nécessaire : l'app apporte son propre contenu de test.

## Minute 0 – 2 · L'espace de démonstration

Installez l'app, ouvrez la page globale **Placard** et lancez le seed :

- un **faux secret de chaque famille** (les douze du §7) est planté dans
  **chaque gîte** (§6) : corps de page, commentaire, pièce jointe, **version
  historique**, **modèle de page**, titre, page partagée publiquement ;
- tout est **marqué comme synthétique** dans l'interface (mode démonstration,
  §15) ; les valeurs sont les valeurs factices de test, jamais une valeur réelle
  — l'app ne stocke d'ailleurs aucune valeur brute (§23) ;
- ce même espace est l'**oracle de test** de la CI : ce que vous voyez est ce
  que les recettes vérifient.

Lancez un balayage **borné à cet espace** (l'installation ne propose jamais de
balayer tout votre site d'un coup).

## Minute 2 – 4 · Le bâtiment et le registre

- **Le bâtiment** (§10) : une aile = un espace, une pièce = une page (taille =
  audience), lueur sous la porte = danger maximal, **trappe de cave ouverte** =
  secret encore lisible dans une ancienne version, courant d'air = même
  empreinte à deux endroits, sceau de cire = foyer clos, ruban = faux positif
  écarté.
- **Le registre** : tri, filtres, fiche de foyer. Ouvrez une fiche : les
  **termes du score sont tous affichés** (§8), l'exposition montre sa méthode
  (fourchette de lecteurs, pas un nombre inventé), la surface IA est marquée
  comme hypothèse conservative.
- Le registre porte **exactement la même information** que le bâtiment ; il est
  navigable au clavier (WCAG AA). Si le bâtiment vous semble décoratif : c'est
  la seule partie sacrificiable du produit, le registre suffit.

## Minute 4 – 6 · Le rituel, de bout en bout

Sur un foyer de l'espace de démo :

1. **Tourner** : déposez l'attestation de rotation (fournisseur + lien de
   preuve). L'app ne teste jamais la clé — elle enregistre un fait humain
   horodaté. Essayez de caviarder **avant** : c'est verrouillé (§9).
2. **Caviarder** : le diff proposé est **masqué** (contexte visible, valeur
   jamais). Appliquez : la nouvelle version de page est attribuée **à vous**,
   avec votre commentaire de version.
3. **Purger** : si l'API ne permet pas la purge, l'app **le dit** — demande
   groupée à l'administrateur (page, version, empreinte), foyer **ouvert**,
   exposition maintenue. Dire « on ne peut pas » fait partie du produit.
4. **Sceau de cire** quand tout est clos ; **ruban** sur un faux positif
   (raison écrite obligatoire, date de révision).

Bonus temps réel, si vous avez une minute : publiez une page contenant un motif
de l'espace de démo — **la bannière apparaît pour l'auteur en moins de 10 s**,
avant que la page soit indexée ou recopiée.

## Minute 6 – 8 · Agent Rovo et outils MCP

**Dans Rovo Chat**, posez à l'agent « Gardien du placard » les cinq questions
du §17 :

1. « Où avons-nous des identifiants lisibles par plus de cent personnes ? »
2. « Qui peut lire la page qui contient ce mot de passe ? »
3. « Qu'est-ce qui reste à traiter avant l'audit de mars ? »
4. « Montre les pages partagées publiquement qui contiennent des chaînes de connexion. »
5. « Si on active l'assistant sur l'espace Support, qu'est-ce qu'il verra ? »

L'agent répond avec des **empreintes, des emplacements et des scores** — jamais
une valeur. Quand l'information dépend d'un droit manquant, il dit « je ne peux
pas le savoir » et nomme le droit.

**Dans votre client MCP** (les treize outils du §17 sont exposés par
`rovo:mcp`), essayez au minimum :

- `scan-page` sur une page de l'espace de démo → foyers : famille, empreinte,
  aperçu masqué (`AKIA…(20)`), danger **et ses termes** ;
- `trace-fingerprint` avec une empreinte renvoyée par `scan-page` → **tous les
  emplacements** du site pour cette empreinte (page, version, commentaire,
  modèle) : c'est le cœur du produit, une empreinte = un foyer, N emplacements.

Aucun outil ne renvoie de valeur brute ; `check-text` (vérifier un texte avant
publication) ne le stocke ni ne le journalise ; `record-rotation` **refuse un
appel d'agent** — l'attestation est humaine.

## Minute 8 – 10 · Le certificat

Générez le **certificat de l'espace de démonstration** (macro ou page globale) :

- page **datée et chiffrée** : foyers ouverts, tournés, caviardés, purgés,
  exposition résiduelle, **angles morts déclarés** ;
- aucun « propre » sans preuve : ce que l'app n'a pas pu effacer reste dit, et
  le certificat le porte — c'est ce document qu'un auditeur, un client ou un
  RSSI reçoit, pas une promesse ;
- partageable avec l'auditeur sans donner accès aux pages : le certificat ne
  contient ni valeur, ni texte de page.

## Après le chrono

- Écran **budget et couverture** (administration) : pages balayées, pièces
  jointes **non lues et pourquoi**, appels LLM, jetons, coût estimé, droits
  manquants — une couverture partielle est déclarée, jamais masquée.
- **File d'adoption** : les pages sans propriétaire résolu, et la méthode de
  résolution en cascade (§12) affichée.
- La vidéo de soumission montre en plus un balayage sur un site réel peuplé
  (§27) — voir [`VIDEO.md`](VIDEO.md) pour le scénario.

## Chiffres vérifiables dans le dépôt

Vérifiables en quelques minutes, sur `main` :

| Chiffre | Valeur | Comment vérifier |
|---|---|---|
| Tests automatisés | **298** (34 fichiers) | `pnpm test` |
| Paquets du monorepo | **8** | `ls packages/` |
| Modules du manifeste | 21 fonctions, 3 déclencheurs, 1 consumer, 2 déclencheurs planifiés, 1 webtrigger, 4 écrans Confluence, `sql`, `llm`, 13 actions, `rovo:agent`/`rovo:mcp`/`rovo:skill` | `node tools/validate_manifest.mjs` |
| Tables SQL | **11** | `grep -c 'CREATE TABLE' packages/domain/src/sql.ts` |
| Outils MCP | **13** | `packages/forge-app/manifest.yml`, section `rovo:mcp` |
| Familles de détection | **12** (11 étiquettes : `bank-data` couvre IBAN + carte) | `packages/domain/src/vocabulary.ts` |
| Gîtes | **7** | `packages/domain/src/vocabulary.ts` (`GITES`) |
| Recette §25 | **10 couvertes, 8 partielles, 0 sans preuve** | [`RECETTE-25.md`](RECETTE-25.md) |
| Contraintes plateforme | vérifiées par `forge lint` (0 erreur, CLI 15.1.0) | [`VALIDATION-22.md`](VALIDATION-22.md) |
| Réemploi de `placard` | sous-module épinglé, commit `6664cfc` | `git submodule status` |
| Site de démo | accessible (HTTP 200, vérifié le 12 novembre 2026) | <https://baptistefaisy.github.io/placard-wiki/> |

Les huit recettes partielles butent toutes sur la même chose : la plateforme
réelle (API Confluence, Realtime, deux comptes, journalisation réseau) ou un
écran Forge sans test automatisé. [`RECETTE-25.md`](RECETTE-25.md) nomme, pour
chaque recette, le paquet, le fichier et le nom exact du test.

Questions, problèmes d'installation : le dépôt
[`BaptisteFaisy/placard-wiki`](https://github.com/BaptisteFaisy/placard-wiki)
(issues ouvertes), et les textes de la soumission Devpost.
