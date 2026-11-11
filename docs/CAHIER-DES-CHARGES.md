# Placard du wiki — cahier des charges

> Codegeist 2026 · catégorie **Apps for Business Teams** (transversal sécurité/support)
> Bonus visés : Agents Rovo (principal), MCP, Marketplace ; Teamwork Graph en appoint
> Version 1 du 11 novembre 2026 · soumission avant le mardi 22 décembre 2026, 21 h (Paris)
> Nom de dépôt proposé : `placard-wiki` · nom public : **Placard for Confluence**

## 1. L'idée en une phrase

Le wiki est l'endroit le plus partagé et le moins surveillé de l'entreprise : l'app trouve les secrets et les données personnelles qui y dorment — corps de page, commentaires, pièces jointes, modèles et **historique de versions** —, chiffre qui peut les lire (humains et IA compris), et conduit la réparation dans le bon ordre : tourner la clé d'abord, caviarder ensuite, prouver à la fin.

## 2. Le problème

Tout le monde scanne son dépôt. Personne ne scanne son wiki.

Or c'est dans Confluence que vivent, en clair, les tableaux d'identifiants des runbooks, le mot de passe du compte de service, la clé d'API du prestataire collée « pour dépanner », le DSN de la base de staging, l'export client en pièce jointe, le NIR d'un collaborateur dans un tableau RH. Une page de runbook est lue par des dizaines de personnes, copiée, dupliquée comme modèle, et personne ne la relit jamais.

Trois obstacles, les mêmes que dans l'historique Git, mais aggravés :

1. **Le triage.** Un premier balayage sort 400 lignes : exemples de documentation, valeurs de test, fausses clés de démo. Sans hiérarchie et sans explication, on ferme la fenêtre.
2. **L'ordre.** Le réflexe est de modifier la page. C'est le mauvais premier geste, pour deux raisons : une clé publiée doit être **révoquée d'abord** (des copies existent déjà, et Confluence conserve **toutes les versions** de la page). Effacer le texte aujourd'hui n'efface rien d'hier.
3. **La preuve.** Un auditeur, un client, un RSSI demandent « scannez-vous votre wiki ? ». Sans registre daté, la réponse est « on suppose que oui ».

À cela s'ajoute un multiplicateur propre à 2026 : **la surface IA**. Rovo Search et le Teamwork Graph indexent les pages Confluence. Un secret écrit dans une page n'est plus seulement lisible par ceux qui ouvrent la page : il est à une question de chat de toute personne ayant accès à l'assistant, et recopiable par n'importe quel agent autorisé à écrire. La question n'est plus « qui peut ouvrir cette page ? » mais **« qu'est-ce que j'ai donné à lire à mon IA ? »**.

Ce qu'il faut pour répondre existe déjà : l'API Confluence (pages, versions, commentaires, pièces jointes, restrictions, partage), le moteur de détection déjà écrit et testé pour `placard` (Git), Forge SQL pour le registre, un LLM hébergé pour les cas ambigus, le graphe pour retrouver un propriétaire. Il manque l'outil qui les rapproche — et qui a l'honnêteté de dire ce qu'il ne peut pas faire.

## 3. Utilisateurs

| Qui | Ce qu'il fait | Ce qu'il attend |
|---|---|---|
| Auteur d'une page | Publie un runbook | Être prévenu **tout de suite**, pas la nuit suivante, et pouvoir corriger en un clic |
| RSSI / responsable sécurité | Tient le registre des expositions | Une liste triée, chiffrée, explicable, avec l'état de réparation |
| Propriétaire d'espace | Range son espace | Savoir quoi traiter en premier, et ce qu'il ne peut pas effacer |
| Administrateur du site | Purge l'historique | Des demandes précises, page et version, sans chercher lui-même |
| Auditeur / client | Vérifie une conformité | Un certificat daté, des chiffres, pas une promesse |
| Agent de code (via MCP) | Écrit ou lit des pages | Savoir s'il est sur le point de publier un secret, et où le mettre à la place |

## 4. Vocabulaire du produit

- **Empreinte** : HMAC-SHA-256 du secret, clé propre à l'installation. C'est l'identité d'un secret ; le secret lui-même n'est jamais stocké.
- **Aperçu masqué** : `AKIA…(20)` — famille visible, valeur inutilisable.
- **Foyer** : une empreinte et son état de réparation. Un foyer peut avoir plusieurs emplacements.
- **Emplacement** : un endroit précis où l'empreinte est présente (page, version, commentaire, pièce jointe, modèle).
- **Gîte** : la nature de l'emplacement — les sept endroits où un secret se cache (§ 6).
- **Famille** : la catégorie de détection (clé cloud, token, IBAN, donnée personnelle…).
- **Danger** : score de 0 à 100, dont **chaque terme appliqué est affiché**.
- **Exposition** : qui peut lire × depuis combien de temps × quelle surface (dont l'IA).
- **Surface IA** : ce que les assistants et agents de l'organisation peuvent atteindre à partir de cette page.
- **Rituel** : la séquence de réparation — tourner, caviarder, purger, empêcher, vérifier.
- **Sceau de cire** : foyer traité (rotation attestée **et** caviardage fait **et** purge vérifiée ou impossible documentée).
- **Ruban** : faux positif écarté, avec raison écrite et date de révision.
- **Registre** : la vue tableau, qui porte exactement la même information que le bâtiment.
- **Certificat** : page datée et chiffrée, destinée à un auditeur.
- **Propagation** : la même empreinte recopiée d'une page à l'autre.

Discipline de vocabulaire, comme ailleurs : **présent** (motif reconnu) ≠ **exposé** (quelqu'un peut lire) ≠ **vivant** (on ne le sait jamais) ≠ **révélé** (aucune preuve d'accès). L'app ne dit jamais « cette clé est active » : elle dit « rotation inconnue depuis 412 jours ». Elle ne teste jamais un secret trouvé.

## 5. Ce que l'app ne fait pas

Autant le dire avant, parce que c'est ce qui la rend crédible :

- elle **n'utilise jamais** un secret trouvé (aucun appel vers AWS, Stripe ou GitHub avec la clé lue) ;
- elle **ne stocke jamais** la valeur brute : ni en base, ni dans les journaux, ni dans les invites au LLM, ni dans le certificat ;
- elle **ne modifie jamais** une page sans l'approbation explicite d'une personne, et la modification est faite au nom de cette personne ;
- elle **ne prétend jamais** avoir effacé ce qu'elle ne peut pas effacer (l'historique de versions) ;
- elle **ne note personne** : elle nomme un propriétaire quand l'audit l'exige, jamais un classement.

## 6. Les sept gîtes

| Gîte | Pourquoi c'est là | Ce que ça change |
|---|---|---|
| Corps de page | Runbooks, procédures d'accès, comptes de démo | Le cas classique, y compris dans les blocs de code et les macros |
| Commentaires | « le mot de passe est X » répondu en deux secondes | Jamais relu, jamais cherché, souvent hors des sauvegardes de texte |
| Pièces jointes | `.env`, `.pem`, `.p12`, `.kdbx`, `.ovpn`, exports CSV/XLSX, captures de terminal | Un fichier joint survit à la réécriture de la page |
| **Historique de versions** | La page a été corrigée un jour | Le secret reste lisible dans la version 3 — **le point aveugle de tous les scanners** |
| **Modèles de page** | Un runbook modèle avec ses identifiants | Amplification : chaque nouvelle page recopie le secret |
| Titres et étiquettes | « accès staging (mdp: …) » | Visible dans les résultats de recherche et les fils |
| Description d'espace, page d'accueil | L'endroit le plus lu de l'espace | Exposition maximale, rarement audité |

À valider (§ 22) : whiteboards et bases Confluence. S'ils sont inaccessibles depuis Forge, ils sont déclarés **angle mort** dans l'écran de couverture — pas silently ignorés.

## 7. Les familles de détection

Douze familles. Les neuf premières proviennent de `placard` (Git), déjà écrites et testées ; les trois dernières sont propres au wiki.

| # | Famille | Méthode |
|---|---|---|
| 1 | Clés cloud (AWS, GCP, Azure) | Motifs préfixés |
| 2 | Tokens de plateforme (GitHub, GitLab, Slack, Stripe, OpenAI, Twilio…) | Motifs préfixés |
| 3 | Clés privées (PEM, SSH, PGP) | En-têtes |
| 4 | JWT signés | Structure en trois parties + signature plausible |
| 5 | Mots de passe en clair | Assignation + filtre d'entropie |
| 6 | IBAN | Contrôle mod-97 |
| 7 | Cartes bancaires | Contrôle de Luhn |
| 8 | Numéros d'identité (NIR français et équivalents) | Contrôle mod-97 de la clé |
| 9 | Données personnelles en prose | Motifs + **LLM** : adresse, téléphone, date de naissance, mention de santé, salaire nommé |
| 10 | Chaînes de connexion | `postgres://`, `mongodb://`, `redis://`, JDBC avec mot de passe intégré |
| 11 | **Tableaux d'identifiants** | Détection structurelle : tableau ou liste où une colonne ressemble à un identifiant et l'autre à un secret — le motif Confluence par excellence |
| 12 | **Pièces jointes sensibles** | Extension + contenu textuel extractible + entropie du binaire |

Le LLM n'intervient que sur les **candidats ambigus** (famille 9, 11, et les cas où le contexte décide : exemple de documentation ou vraie valeur). Résultat mis en cache par empreinte du contenu, comme dans `problemes-caches`.

## 8. L'exposition chiffrée

Le danger se calcule, et le calcul se montre. Chaque terme appliqué apparaît dans la fiche du foyer.

```
base par famille                                  20 – 55
+ toujours présent dans la version courante       +20
+ présent dans l'historique                       +15   (+5 par tranche de 10 versions)
+ lisible par plus de 1 000 personnes             +15   (+10 si >100, +5 si >10)
+ page partagée publiquement / « anyone with link »+10
+ surface IA : page indexée par Rovo              +10
+ rotation inconnue depuis plus de 90 jours       +10
+ propagée : même empreinte sur 3 emplacements+   +10
− contenu de test, d'exemple ou de documentation  −30
− valeur factice connue                           −20
− page archivée ou restreinte à moins de 3 personnes −15
```

Deux chiffres d'accompagnement, toujours affichés avec leur méthode :

- **Lecteurs potentiels** : permissions de l'espace + restrictions de la page + état du partage. Fourchette, pas un nombre exact : « entre 340 et 1 200 personnes », parce que l'app ne résout pas toujours les groupes imbriqués.
- **Coût de remise en état** : fourchette en heures par famille (rotation + caviardage + purge + vérification), pour répondre à « combien de temps ça nous prend ? ».

Règle d'honnêteté reprise des autres cahiers : aucun score sans ses termes, aucune exposition sans sa méthode, aucun « propre » sans certificat.

## 9. Le rituel

Cinq étapes, dans cet ordre, avec des verrous.

**1. Tourner.** Fiche par fournisseur (AWS, GitHub, Stripe, OpenAI, Slack, Google Workspace, base de données interne, générique). Un ticket Jira est créé, assigné au propriétaire résolu (§ 11). **L'étape 2 est verrouillée tant que la rotation n'a pas été attestée par une personne** — jamais par l'app, jamais par un agent. L'attestation est un fait horodaté, avec un lien vers la preuve (ticket fournisseur, capture du journal d'audit) : c'est une preuve *attestée*, pas une preuve *machine*, et le registre le dit.

**2. Caviarder.** L'app propose un correctif en diff sur le format storage : la valeur est remplacée par `[retiré — rotation attestée le 12 nov. 2026, voir SEC-417]`. Aperçu avant application ; application `asUser()` au nom de la personne qui approuve ; commentaire de version explicite. Le texte retiré n'est recopié nulle part.

**3. Purger l'historique.** L'étape honnête. Deux issues, affichées sans détour :
- l'API le permet → l'app liste les versions concernées, page par page, et soumet la demande (droits d'administrateur requis) ;
- l'API ne le permet pas, ou les droits manquent → **le foyer reste ouvert**, son exposition reste élevée, et l'app produit une demande groupée à l'administrateur du site avec la liste exacte (page, numéro de version, empreinte). Dire « on ne peut pas » fait partie du produit.

**4. Empêcher.** Un déclencheur sur la modification de contenu lance une détection en quelques secondes ; **Forge Realtime pousse une bannière à l'auteur qui est encore sur la page** : « cette page contient un motif de clé AWS — danger 74 — [voir] [caviarder] ». C'est la différence avec un scanner nocturne : le secret n'a pas le temps d'être recopié, indexé, ni lu. Un garde-fou complète : avant qu'un agent n'écrive dans une page, le skill `before-sharing-a-page` (§ 17) lui fait vérifier son texte.

**5. Vérifier.** Nouveau balayage de la page. Sceau de cire si tout est clos. **Certificat** daté, chiffré, signé par empreinte : nombre de foyers ouverts, tournés, caviardés, exposition résiduelle, angles morts déclarés.

Le ruban (faux positif) exige une raison écrite, une personne, et une date de révision : un ruban n'est pas éternel, il est revalidé quand la page change.

## 10. Le bâtiment

La carte visuelle, où chaque élément porte une donnée et rien d'autre — pas de décor gratuit.

| Élément | Donnée encodée |
|---|---|
| Une **aile** | Un espace Confluence |
| Un **étage** | La profondeur dans l'arbre de pages |
| Une **pièce** | Une page ; sa taille = son audience (lecteurs potentiels) |
| Une **porte verrouillée** | Une page restreinte |
| Une **fenêtre ouverte** | Un partage public ou « anyone with the link » |
| La **lueur sous la porte** | Le danger maximal derrière (couleur + intensité) |
| La **cave** sous une pièce | Son historique de versions |
| Une **trappe de cave ouverte** | Un secret encore lisible dans une ancienne version |
| Un **courant d'air** entre deux pièces | La même empreinte à deux endroits (propagation) |
| Une **affiche au mur** | Un modèle de page qui recopie son contenu |
| Une **pièce murée** | Une page orpheline, sans propriétaire résolu |
| Un **sceau de cire** | Un foyer clos (tourné, caviardé, purge vérifiée) |
| Un **ruban** | Un faux positif écarté, avec raison |
| La **lanterne** | Le focus : suit le pointeur et le clavier, éclaire le foyer sélectionné |
| Le **registre** sur la table | La vue tableau — information identique, accessible |

Aucune image gore. Les fiches et le registre restent sur fond plein et contrasté ; le décor passe derrière. Le registre est navigable au clavier et conforme WCAG AA.

## 11. Une empreinte, plusieurs emplacements

Le vrai travail n'est pas de trouver un secret, c'est de trouver **tous** ses emplacements. La même empreinte peut vivre dans six pages, deux commentaires, une pièce jointe et un modèle. L'app traite un **foyer** avec N emplacements :

- la rotation est unique (une seule clé à révoquer) ;
- le caviardage est proposé en lot, emplacement par emplacement, avec le diff de chacun ;
- **l'ordre compte** : le modèle est traité en premier, sinon il recopie le secret dans les pages créées ensuite ;
- la propagation est datée : « recopié 4 fois entre mars et octobre, dont une fois par duplication de page ». C'est une information sur les habitudes de l'équipe, pas sur les personnes.

## 12. Trouver un propriétaire

Une page sans responsable ne sera jamais réparée. Résolution en cascade, avec la méthode affichée :

1. propriétaire déclaré de la page ;
2. derniers éditeurs (les trois derniers, sans classement) ;
3. responsable de l'espace ;
4. **Teamwork Graph** : la page (`document`) reliée à un projet ou à un service logiciel (`project`, `software-service`) → l'équipe qui en est propriétaire ;
5. sinon : **file d'adoption**, où l'espace désigne quelqu'un.

C'est l'usage du graphe de cette app : lecture seule, pour résoudre une responsabilité. L'app ne fournit pas de connecteur — et n'en fournira jamais un ici : ingérer des secrets ou des données personnelles dans le graphe est explicitement interdit par ses conditions, et contraire au § 5.

## 13. La surface IA

Une page lisible par Rovo est présumée indexée, et l'app l'affiche comme une **hypothèse conservatrice** tant qu'elle ne sait pas interroger l'index (§ 22). Trois usages concrets :

- dans le calcul d'exposition, le terme `surface IA` (+10) ;
- dans le bâtiment, les pièces dont la fenêtre est ouverte **et** qui sont indexées sont signalées en premier : c'est là qu'une question de chat peut faire sortir le secret ;
- avant d'activer un assistant sur un nouvel espace, un **balayage de pré-activation** répond à « qu'est-ce que je m'apprête à donner à lire à mon IA ? », avec le certificat correspondant. C'est l'usage le plus neuf du produit, et le plus facile à démontrer.

## 14. Le budget de balayage

Un wiki d'entreprise tient dans les 20 000 à 200 000 pages. Balayer tout, tout le temps, est impossible et inutile. Trois réglages, tous affichés :

- **Incrémental** : CQL `lastModified >= <dernier balayage>`, exécuté par un déclencheur planifié long (jusqu'à 900 s), repris là où il s'est arrêté par un curseur.
- **Complet** : une passe périodique, par tranches d'espaces, priorisée par exposition (espaces partagés, pages récentes, pages à forte audience).
- **À la demande** : une page, un espace, un lien — en moins de 2 s depuis le cache de détection.

Le LLM n'est appelé que sur les candidats ambigus, avec cache par empreinte de contenu. Ordre de grandeur à vérifier sur données réelles : 50 000 pages, ~1 % de candidats ambigus, cache efficace → quelques centaines d'appels, pas des dizaines de milliers. L'écran de budget affiche : pages balayées, pièces jointes lues, fichiers **non lus** et pourquoi, appels LLM, jetons consommés, coût estimé, temps de passe. Une couverture partielle est déclarée, jamais masquée.

## 15. Démarrer sans historique

Le site de démonstration des juges ne contient rien. L'app fournit donc :

- un **espace de démonstration** semé par script, avec un faux secret de chaque famille, planté dans chaque gîte : page, commentaire, pièce jointe, version historique, modèle, titre, page partagée publiquement. C'est la démo **et** l'oracle de test ;
- un mode démonstration marqué comme tel dans l'interface ;
- un premier balayage borné : l'installation propose de commencer par un espace, pas par le site entier.

## 16. Exigences fonctionnelles

**M** = indispensable pour la soumission, **S** = souhaitable, **C** = après le hackathon.

| N° | Exigence | P |
|---|---|---|
| PW-01 | Détecter les 12 familles dans le corps de page, les commentaires et les titres | M |
| PW-02 | Balayer l'historique de versions et signaler « encore lisible dans la version N » | M |
| PW-03 | Lister les pièces jointes à risque et lire celles dont le texte est extractible | M |
| PW-04 | Empreinte HMAC + aperçu masqué : aucune valeur brute stockée, journalisée ou envoyée au LLM | M |
| PW-05 | Score de danger 0-100 avec **tous** les termes appliqués affichés | M |
| PW-06 | Exposition : lecteurs potentiels (fourchette + méthode), partage public, restrictions | M |
| PW-07 | Surface IA : terme d'exposition, hypothèse affichée comme telle | M |
| PW-08 | Regrouper une empreinte en un foyer avec N emplacements | M |
| PW-09 | Rituel séquentiel : étape 2 verrouillée tant que la rotation n'est pas attestée par une personne | M |
| PW-10 | Caviardage proposé en diff, appliqué `asUser()` après approbation, avec commentaire de version | M |
| PW-11 | Purge d'historique : demande exacte (page, version) à l'administrateur, ou impossibilité déclarée | M |
| PW-12 | Bannière temps réel à l'auteur après publication, avec caviardage en un clic | M |
| PW-13 | Ticket Jira de réparation, assigné au propriétaire résolu | M |
| PW-14 | Résolution de propriétaire en cascade, méthode affichée, file d'adoption | M |
| PW-15 | Registre triable et filtrable, équivalent exact du bâtiment, WCAG AA | M |
| PW-16 | Ruban : faux positif écarté avec raison, personne, date de révision | M |
| PW-17 | Certificat daté et chiffré par espace ou par site | M |
| PW-18 | Balayage incrémental, complet et à la demande, avec curseur de reprise | M |
| PW-19 | Écran de budget et de couverture, angles morts déclarés | M |
| PW-20 | Espace de démonstration semé par script + mode démo | M |
| PW-21 | Outils MCP du § 17 | M |
| PW-22 | Agent Rovo « Gardien du placard » et skill `before-sharing-a-page` | M |
| PW-23 | Un foyer n'est visible que par qui peut lire la page ; sinon agrégats par espace | M |
| PW-24 | Réglages par espace : familles actives, seuils, exclusions, politique de purge | M |
| PW-25 | Le bâtiment (§ 10) | S |
| PW-26 | Datation et graphe de propagation d'une empreinte | S |
| PW-27 | Balayage de pré-activation IA d'un espace | S |
| PW-28 | Modèles de page : détection et avertissement avant création d'une page | S |
| PW-29 | Whiteboards et bases Confluence | C |
| PW-30 | OCR des captures d'écran | C |
| PW-31 | Croisement avec `placard` (Git) : même empreinte, toutes surfaces | C |
| PW-32 | Comparaison anonymisée entre espaces | C |

## 17. Outils MCP, agent Rovo, skill

### Outils, exposés par `rovo:mcp`

| Clé | Verbe | Entrées | Retour |
|---|---|---|---|
| `scan-page` | GET | `pageId` | Foyers de la page : famille, empreinte, aperçu masqué, danger et ses termes |
| `scan-space` | GET | `spaceKey`, `limit` | Balayage borné, état d'avancement |
| `list-exposed-secrets` | GET | `spaceKey?`, `minScore?`, `state?`, `limit` | Foyers triés par danger |
| `get-finding` | GET | `findingId` | Emplacements, état du rituel, exposition, termes du score |
| `trace-fingerprint` | GET | `fingerprint` | Tous les emplacements de cette empreinte sur le site |
| `get-exposure` | GET | `pageId` | Lecteurs potentiels (fourchette), partage, restrictions, surface IA |
| `get-certificate` | GET | `spaceKey?`, `site?` | Résumé daté et chiffré |
| `check-text` | GET | `text` | Empreintes détectées dans un texte **avant** publication |
| `record-rotation` | CREATE | `findingId`, `provider`, `evidenceRef` | Attestation enregistrée (réservée aux personnes) |
| `request-redaction` | CREATE | `findingId`, `scope` | Diff proposé, rien d'appliqué |
| `apply-redaction` | UPDATE | `findingId`, `approvedBy`, `comment` | Appliqué `asUser()` |
| `dismiss-finding` | UPDATE | `findingId`, `reason`, `reviewAt` | Ruban posé |
| `open-remediation-ticket` | CREATE | `findingId`, `projectKey` | Ticket Jira créé et lié |

Aucun outil ne renvoie de valeur brute, et aucun n'en accepte en entrée hors `check-text`, dont le texte n'est ni stocké ni journalisé. `record-rotation` refuse un appel dont l'auteur est un agent : l'attestation est humaine.

### Agent Rovo « Gardien du placard »

Dans Rovo Chat, pour les personnes :

- « Où avons-nous des identifiants lisibles par plus de cent personnes ? »
- « Qui peut lire la page qui contient ce mot de passe ? »
- « Qu'est-ce qui reste à traiter avant l'audit de mars ? »
- « Montre les pages partagées publiquement qui contiennent des chaînes de connexion. »
- « Si on active l'assistant sur l'espace Support, qu'est-ce qu'il verra ? »

L'agent répond avec des empreintes, des emplacements et des scores. Il ne cite jamais une valeur, et dit « je ne peux pas le savoir » quand l'information dépend d'un droit manquant.

### Skill `before-sharing-a-page`

En `SKILL.md`, pour les agents de code qui écrivent dans Confluence : avant de publier un runbook, vérifier son texte avec `check-text` ; si une empreinte apparaît, mettre un lien vers le gestionnaire de secrets au lieu de la valeur ; sinon signaler à un humain. Publiée en source ouverte, comme les autres skills de l'équipe.

## 18. Écrans

1. **Le bâtiment** (`confluence:globalPage`) : ailes, lueurs, caves, courants d'air, registre.
2. **Encart sur la page** (`confluence:contentAction`) : « 2 foyers, danger max 74 », avec l'état du rituel et les actions.
3. **Bannière temps réel** (Forge Realtime) : pour l'auteur, juste après publication.
4. **Fiche de foyer** : emplacements, termes du score, exposition et sa méthode, historique du rituel.
5. **Réglages d'espace** (`confluence:spaceSettingsPage`) : familles, seuils, exclusions, politique de purge, propriétaire par défaut.
6. **Page d'administration** : budget, couverture, angles morts, dernière passe, droits manquants.
7. **File d'adoption** : pages sans propriétaire.
8. **Certificat** : page Confluence générée, datée, chiffrée, partageable.

## 19. Architecture Forge

Une app Confluence, qui lit le Teamwork Graph et écrit des tickets Jira quand le site en a un.

```yaml
# Esquisse, à valider avec forge lint et la vérification du § 22
modules:
  confluence:globalPage:        # le bâtiment, le registre, le budget, l'adoption
  confluence:spaceSettingsPage: # réglages par espace
  confluence:contentAction:     # encart sur la page
  confluence:macro:             # certificat, état d'un foyer dans une page
  trigger:                      # content créé / mis à jour / commenté
  scheduledTrigger:             # incrémental (5 min, un seul) + passe complète
  consumer:                     # balayage long, jusqu'à 900 s
  webtrigger:                   # demandes de purge à l'admin, ponts signés
  action:                       # une entrée par outil MCP
  rovo:mcp:
  rovo:agent:
  rovo:skill:
  sql:
  llm:                          # famille 9 et 11, candidats ambigus uniquement
permissions:
  scopes:                       # read:confluence-content.all, write:confluence-content,
                                # pièces jointes, espaces, restrictions, utilisateurs ;
                                # read:graph:document, read:graph:project (un droit par type)
                                # pas de content.styles: unsafe — on n'exécute aucun contenu tiers
                                # external.images : aucun, sauf besoin démontré en semaine 1
```

### Cinq chaînes de traitement

| Chaîne | Qui l'exécute | Ce qu'elle produit |
|---|---|---|
| Détection à la publication | Déclencheur + Realtime | Bannière à l'auteur, foyer ouvert |
| Balayage incrémental | Déclencheur planifié long | Foyers des pages modifiées, curseur |
| Balayage complet | Déclencheur planifié + consumer | Couverture par espace, budget |
| Exposition | L'app, en arrière-plan | Lecteurs, partage, surface IA, par page |
| Rituel | Une personne, depuis l'écran | Attestations, diffs, sceaux, certificat |

### Ce qu'impose la plateforme

- Une fonction interactive tient en 55 s ; le balayage long passe par `consumer`/déclencheur planifié (jusqu'à 900 s), par tranches avec curseur.
- Cinq déclencheurs planifiés au plus par app, un seul à 5 minutes : incrémental à 5 min, passe complète hebdomadaire.
- Le payload est limité (5 Mo, 500 Ko depuis le front) : les pièces jointes volumineuses sont listées et déclarées non lues.
- L'appel au graphe se fait au nom d'un utilisateur connecté ; un droit manquant ne provoque pas d'erreur mais vide le résultat → l'écran de couverture distingue « pas de droit » de « pas de données ».
- Les modules Rovo (`rovo:mcp`, `rovo:skill`) sont en Preview, l'agent a une fenêtre d'exécution courte : les outils sont des lectures bornées.

### Ce que l'app conserve

Des faits : empreinte, famille, emplacement, score et ses termes, dates, état du rituel, identifiant de l'acteur **pour les seules attestations** (nécessaire à l'audit — ce n'est pas une notation). Jamais de valeur, jamais de texte de page.

## 20. Modèle de données (Forge SQL)

| Table | Colonnes principales |
|---|---|
| `finding` | id, fingerprint_hmac, family, kind, base_score, score, score_terms_json, state, first_seen_at, last_seen_at, rotated_at, rotation_evidence_ref, dismissed_reason, dismissed_review_at |
| `location` | id, finding_id, container_type (page/version/comment/attachment/template/space_desc), container_ari, page_id, version_number, char_start, char_end, masked_preview, detected_at, redacted_at |
| `exposure` | page_id, space_key, readers_low, readers_high, sharing_state, restrictions_json, ai_surface, computed_at |
| `page_scan` | page_id, content_hash, version_scanned, scanned_at, detectors_version, llm_calls, tokens, skipped_reason |
| `attachment_scan` | attachment_id, page_id, filename, mime, size, read_state, skipped_reason, findings_count |
| `ritual_step` | id, finding_id, step, state, actor_ref, attestation_ref, at |
| `purge_request` | id, finding_id, page_id, version_numbers_json, requested_at, requested_by_ref, state, admin_ref |
| `owner_resolution` | page_id, owner_ref, method, confidence, resolved_at |
| `certificate` | id, scope, issued_at, open, rotated, redacted, purged, residual_exposure, blind_spots_json, content_hash |
| `sweep_cursor` | scope, mode, last_page_id, last_modified_at, run_at |
| `budget` | day, pages_scanned, attachments_read, attachments_skipped, llm_calls, tokens, cost_estimate |

Aucune table ne contient de valeur de secret, de texte de page ni de pièce jointe.

## 21. Réutilisation de `placard` (Git)

Règle de la maison : une seule implémentation par logique. `placard` contient déjà, écrit et testé :

| Paquet existant | Réemploi ici |
|---|---|
| `packages/detectors` | Les 9 familles, contrôles mod-97 et Luhn, filtre d'entropie |
| `packages/analysis` | Le score explicable et l'affichage de ses termes |
| `packages/core` | Empreinte HMAC, aperçu masqué, discipline « zéro secret dans les sorties » |
| `packages/ritual` | La séquence et son verrouillage (rotation avant purge) |
| `packages/demo-repo` | Le principe du dépôt synthétique → adapté en espace synthétique |

À écrire : `packages/wiki-source` (lecteurs Confluence : page, version, commentaire, pièce jointe, modèle), `packages/exposure` (lecteurs, partage, surface IA), `packages/propagation` (empreintes jumelles), `packages/forge-app` (modules, outils, écrans).

Forme recommandée : publier `@placard/detectors`, `@placard/analysis` et `@placard/core` depuis le dépôt `placard` et les consommer dans `placard-wiki` — jamais de copie. Fichiers < 500 lignes, fonctions < 50 lignes, CI bornée à 5 minutes par job, `fetch-depth: 1`, Mergify sur PR, socle `repo-bootstrap`.

## 22. Contraintes vérifiées et points à valider

### Vérifié dans la documentation (11 novembre 2026)

- **Fonctions** : 25 s en standard ; jusqu'à 900 s quand la fonction n'est appelée que par un `consumer` ou un déclencheur planifié ; 55 s pour un web trigger, une action ou un agent. Mémoire 512 Mo à 1 Go, `/tmp` 512 Mo éphémère.
- **Payload** : 5 Mo ; depuis une interface custom, requête limitée à 500 Ko.
- **Sorties réseau** : 100 requêtes par minute et par runtime ; limites d'invocation 1 200/min par utilisateur, 7 000/min par installation.
- **Déclencheurs planifiés** : 5 au plus par app, un seul avec un intervalle de 5 minutes. Événements asynchrones possibles pour les traitements longs.
- **LLM hébergé** : Haiku (200K/64K), Sonnet et Opus (1M/128K) ; 100 invites/min par installation, 500K jetons/min par modèle, jusqu'à 5 min d'inférence avec les événements asynchrones.
- **Stockage** : KVS, Entity Store, SQL, Object Store (Preview) ; facturation à la consommation depuis le 1ᵉʳ janvier 2026.
- **Forge Realtime** : disponible sur Jira et Confluence ; événements du backend vers le front, multi-onglets et multi-utilisateurs.
- **Rovo** : `rovo:agent` disponible, fenêtre d'exécution courte, soumis au contrôle de sécurité d'Atlassian ; `rovo:mcp` et `rovo:skill` en Preview ; `rovo:action` = entrées simples.
- **Teamwork Graph** : lecture par GraphQL (requêtes prêtes à l'emploi ou Cypher persisté), au nom d'un utilisateur, un droit par type d'objet, droit manquant = données omises sans erreur ; parmi les 27 types d'objet : `document`, `space`, `project`, `software-service`, `comment`. **L'ingestion dans le graphe interdit les données personnelles, de santé, financières ou RH** — d'où le choix de ne lire que le graphe, jamais d'y écrire.

### À confirmer (vérification en cours au moment de la rédaction)

Les noms exacts des modules Confluence (`confluence:globalPage`, `confluence:spaceSettingsPage`, `confluence:contentAction`, `confluence:macro`), la liste des droits OAuth (`read:confluence-content.all`, `write:confluence-content`…), et les chemins d'API v1/v2 pour versions, commentaires et pièces jointes. Toute l'esquisse du § 19 passe par `forge lint` avant d'être tenue pour vraie.

### À valider par un prototype la première semaine

| Point | Pourquoi | Solution de repli |
|---|---|---|
| Supprimer une version précise d'une page depuis Forge | Fonde l'étape 3 du rituel | Demande groupée à l'administrateur, exposition maintenue élevée |
| Lire le binaire d'une pièce jointe, et jusqu'à quelle taille | Famille 12 | Nom, extension, taille : déclarées « non lues », angle mort affiché |
| Extraire le texte d'un PDF/DOCX/XLSX dans le bundle Forge | Pièces jointes bureautiques | Extensions à risque signalées, sans lecture de contenu |
| État du partage « anyone with the link » lisible par API | Terme d'exposition +10 | Hypothèse conservatrice affichée comme telle |
| Realtime : cibler un utilisateur précis sur une page donnée | Bannière à l'auteur | Commentaire automatique sur la page + notification |
| Whiteboards et bases Confluence accessibles | Couverture | Angle mort déclaré dans l'écran de couverture |
| `asUser()` en écriture sur une page dont l'utilisateur n'est pas propriétaire | Qui peut caviarder | Caviardage limité aux personnes ayant le droit d'édition |
| Volume réel : 50 000 pages en une passe, temps et coût | Le budget | Tranches par espace, priorisation par exposition |
| Résolution des groupes imbriqués pour compter les lecteurs | L'exposition chiffrée | Fourchette basse/haute assumée |

## 23. Exigences non fonctionnelles

- **Zéro secret persisté.** Aucune valeur brute hors de la mémoire d'une exécution : ni SQL, ni journaux, ni invites LLM, ni sorties MCP, ni certificat, ni export.
- **Zéro test de secret.** L'app n'utilise jamais une clé trouvée pour vérifier quoi que ce soit.
- **Explicabilité.** Chaque score montre ses termes ; chaque exposition montre sa méthode ; chaque angle mort est déclaré.
- **Honnêteté sur l'effacement.** Ce qui ne peut pas être effacé est dit, et le foyer reste ouvert.
- **Retenue.** L'app avertit, propose et attend une approbation ; elle ne bloque jamais une publication et ne modifie jamais seule.
- **Attribution humaine.** Une modification de page est faite au nom de la personne qui l'approuve.
- **Pas de fuite par le scanner.** Un foyer n'est visible que par qui peut lire la page ; les autres voient des agrégats par espace. Le scanner ne doit pas devenir un moyen d'apprendre ce qu'on n'a pas le droit de lire.
- **Pas de notation des personnes.** Un propriétaire est nommé pour l'audit, jamais classé.
- **Sobriété.** LLM sur les seuls candidats ambigus, cache par empreinte de contenu, budget affiché.
- **Rapidité.** Encart de page en moins de 2 s depuis le cache ; bannière temps réel en moins de 10 s après publication.
- **Accessibilité.** Registre équivalent au bâtiment, navigation clavier, WCAG AA, aucun décor au détriment du contraste.
- **Langues.** Interface en anglais et en français ; soumission en anglais.

## 24. Cas limites

- Page de configuration déversée d'un coup (300 motifs) : regroupement par famille, un foyer « famille » avec la liste des emplacements.
- Secret dans une capture d'écran : non détecté. Déclaré angle mort, pas silently ignoré.
- Exemple de documentation (`AKIAIOSFODNN7EXAMPLE`) : ruban, empreinte retenue, revalidée à chaque modification de la page.
- Même empreinte dans 6 pages et un modèle : un foyer, sept emplacements, le modèle traité en premier.
- Secret tourné mais texte toujours présent : exposition réduite, foyer **ouvert** tant que le texte est lisible.
- Page supprimée après détection : emplacements « disparus », exposition recalculée ; la corbeille du site est signalée comme résiduelle.
- Espace entier partagé publiquement : multiplicateur appliqué à tout l'espace, alerte en tête de liste.
- Pièce jointe de 40 Mo : « non lue », raison affichée, comptée dans la couverture.
- Faux positif en masse (faux IBAN d'un jeu de données) : seuil de confiance, regroupement, réglage par espace.
- Personne sans droit de lecture sur une page signalée : existence et propriétaire seulement, jamais le contenu.
- Page déplacée ou renommée : le foyer suit l'identifiant de contenu, pas le titre.
- Deux installations sur le même site : empreintes non comparables (clé propre à l'installation), et c'est voulu.

## 25. Recette

1. Une page contenant une clé AWS factice ouvre un foyer de famille « clé cloud », avec empreinte et aperçu masqué.
2. La même clé collée dans un commentaire crée un second emplacement du **même** foyer.
3. La clé retirée de la version courante laisse un emplacement « historique, version 3 », et l'exposition reste élevée.
4. Le secret est présent dans un modèle : le modèle est proposé en premier dans le lot de caviardage.
5. Une page partagée « anyone with the link » ajoute le terme de partage au score, visible dans la fiche.
6. Le score affiche chacun de ses termes, y compris les malus.
7. `apply-redaction` est refusé tant qu'aucune attestation de rotation humaine n'existe.
8. Une attestation déposée par un agent est refusée.
9. Le caviardage appliqué crée une version de page attribuée à la personne qui a approuvé, avec son commentaire.
10. Quand la purge d'historique est impossible, une demande à l'administrateur est créée et le foyer reste ouvert.
11. Une publication contenant un motif déclenche une bannière temps réel pour son auteur en moins de 10 s.
12. Un ruban posé sans raison écrite est refusé ; un ruban est revalidé quand la page change.
13. Un utilisateur sans droit de lecture ne voit ni le contenu ni l'aperçu du foyer.
14. Aucune requête sortante n'est émise vers un fournisseur avec un secret trouvé (vérifié par journalisation des sorties réseau).
15. Aucun journal, aucune sortie MCP, aucun certificat ne contient de valeur brute (test automatisé sur corpus).
16. Le certificat chiffre : foyers ouverts, tournés, caviardés, purgés, exposition résiduelle, angles morts.
17. L'écran de budget affiche les pièces jointes non lues et pourquoi.
18. Un droit manquant sur le graphe apparaît à l'écran de couverture, au lieu d'un zéro silencieux.

## 26. Scénario de la vidéo (moins de 5 minutes, en anglais)

| Temps | Contenu |
|---|---|
| 0:00 – 0:25 | « Everyone scans their repo. Nobody scans their wiki. » Un runbook ordinaire, un tableau d'identifiants, 1 200 lecteurs |
| 0:25 – 0:55 | Le balayage : le bâtiment, les lueurs, les caves ouvertes. 400 motifs, triés, expliqués |
| 0:55 – 1:30 | Une fiche de foyer : les termes du score, l'exposition et sa méthode, la surface IA |
| 1:30 – 2:05 | Le piège : la page est corrigée, le secret reste dans la version 3. « Editing the page removes nothing. » |
| 2:05 – 2:40 | Le rituel : rotation attestée par un humain → caviardage en diff → demande de purge à l'admin |
| 2:40 – 3:05 | La propagation : une empreinte, sept emplacements, un modèle traité en premier |
| 3:05 – 3:25 | La bannière temps réel : l'auteur est prévenu avant que la page soit indexée |
| 3:25 – 3:50 | Agent Rovo et MCP : « what would the assistant see if we enabled it on Support? » |
| 3:50 – 4:15 | Le certificat daté, pour l'auditeur |
| 4:15 – 4:45 | Architecture : Confluence, Forge Realtime, SQL, LLM sur les cas ambigus, graphe en lecture |

## 27. Comment les juges testeront

1. **Espace de démonstration.** Un script sème un faux secret de chaque famille dans chaque gîte, y compris une version historique, un modèle et une page partagée publiquement. Tout est marqué comme synthétique.
2. **Le bâtiment et le registre.** Tri, filtres, fiche de foyer, termes du score.
3. **Le rituel de bout en bout.** Attestation de rotation, diff, caviardage, demande de purge, sceau de cire.
4. **Le temps réel.** Publier une page contenant un motif, voir la bannière.
5. **Agent Rovo et client MCP.** Les questions du § 17, et `scan-page`/`trace-fingerprint` sur l'espace de démo.
6. **Le certificat.** Généré sur l'espace de démo, avec ses chiffres.

Le lien d'installation et les identifiants de démonstration figurent dans la soumission ; la vidéo montre en plus un balayage sur un site réel peuplé.

## 28. Plan jusqu'au 22 décembre

| Semaine | Objectif |
|---|---|
| 11 – 17 nov. | Prototype : les neuf validations du § 22 sur un vrai site (versions, purge, pièces jointes, partage, Realtime) ; publication de `@placard/detectors`, `analysis`, `core` |
| 18 – 24 nov. | Chaîne de détection complète (page, commentaire, historique, modèle), empreinte, score et ses termes |
| 25 nov. – 1ᵉʳ déc. | Exposition (lecteurs, partage, surface IA), foyers multi-emplacements, propagation, résolution de propriétaire |
| 2 – 8 déc. | Rituel : attestation, diff, caviardage `asUser()`, demande de purge, ticket Jira, registre |
| 9 – 15 déc. | Bannière Realtime, outils MCP, agent Rovo, skill, certificat, espace de démo ; **gel des fonctionnalités le 15** |
| 16 – 22 déc. | Recette, bâtiment si le temps le permet, vidéo, instructions pour les juges, soumission, dépôt Marketplace |

Le bâtiment (§ 10) est la seule partie sacrificiable : le registre porte exactement la même information.

## 29. Risques

| Risque | Parade |
|---|---|
| La purge d'historique est impossible depuis Forge | Le produit assume : demande à l'admin, foyer ouvert, exposition maintenue. L'honnêteté est l'argument, pas un défaut |
| Faux positifs noient le signal | Familles déterministes d'abord, LLM sur l'ambigu seulement, rubans, seuils par espace |
| L'app devient elle-même une fuite | § 5 et § 23 : empreinte, aperçu masqué, visibilité limitée aux lecteurs légitimes, tests automatisés |
| Pièces jointes illisibles dans les limites Forge | Couverture déclarée : « non lu, et pourquoi » |
| Volume trop grand pour une passe | Incrémental + priorisation par exposition + budget affiché |
| Perçu comme un scanner de plus | Ce qui le distingue : l'historique de versions, la surface IA, la propagation, le rituel verrouillé |
| Droits OAuth refusés par l'admin | Écran de couverture, mode lecture seule dégradé, demande explicite des droits manquants |
| Contrôle de sécurité d'Atlassian sur l'agent Rovo | L'agent ne manipule jamais de valeur brute, seulement des empreintes |
| Délai de revue Marketplace | Soumission au listing dès le 16 décembre, ticket de revue fourni comme preuve |

## 30. La vision poussée à l'extrême

- **Le wiki propre par construction.** Plus aucun secret écrit : la bannière temps réel, le skill des agents et le remplacement proposé par un lien vers le gestionnaire de secrets font que la fuite n'a plus le temps d'exister.
- **Une empreinte, toutes les surfaces.** Le même HMAC relie Git (`placard`), Confluence, les commentaires Jira et les tickets JSM : un secret qui a fui quelque part est suivi partout, avec sa date d'apparition et sa date de révocation.
- **La question de 2026.** « Qu'est-ce que je donne à lire à mon IA ? » devient une réponse chiffrée, par espace, avant chaque activation d'assistant — et un certificat à l'appui.
- **L'assurance continue.** Un certificat permanent, signé et daté, pour SOC 2 et ISO 27001 : plus de campagne ponctuelle avant l'audit.
- **La mesure des habitudes.** « Ce secret a été recopié quatre fois en neuf mois, dont trois par duplication de page » : on ne blâme personne, on corrige le modèle et la procédure.
- **L'adoption comme politique.** Aucune page sans propriétaire : la file d'adoption se vide, et l'espace a une responsabilité explicite.
- **Le score de propreté d'un espace** comme indicateur de santé collective — jamais individuel.

## 31. Liens avec les autres cahiers des charges

- **`placard` (Git, Kiroween)** : mêmes familles, même empreinte, même rituel, même bâtiment. Les paquets `detectors`, `analysis`, `core`, `ritual` sont partagés, pas copiés (§ 21).
- **Tickets piégés** : il encadre le texte qui *entre* dans JSM ; celui-ci traite le texte *déjà écrit* dans Confluence. Même discipline : le texte externe est une donnée, jamais une instruction.
- **Fait, preuve à l'appui** : l'attestation de rotation est une preuve *attestée*, avec la même grille de force (machine / tierce / déclarée) que le sceau de cire.
- **Le coût réel de la dette** : même discipline des chiffres — fourchette, méthode affichée, preuve derrière chaque nombre.
- **Permis d'agir** : un agent qui écrit dans Confluence le fait sous permis ; le skill `before-sharing-a-page` s'appuie sur ce registre.
- **Brief de contexte** : sa règle de masquage unifié des secrets s'applique ici — un brief ne transporte jamais une valeur trouvée par le placard.

## 32. Sources

- [Codegeist 2026](https://codegeist2026.devpost.com/) et ses [ressources](https://codegeist2026.devpost.com/resources)
- [Modules du manifeste Forge](https://developer.atlassian.com/platform/forge/manifest-reference/modules/) · [Forge Realtime](https://developer.atlassian.com/platform/forge/realtime/)
- [Limites d'exécution](https://developer.atlassian.com/platform/forge/limits-invocation/) · [LLM hébergé](https://developer.atlassian.com/platform/forge/ai/) · [Stockage](https://developer.atlassian.com/platform/forge/storage-api/)
- [Modules Rovo](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-agent/) · [`rovo:mcp`](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-mcp/) · [`rovo:skill`](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-skill/)
- [Teamwork Graph : API](https://developer.atlassian.com/platform/teamwork-graph/call-the-teamwork-graph-api/) · [connecteur](https://developer.atlassian.com/platform/teamwork-graph/build-a-teamwork-graph-connector/) · [types d'objet](https://developer.atlassian.com/platform/teamwork-graph/api-reference/object-types/overview/)
- [API Confluence Cloud](https://developer.atlassian.com/cloud/confluence/rest/intro/) · [permissions et partages](https://developer.atlassian.com/cloud/confluence/rest/api-group-content---restrictions/)
- [Publication d'une app Forge au Marketplace](https://developer.atlassian.com/platform/marketplace/listing-forge-apps/)
- Dépôt `BaptisteFaisy/placard` (moteur de détection, score explicable, rituel) · rapport de vérification `inventaire-codegeist/D-marche-forge.md` et `E-verif-confluence.md`
