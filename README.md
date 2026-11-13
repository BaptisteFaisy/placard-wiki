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

## Voir le produit

Tester sans rien installer : le site de démonstration public
<https://tradoooo.github.io/placard-wiki/> montre le registre, le bâtiment,
le rituel en démo locale et le certificat — données 100 % synthétiques.

L'app Forge réelle (v2.0.0, `forge lint` 0 erreur, build/deploy/install
vérifiés le 12 novembre 2026) tourne sur le site de démonstration
`one-atlas-cndz.atlassian.net` avec son espace semé `PLACARDDEMO` —
voir [`docs/JUGES.md`](docs/JUGES.md) et [`docs/VALIDATION-22.md`](docs/VALIDATION-22.md).

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

## File de merge et résolution de conflits (Hermes)

Le merge est piloté par Mergify (file, squash, une PR = un commit) et la seule
porte est la CI verte (`ci`, `ci-budget`, `couche0`). Une PR en **conflit** ne
reste pas bloquée : le balayeur `pr-auto-merge` saisit **Hermes**
(`.github/hermes/`), qui résout le conflit hunk par hunk avec sa jambe modèle
**InferHub** (`combo/cheap`, repli A2A vers le daemon ZeroClaw du runner),
valide avec la toolchain du dépôt, et pousse sur la branche de la PR en
`--force-with-lease`. Jamais de merge par l'agent, jamais de push sur `main`,
jamais d'échec silencieux : une résolution qui ne compile pas n'est pas poussée
et un humain est étiqueté.

Vérifier la jambe modèle : `python3 .github/hermes/sonde.py --selftest`
(hors ligne) puis `python3 .github/hermes/sonde.py` (sonde vivante, aucun secret
imprimé) — ou le workflow `hermes-probe`. Détail : [`docs/HERMES.md`](docs/HERMES.md).

## La jambe modèle de l'app (l'oracle)

L'oracle de l'app (le juge des candidats ambigus) parle à **InferHub**
(`combo/cheap`) lui aussi, mais **par un relais** : Forge n'accepte en sortie
externe que de l'authentification `oauth2`, et la clé d'InferHub est une clé
statique `sk-…`. Le relais (r630) garde la clé, l'app Forge lui parle en HTTPS
avec un jeton de service (variable Forge, hors du dépôt) et n'a le droit de
sortir que vers cet hôte — la garde réseau du dépôt le verrouille. Si le relais
ne répond pas, l'app retombe sur le LLM hébergé de Forge, et le dit. Détail :
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §3.

## Documentation

- `docs/ARCHITECTURE.md` — chaînes de traitement, limites Forge, réemploi de `placard`
- `docs/VALIDATION-22.md` — les 9 points à valider par un prototype sur un vrai site
- `docs/RECETTE-25.md` — la recette du cahier des charges, cas par cas
- `docs/HERMES.md` — le système de résolution de conflits, sa jambe InferHub et ses garde-fous
- `docs/JUGES.md` — comment tester en 10 minutes (espace de démo, MCP, Rovo)

## Licence

MIT — voir [LICENSE](LICENSE).
