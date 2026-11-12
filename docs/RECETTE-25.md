# Recette §25 — les 18 points, et leur couverture réelle

> Référence : cahier des charges [`CAHIER-DES-CHARGES.md`](CAHIER-DES-CHARGES.md) §25.
>
> **État au 12 novembre 2026** : les huit paquets sont implémentés et mergés sur
> `main` (`domain`, `wiki-source`, `detectors`, `exposure`, `propagation`,
> `ritual`, `demo-space`, `forge-app`), le site de démonstration public est en
> ligne, et la suite passe au vert (`pnpm test` à la racine, 267 tests). Cette
> page a été réécrite **depuis les tests réellement présents** dans le dépôt :
> chaque statut cite le paquet, le fichier et le nom exact du test qui prouve la
> recette — rejouable avec
> `pnpm vitest run packages/<paquet>/<fichier> -t "<motif du nom>"`.
>
> Légende :
> - **couvert** — un test automatisé prouve la recette ; le paquet, le fichier
>   et le nom du test sont cités ;
> - **partiel** — une partie est automatisée (citée), l'autre exige un vrai site
>   Confluence installé (citée aussi) : comportement réel de la plateforme,
>   délai mesurable, journalisation réseau, écrans sans test ;
> - **à couvrir** — aucun test ni aucune preuve n'existe à ce jour.
>
> Règle d'or : rien n'est déclaré « couvert » sans un test qui le prouve. Les
> tests n'utilisent que les valeurs factices de `@placard/core`, jamais une
> valeur réelle.
>
> Oracle : l'espace de démonstration semé par script (`packages/demo-space`,
> §15) sert de corpus aux recettes — faux secrets de chaque famille dans chaque
> gîte, valeurs factices uniquement.

| # | Recette (§25) | Couverture |
|---|---|---|
| 1 | Une page contenant une clé AWS factice ouvre un foyer de famille « clé cloud », avec empreinte et aperçu masqué | **Couvert** : paquet `propagation`, fichier `src/group.test.ts`, test « §25.1 : une clé AWS factice ouvre un foyer « clé cloud » avec empreinte et aperçu masqué ». De bout en bout : paquet `forge-app`, fichier `src/services/sweep.test.ts`, test « détecte la clé factice et ouvre un foyer (empreinte + aperçu masqué) » ; le masque lui-même : paquet `detectors`, fichier `src/scan.test.ts`, test « l'aperçu masqué ne révèle pas la valeur » |
| 2 | La même clé collée dans un commentaire crée un second emplacement du **même** foyer | **Couvert** : paquet `propagation`, fichier `src/group.test.ts`, test « §25.2 : la même clé dans un commentaire crée un second emplacement du MÊME foyer » (complété par « dédup : la même détection vue deux fois ne fait qu'un emplacement » et « fusion : un foyer existant garde son état et ses dates ») |
| 3 | La clé retirée de la version courante laisse un emplacement « historique, version 3 », et l'exposition reste élevée | **Couvert** : paquet `propagation`, fichier `src/group.test.ts`, test « §25.3 : retirée du courant, la clé laisse un emplacement « historique, version 3 » » ; exposition maintenue : paquet `exposure`, fichier `src/score.test.ts`, test « version historique lisible → +15, sans tranche sous 10 versions » ; lecture de la cave : paquet `wiki-source`, fichier `src/__tests__/readers.test.ts`, test « gîte 4 — historique : la version 1 reste lisible dans la cave » |
| 4 | Le secret est présent dans un modèle : le modèle est proposé en premier dans le lot de caviardage | **Couvert** : paquet `propagation`, fichier `src/redaction-order.test.ts`, test « modèle premier, puis version courante, puis exposition décroissante » ; côté rituel : paquet `ritual`, fichier `src/redaction.test.ts`, test « propose les modèles d'abord (§25.4) » |
| 5 | Une page partagée « anyone with the link » ajoute le terme de partage au score, visible dans la fiche | **Couvert** : paquet `exposure`, fichier `src/score.test.ts`, test « §25.5 : partage « anyone with link » → terme public-share visible dans la fiche » ; plafond de lecteurs : fichier `src/readers.test.ts`, test « partage public / « anyone with link » : plafond = effectif du site ». L'état de partage **réel** d'un site installé reste à confirmer : [validation n° 4](VALIDATION-22.md) (repli déjà en place : hypothèse conservatrice affichée, `forge-app/src/services/exposure.ts`) |
| 6 | Le score affiche chacun de ses termes, y compris les malus | **Couvert** : paquet `exposure`, fichier `src/score.test.ts`, test « §25.6 : chaque terme appliqué porte libellé, méthode et évidence — malus compris » (et « plancher : malus cumulés → 0, jamais négatif ») ; catalogue : paquet `domain`, fichier `src/score-terms.test.ts`, test « chaque terme a sa méthode affichable (aucun score sans ses termes) » |
| 7 | `apply-redaction` est refusé tant qu'aucune attestation de rotation humaine n'existe | **Couvert** : paquet `ritual`, fichier `src/lock.test.ts`, test « vaut false sans attestation humaine (§25.7) » ; fichier `src/redaction.test.ts`, test « refuse sans attestation humaine (§25.7) » ; de bout en bout : paquet `forge-app`, fichier `src/services/ritual-guards.test.ts`, test « refuse le caviardage tant qu'aucune attestation humaine n'existe » |
| 8 | Une attestation déposée par un agent est refusée | **Couvert** : paquet `ritual`, fichier `src/attestation.test.ts`, test « refuse explicitement une attestation déposée par un agent (§25.8) » ; paquet `forge-app`, fichier `src/services/ritual-guards.test.ts`, test « refuse une attestation dont l'auteur est un agent ». La surface MCP passe par ce garde : `recordRotation` (`forge-app/src/mcp.ts`) force `actorKind: 'agent'` |
| 9 | Le caviardage appliqué crée une version de page attribuée à la personne qui a approuvé, avec son commentaire | **Partiel** : automatisé — paquet `ritual`, fichier `src/redaction.test.ts`, tests « applique au nom de la personne qui approuve, avec commentaire de version (§25.9) » et « refuse une approbation anonyme (§5 : modification au nom de la personne) » ; paquet `forge-app`, fichier `src/services/ritual-guards.test.ts`, test « applique le caviardage asUser après attestation humaine, sans valeur brute » / exige un vrai site : l'attribution **effective** de la version par `asUser()` côté Confluence — [validation n° 7](VALIDATION-22.md) |
| 10 | Quand la purge d'historique est impossible, une demande à l'administrateur est créée et le foyer reste ouvert | **Partiel** : automatisé — paquet `ritual`, fichier `src/purge.test.ts`, tests « API incapable : blockedReason écrit, demande groupée, foyer reste ouvert », « droits admin manquants : même honnêteté, autre raison écrite », « la demande groupée ne contient aucune valeur brute — que l'empreinte » / exige un vrai site : l'API de purge réelle et la remise de la demande via le webtrigger `pw-purge-request` (`forge-app/src/webtriggers.ts`, sans test automatisé) — [validation n° 1](VALIDATION-22.md) |
| 11 | Une publication contenant un motif déclenche une bannière temps réel pour son auteur en moins de 10 s | **Partiel** : automatisé — le balayage que le déclencheur appelle est testé (paquet `forge-app`, fichier `src/services/sweep.test.ts`, test « détecte la clé factice et ouvre un foyer (empreinte + aperçu masqué) ») / exige un vrai site : le déclencheur lui-même (`forge-app/src/triggers.ts`, sans test automatisé), le canal Forge Realtime ciblé sur l'auteur et la mesure du délai < 10 s — [validation n° 5](VALIDATION-22.md) (repli documenté : commentaire automatique + notification) |
| 12 | Un ruban posé sans raison écrite est refusé ; un ruban est revalidé quand la page change | **Couvert** : paquet `ritual`, fichier `src/ribbon.test.ts`, tests « refuse un ruban sans raison écrite » et « le ruban est à revalider dès que la page change après sa pose » ; paquet `propagation`, fichier `src/state-machine.test.ts`, tests « un ruban sans raison écrite est refusé » et « un ruban est revalidé quand la page change » |
| 13 | Un utilisateur sans droit de lecture ne voit ni le contenu ni l'aperçu du foyer | **Partiel** : automatisé — paquet `exposure`, fichier `src/exposure.test.ts`, test « lecture refusée → existence + propriétaire seulement, jamais le contenu » (aucune fuite : ni empreinte, ni aperçu, ni score, ni emplacement) / exige un vrai site : la vérification à deux comptes, le droit de lecture étant résolu par l'API Forge (`canReadPage`, câblé dans `forge-app/src/resolver.ts` et `mcp.ts`, sans test automatisé) |
| 14 | Aucune requête sortante n'est émise vers un fournisseur avec un secret trouvé (vérifié par journalisation des sorties réseau) | **Partiel** : automatisé — la seule requête sortante qui porte du contenu (l'invite à l'oracle LLM) est masquée et testée : paquet `detectors`, fichier `src/llm-oracle.test.ts`, tests « buildQuestion : empreinte de contenu déterministe, aucune valeur brute » et « maskSpans remplace les intervalles : la valeur brute disparaît » ; le seed de démo n'émet aucune requête (paquet `demo-space`, fichier `src/seed.test.ts`, test « n'émet AUCUNE requête réseau et imprime le plan ») / exige un vrai site : la **journalisation des sorties réseau** du runtime, méthode de vérification demandée par la recette, n'existe pas encore sous forme automatisée |
| 15 | Aucun journal, aucune sortie MCP, aucun certificat ne contient de valeur brute (test automatisé sur corpus) | **Partiel** : automatisé — paquet `forge-app`, fichier `src/services/sweep.test.ts`, test « ne stocke aucune valeur brute (§23) » ; paquet `ritual`, fichier `src/redaction.test.ts`, test « ne recopie JAMAIS le texte retiré (§5) : la valeur factice d'entrée ne sort nulle part » ; fichier `src/purge.test.ts`, test « la demande groupée ne contient aucune valeur brute — que l'empreinte » ; fichier `src/jira.test.ts`, test « ne transporte aucune valeur brute — seulement empreinte et aperçu masqué (§5) » ; paquet `detectors`, fichier `src/scan.test.ts`, test « empreinte HMAC : préfixe stable, clé injectable, aucune valeur brute en sortie » ; garde permanente : la CI couche 0 rejette tout motif de secret dans les lignes ajoutées / reste à faire : le test transversal sur corpus des sorties des treize outils MCP (`forge-app/src/mcp.ts` n'a pas de fichier de test) et des journaux du runtime |
| 16 | Le certificat chiffre : foyers ouverts, tournés, caviardés, purgés, exposition résiduelle, angles morts | **Couvert** : paquet `ritual`, fichier `src/certificate.test.ts`, test « chiffre : ouverts, tournés, caviardés, purgés, exposition résiduelle, angles morts » (intégrité : « toute altération du certificat casse la vérification ») ; schéma : paquet `domain`, fichier `src/sql.test.ts`, test « couvre exactement les onze tables du cahier » (table `certificate`) |
| 17 | L'écran de budget affiche les pièces jointes non lues et pourquoi | **Partiel** : automatisé — paquet `wiki-source`, fichier `src/__tests__/readers.test.ts`, bloc « pièces jointes — jamais d'ignoré silencieux » : tests « au-delà de 5 Mo : non lu, avec la raison », « binaire non textuel : non lu, avec la raison », « tout élément non lu porte une raison (invariant du paquet) » ; le budget est mis à jour au balayage (paquet `forge-app`, fichier `src/services/sweep.test.ts`, test « persiste le scan de page et met à jour le budget (§14) ») / exige un vrai site : l'écran de budget lui-même (`forge-app/src/ui/budget-panel.tsx`, sans test automatisé) et la lecture réelle des pièces jointes — [validations n° 2 et 3](VALIDATION-22.md) |
| 18 | Un droit manquant sur le graphe apparaît à l'écran de couverture, au lieu d'un zéro silencieux | **Partiel** : automatisé — paquet `exposure`, fichier `src/readers.test.ts`, tests « droit manquant sur le graphe → caveat « pas de droit » ≠ « pas de données » (§25.18) » et « permissions de l'espace illisibles : jamais de zéro silencieux » / exige un vrai site : l'écran de couverture de `forge-app` — `coverageReport` (`src/services/registry.ts`) n'a pas de test automatisé et renvoie en l'état des compteurs statiques et la liste des droits du graphe « à valider (§12, §22) » ; la résolution réelle des droits attend le site installé |

**Décompte** : 10 recettes couvertes (1, 2, 3, 4, 5, 6, 7, 8, 12, 16),
8 partielles (9, 10, 11, 13, 14, 15, 17, 18), 0 à couvrir. Aucune recette n'est
totalement sans preuve ; les huit partielles butent toutes sur la même chose :
la plateforme réelle (API Confluence, Realtime, deux comptes, journalisation
réseau) ou un écran Forge sans test automatisé.

## Comment une recette passe au vert

1. Le test cité dans la colonne Couverture existe **avec** l'implémentation
   (fixtures `demo-space`, valeurs factices uniquement) et passe dans
   `pnpm test`.
2. Cette page cite le paquet, le fichier et le nom exact du test — jamais une
   intention, jamais « prévu ». La recette publique suit les tests, jamais
   l'inverse.
3. Une recette « partiel » ne passe à « couvert » que quand la moitié manquante
   est prouvée : soit un test automatisé nouveau, soit le point correspondant de
   [`VALIDATION-22.md`](VALIDATION-22.md) validé sur un site réel et consigné.
4. `pnpm verify` vert (typecheck, tests, limites, manifeste) avant merge —
   Mergify gère, la CI tranche.

Les recettes 1 à 18 correspondent aux exigences PW-01 à PW-24 du §16 : rien
d'indispensable (M) n'est hors de cette table ; les recettes dérivées des
exigences S et C (bâtiment complet, propagation datée, pré-activation IA)
seront ajoutées ici si leur lot est livré avant le gel du 15 décembre.
