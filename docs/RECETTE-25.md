# Recette §25 — les 18 points, et leur couverture réelle

> Référence : cahier des charges [`CAHIER-DES-CHARGES.md`](CAHIER-DES-CHARGES.md) §25.
>
> **Honnêteté d'abord : au moment où cette page est écrite, aucune recette n'est
> « faite ».** Le socle est en place — domaine partagé testé (`packages/domain`),
> contrat bridge, manifeste Forge validé par `tools/validate_manifest.mjs`, CI —
> mais les paquets fonctionnels (`wiki-source`, `detectors`, `exposure`,
> `propagation`, `ritual`, `demo-space`) sont des squelettes annoncés comme
> tels. Chaque recette indique donc sa **couverture prévue** : le paquet qui
> l'implémentera, le test qui la prouvera, et le lot qui en a la charge.
>
> Légende :
> - **prévu : paquet X, test Y** — l'emplacement cible est identifié, le test
>   nommé passera au vert quand le lot sera livré ;
> - **à couvrir par le lot X** — la recette devient vérifiable à la livraison du
>   lot X (les lots correspondent aux paquets et à leurs branches `feat/*`) ;
> - **socle en place** — la brique de domaine existe déjà et est testée ; la
>   recette reste à couvrir côté fonctionnel ;
> - **dépend de** — renvoie à un point de [`VALIDATION-22.md`](VALIDATION-22.md) :
>   si le prototype échoue, c'est le repli documenté qui est recetté.
>
> Oracle : l'espace de démonstration semé par script (`packages/demo-space`,
> §15) sert de corpus à toutes les recettes — faux secrets de chaque famille
> dans chaque gîte, valeurs factices de `@placard/core` uniquement.

| # | Recette (§25) | Couverture |
|---|---|---|
| 1 | Une page contenant une clé AWS factice ouvre un foyer de famille « clé cloud », avec empreinte et aperçu masqué | Prévu : paquets `wiki-source` (lecteur de page) et `detectors` (famille 1 réemployée de `@placard/detectors`), test unitaire sur fixture `demo-space` avec valeur factice — à couvrir par les lots « wiki-source » et « detectors » |
| 2 | La même clé collée dans un commentaire crée un second emplacement du **même** foyer | Prévu : paquet `propagation` (regroupement par empreinte), test de regroupement page + commentaire sur fixtures — à couvrir par le lot « propagation » |
| 3 | La clé retirée de la version courante laisse un emplacement « historique, version 3 », et l'exposition reste élevée | Prévu : paquets `wiki-source` (lecteur de versions) et `exposure` (terme « présent dans l'historique » +15), test version-courante/ancienne — à couvrir par les lots « wiki-source » et « exposure » |
| 4 | Le secret est présent dans un modèle : le modèle est proposé en premier dans le lot de caviardage | Socle en place : le contrat bridge expose déjà `templateFirst` dans `ritual/redaction-preview` (`packages/domain/src/bridge.ts`, testé). Prévu : paquets `propagation` et `ritual`, test d'ordre du lot — à couvrir par les lots « propagation » et « ritual » |
| 5 | Une page partagée « anyone with the link » ajoute le terme de partage au score, visible dans la fiche | Prévu : paquet `exposure` (terme +10), test du terme de partage — à couvrir par le lot « exposure » ; dépend de [validation n° 4](VALIDATION-22.md) (sinon : hypothèse conservatrice affichée) |
| 6 | Le score affiche chacun de ses termes, y compris les malus | Socle en place : vocabulaire et structure des termes appliqués dans `packages/domain/src/score-terms.ts` (testé). Calcul wiki et affichage : à couvrir par les lots « exposure » et « forge-app » |
| 7 | `apply-redaction` est refusé tant qu'aucune attestation de rotation humaine n'existe | Prévu : paquet `ritual` (verrou de l'étape 2) + action `apply-redaction` de `forge-app`, test de refus sans attestation — à couvrir par les lots « ritual » et « forge-app » |
| 8 | Une attestation déposée par un agent est refusée | Socle en place : `ritual/attest` porte `actorKind: 'human' \| 'agent'` dans le contrat bridge. Prévu : paquet `ritual` + outil `record-rotation` (`forge-app/src/mcp.ts`), test d'appel agent refusé — à couvrir par les lots « ritual » et « forge-app » |
| 9 | Le caviardage appliqué crée une version de page attribuée à la personne qui a approuvé, avec son commentaire | Prévu : paquets `ritual` (application `asUser()`) et `forge-app`, test d'attribution et de commentaire de version — à couvrir par les lots « ritual » et « forge-app » ; dépend de [validation n° 7](VALIDATION-22.md) |
| 10 | Quand la purge d'historique est impossible, une demande à l'administrateur est créée et le foyer reste ouvert | Prévu : paquet `ritual` (table `purge_request`, §20) + webtrigger `pw-purge-request` (`forge-app`), test « impossibilité → demande + foyer ouvert » — à couvrir par le lot « ritual » ; dépend de [validation n° 1](VALIDATION-22.md) |
| 11 | Une publication contenant un motif déclenche une bannière temps réel pour son auteur en moins de 10 s | Prévu : paquet `forge-app` (`triggers.ts` + Forge Realtime), test de déclenchement et mesure de délai sur site réel — à couvrir par le lot « forge-app » ; dépend de [validation n° 5](VALIDATION-22.md) (sinon : commentaire automatique + notification) |
| 12 | Un ruban posé sans raison écrite est refusé ; un ruban est revalidé quand la page change | Socle en place : `dismissedReason` obligatoire dans les types du domaine. Prévu : paquets `ritual` (refus) et `detectors` (revalidation au scan suivant), tests ruban sans raison et ruban revalidé — à couvrir par les lots « ritual » et « detectors » |
| 13 | Un utilisateur sans droit de lecture ne voit ni le contenu ni l'aperçu du foyer | Prévu : paquet `forge-app` (visibilité par lecteur, PW-23 : agrégats par espace sinon), test à deux comptes — à couvrir par le lot « forge-app » |
| 14 | Aucune requête sortante n'est émise vers un fournisseur avec un secret trouvé (vérifié par journalisation des sorties réseau) | Prévu : test automatisé sur la journalisation des sorties réseau du runtime, dans `forge-app` — à couvrir par le lot « forge-app » (garde transverse : aucune famille ne « teste » un secret, §5) |
| 15 | Aucun journal, aucune sortie MCP, aucun certificat ne contient de valeur brute (test automatisé sur corpus) | Socle en place : la CI couche 0 rejette tout motif de secret dans les lignes ajoutées, et les fixtures n'utilisent que les valeurs factices de `@placard/core`. Prévu : test transversal sur corpus `demo-space` (journaux, sorties des 13 outils MCP, certificat) — à couvrir par **tous** les lots, garde CI permanente |
| 16 | Le certificat chiffre : foyers ouverts, tournés, caviardés, purgés, exposition résiduelle, angles morts | Socle en place : type `Certificate` et table `certificate` (§20) dans `packages/domain` (schéma SQL testé). Prévu : paquet `ritual` (génération) + macro `confluence:macro`, test des six compteurs — à couvrir par le lot « ritual » |
| 17 | L'écran de budget affiche les pièces jointes non lues et pourquoi | Prévu : paquet `wiki-source` (`attachment_scan.skipped_reason`, §20) + écran budget de `forge-app` (contrat `coverage/get` déjà typé : `CoverageReport.perGite`), test « non lu + raison affichée » — à couvrir par les lots « wiki-source » et « forge-app » ; dépend de [validation n° 2](VALIDATION-22.md) |
| 18 | Un droit manquant sur le graphe apparaît à l'écran de couverture, au lieu d'un zéro silencieux | Socle en place : `CoverageReport.missingRights` distingue « pas de droit » de « pas de données » dans le contrat bridge. Prévu : paquet `forge-app` (écran de couverture), test droit retiré → mention explicite — à couvrir par le lot « forge-app » |

## Comment une recette passe au vert

1. Le lot implémente le paquet concerné (branche `feat/<paquet>`, une recette
   recettée par lot, pas de « tout d'un coup »).
2. Le test nommé dans la colonne Couverture est ajouté **avec** l'implémentation
   (fixtures `demo-space`, valeurs factices uniquement).
3. Cette page est mise à jour dans la même PR : la mention « à couvrir » devient
   « couvert par `paquet`, test `nom-du-test` » — avec lien vers le fichier de
   test. Jamais avant.
4. `pnpm verify` vert (typecheck, tests, limites, manifeste) avant merge —
   Mergify gère, la CI tranche.

Les recettes 1 à 18 correspondent aux exigences PW-01 à PW-24 du §16 : rien
d'indispensable (M) n'est hors de cette table ; les recettes dérivées des
exigences S et C (bâtiment complet, propagation datée, pré-activation IA)
seront ajoutées ici si leur lot est livré avant le gel du 15 décembre.
