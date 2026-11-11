# Placard du wiki — *Placard for Confluence*

> Codegeist 2026 · catégorie **Apps for Business Teams** (transversal sécurité/support)
> Bonus visés : Agents Rovo (principal), MCP, Marketplace ; Teamwork Graph en appoint

**Tout le monde scanne son dépôt. Personne ne scanne son wiki.**

Or c'est dans Confluence que vivent, en clair, les tableaux d'identifiants des
runbooks, le mot de passe du compte de service, la clé d'API du prestataire
collée « pour dépanner », le DSN de la base de staging, l'export client en
pièce jointe, le NIR d'un collaborateur dans un tableau RH.

L'app trouve les secrets et les données personnelles qui dorment dans le wiki —
corps de page, commentaires, pièces jointes, modèles et **historique de
versions** —, chiffre qui peut les lire (humains et IA compris), et conduit la
réparation dans le bon ordre : **tourner la clé d'abord, caviarder ensuite,
prouver à la fin**.

## Ce que l'app ne fait pas

Autant le dire avant, c'est ce qui la rend crédible :

- elle **n'utilise jamais** un secret trouvé (aucun appel vers AWS, Stripe ou GitHub avec la clé lue) ;
- elle **ne stocke jamais** la valeur brute : ni en base, ni dans les journaux, ni dans les invites au LLM, ni dans le certificat ;
- elle **ne modifie jamais** une page sans l'approbation explicite d'une personne, au nom de cette personne ;
- elle **ne prétend jamais** avoir effacé ce qu'elle ne peut pas effacer (l'historique de versions) ;
- elle **ne note personne** : un propriétaire est nommé quand l'audit l'exige, jamais classé.

## Le dépôt

Monorepo pnpm. Les familles de détection, le score explicable, l'empreinte HMAC
et la discipline « zéro secret dans les sorties » proviennent de
[`placard`](https://github.com/BaptisteFaisy/placard) (Git), **réutilisés sans
copie** via le sous-module `vendor/placard` (épinglé ; la publication npm de
`@placard/detectors`, `@placard/analysis` et `@placard/core` est la forme
cible — voir `docs/ARCHITECTURE.md`).

| Paquet | Rôle |
|---|---|
| `packages/domain` | Types partagés : foyers, gîtes, termes du score, schéma SQL (§20), contrat bridge |
| `packages/wiki-source` | Lecteurs Confluence : page, version, commentaire, pièce jointe, modèle, CQL, curseurs |
| `packages/detectors` | Familles wiki (chaînes de connexion, tableaux d'identifiants, pièces jointes) + pipeline de scan |
| `packages/exposure` | Lecteurs potentiels (fourchette + méthode), partage, surface IA, score de danger et ses termes |
| `packages/propagation` | Une empreinte → un foyer, N emplacements ; datation ; le modèle d'abord |
| `packages/ritual` | Tourner (attestation humaine) → caviarder (diff, `asUser()`) → purger (ou le dire) → empêcher → vérifier ; certificat |
| `packages/forge-app` | L'app Forge : manifeste, résolveurs, déclencheurs, SQL, outils MCP, agent Rovo, écrans |
| `packages/demo-space` | Espace de démonstration semé par script (la démo **et** l'oracle de test) |
| `packages/forge-app/skills/before-sharing-a-page` | Skill ouvert pour les agents qui écrivent dans Confluence |

## Développement

Prérequis : Node ≥ 22, pnpm 9 (via corepack), Python 3 (gardes CI).

```bash
git clone --recurse-submodules https://github.com/BaptisteFaisy/placard-wiki
cd placard-wiki
corepack enable && corepack prepare pnpm@9.15.9 --activate
pnpm install
pnpm verify        # typecheck + tests + limites de taille + cohérence du manifeste
```

Règles du dépôt (gardées par la CI) : fichiers < 500 lignes, fonctions < 50
lignes, aucune valeur brute de secret nulle part (les tests utilisent les
valeurs factices de `@placard/core`), verdict CI en 5 minutes maximum.
Voir `CONTRIBUTING.md`.

## Documentation

- `docs/ARCHITECTURE.md` — chaînes de traitement, limites Forge, réemploi de `placard`
- `docs/VALIDATION-22.md` — les 9 points à valider par un prototype sur un vrai site
- `docs/RECETTE-25.md` — la recette du cahier des charges, cas par cas
- `docs/JUGES.md` — comment tester en 10 minutes (espace de démo, MCP, Rovo)

## Licence

MIT — voir [LICENSE](LICENSE).
