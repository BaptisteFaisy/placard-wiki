# Contribuer à Placard du wiki

## Les règles du dépôt (gardées par la CI)

1. **Taille** : tout fichier de code fait moins de **500 lignes** ; toute
   fonction fait moins de **50 lignes** (`tools/check_limits.py`). Au-delà :
   découper, jamais laisser grossir.
2. **Zéro duplication** : une seule implémentation par logique. Les familles
   de détection, l'empreinte HMAC et le score explicable vivent dans
   `vendor/placard` (sous-module) — on les **importe**, on ne les recopie
   pas. Le code wiki-specific vit dans `packages/`.
3. **Zéro secret brut** : aucune valeur réelle de secret dans le code, les
   fixtures, les tests, les journaux ou la documentation. Les tests utilisent
   les valeurs factices de `@placard/core` (`fake-values.ts`) et les faux
   secrets de `packages/demo-space`. Toute sortie (types, MCP, certificat)
   passe par empreinte HMAC + aperçu masqué.
4. **CI bornée** : chaque job déclare `timeout-minutes: 5` au plus
   (`.github/ci-budget/check_timeouts.py`), `concurrency` +
   `cancel-in-progress`, `fetch-depth: 1`.
5. **Branches** : toute branche poussée a son PR dans la minute (draft si
   WIP) ; merge ou fermeture → branche supprimée côté GitHub et en local.

## Conventions TypeScript

- ESM strict (`"type": "module"`), résolution **Bundler** : les imports
  relatifs sont **sans extension** (`import { x } from './x';`). C'est la
  forme exigée par le bundler Forge (webpack ne résout pas `./x.js` vers
  `x.ts` — contrainte mesurée par `forge build`, voir `docs/VALIDATION-22.md`).
- Les imports de paquets passent par les alias du workspace
  (`@placard/core`, `@placard-wiki/domain`, …) — jamais de chemin relatif
  entre paquets.
- `strict: true`, `noUncheckedIndexedAccess: true` : pas de `any`, pas
  d'accès tableau non gardé.
- Tests à côté du code : `src/xyz.test.ts`, vitest.

## Vocabulaire (discipline du cahier des charges §4)

**présent** (motif reconnu) ≠ **exposé** (quelqu'un peut lire) ≠ **vivant**
(on ne le sait jamais) ≠ **révélé** (aucune preuve d'accès). L'app ne dit
jamais « cette clé est active » : elle dit « rotation inconnue depuis N
jours ». Elle ne teste jamais un secret trouvé.

- **Empreinte** : HMAC-SHA-256 du secret, clé propre à l'installation.
- **Aperçu masqué** : `AKIA…(20)` — famille visible, valeur inutilisable.
- **Foyer** : une empreinte et son état de réparation (N emplacements).
- **Gîte** : la nature de l'emplacement (les sept endroits du §6).
- **Danger** : score 0-100 dont **chaque terme appliqué est affiché**.
- **Rituel** : tourner → caviarder → purger → empêcher → vérifier.
- **Sceau de cire** : foyer clos. **Ruban** : faux positif écarté, daté.

## Structure d'un paquet

```
packages/<nom>/
├── package.json        # @placard-wiki/<nom>, "main": "./src/index.ts"
└── src/
    ├── index.ts        # exports publics
    ├── *.ts            # < 500 lignes chacun
    └── *.test.ts       # vitest, à côté du code
```

Les contrats entre paquets (types de données, noms de méthodes du bridge,
catalogue des termes du score) vivent dans `@placard-wiki/domain` : on les
modifie là d'abord, jamais en double dans un consommateur.
