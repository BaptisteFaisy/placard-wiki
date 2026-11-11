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
