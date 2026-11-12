# Hermes — le système qui résout les conflits de ce dépôt

> Référence : `.github/hermes/` (code et selftests), `.github/workflows/pr-auto-merge.yml`
> (le balayeur qui saisit les agents), `.github/workflows/hermes-probe.yml` (la
> sonde vivante). Vue courte : [`.github/hermes/README.md`](../.github/hermes/README.md).
>
> **Hermes** est le nom du système, **InferHub** (`combo/cheap`) est sa jambe
> modèle. Le dossier s'appelait `.github/fireworks/` : il a été renommé le
> 12 novembre 2026 pour que le nom dise ce que fait le système, et les noms
> d'environnement historiques `FIREWORKS_*` restent lus en repli (rien n'est
> cassé sur une installation qui n'a pas encore la clé InferHub).

## 1. Le problème, et ce que Hermes y change

Une file de merge automatique s'arrête net sur une PR en conflit : GitHub ne
peut pas la rebaser, Mergify ne peut pas la prendre, et sans humain la PR
pourrit. Sur ce dépôt, le conflit est traité **dans la minute** par un agent :

1. le balayeur `pr-auto-merge` constate `mergeable_state = dirty` sur une PR
   interne (ni fork, ni brouillon verrouillé, ni label `hold`) ;
2. il clone le dépôt dans un dossier jetable, entame le rebase sur `origin/main`
   et **extrait les modules Hermes depuis `origin/main`** — jamais depuis la
   branche de la PR (un juge ne s'écrit pas dans le prétoire) ;
3. `conflict_agent.py` demande au modèle la résolution de **chaque conflit
   élémentaire** (hunk par hunk), recopie le reste du fichier intact (jamais de
   réécriture complète : un gros fichier serait tronqué), et termine le rebase ;
4. les journaux en ajout pur (`CHANGELOG.md`) ne passent **pas** par le modèle :
   deux entrées écrites en tête de fichier ne sont pas un désaccord, elles sont
   réunies sans perte (`union_journal.py`) ;
5. la **porte de compilation** (`compilation_gate.py`) rejoue la toolchain du
   dépôt : une résolution qui ne passe pas n'est **jamais poussée** ;
6. le push se fait en `--force-with-lease` sur **la branche de la PR uniquement**,
   avec l'identité du propriétaire (un push `@github-actions[bot]` naîtrait en
   `action_required`, sans aucun check requis — PR bloquée à jamais) ;
7. un **compte rendu unique** par PR est publié, et le succès est jugé sur
   l'**état réel de la PR** (`mergeable_state` relue), jamais sur le récit du
   modèle.

Ensuite la file Mergify reprend la main : **seule la CI verte fait merger**.
Hermes n'a jamais le pouvoir de merger, ni d'écrire sur `main`, ni de toucher
aux gardes (`REFUSED_PREFIXES = .github/, .mergify.yml`).

## 2. Les trois agents

| Agent | Saisi quand | Ce qu'il écrit |
|---|---|---|
| `conflict_agent.py` | rebase en conflit (`DIRTY`) | des commits sur la branche de la PR, après porte de compilation |
| `scope_agent.py` | `couche0` rouge sur le périmètre (`## Scope` absent ou incomplet) | le corps de la PR, **validé d'abord par le garde de `main`** |
| `test_agent.py` | échec réel d'un test requis | un correctif borné dans le clone, poussé seulement s'il compile |

L'agent de périmètre ne contourne pas la garde : il rédige la déclaration
manquante (une puce `` - `chemin` — raison `` par fichier, en français), puis
rejoue `check_scope` du garde sur le corps recomposé. Un fichier non déclaré et
une déclaration inutile restent refusés.

`test_agent.py` ne part pas du seul journal : le workflow `triage-rouge` relance
d'abord le test tombé isolément et écrit son verdict dans `/tmp/triage.txt`,
passé en `--indice`. C'est la leçon d'un dépôt voisin (relevé antérieur, hors de
cet arbre) : sans indice, l'agent rendait « budget dépassé » sur un test qui
n'était même pas dans le diff.

## 3. La jambe modèle : InferHub, et son repli

**Une seule définition des réglages**, dans `.github/hermes/fournisseur.py`
(`provider_settings()`) : les trois agents y lisent la même clé, le même modèle
et la même URL. Aucun agent ne redéfinit ses propres défauts — sinon l'un
d'eux pourrait repartir sur un autre fournisseur sans que rien ne casse.

| Priorité | Source | Valeur posée sur ce dépôt |
|---|---|---|
| 1 | noms génériques `MODEL_API_KEY`, `MODEL_NAME`, `MODEL_API_URL` | secret `INFERHUB_API_KEY` → `MODEL_API_KEY` ; vars `MODEL_NAME=combo/cheap`, `MODEL_API_URL=https://api.inferhub.dev/v1/chat/completions` |
| 2 | noms historiques `FIREWORKS_API_KEY`, `FIREWORKS_MODEL`, `FIREWORKS_BASE_URL` | conservés en repli |
| 3 | défauts du module | InferHub `combo/cheap` |

Si l'API refuse (clé expirée, quota, `HTTP 412`, modèle retiré), `fournisseur.py`
charge `a2a.py` et la **même question** est posée à l'agent `hermes` du daemon
ZeroClaw de la machine du runner (`POST /a2a/hermes`, JSON-RPC `SendMessage`).
Un seul pilote de résolution, deux chemins vers le modèle.

Sans aucune des deux jambes : rien n'est poussé, la PR reçoit un commentaire et
le label `intervention-humaine`. **Aucun chemin ne « réussit » en silence.**

Le modèle ne voit jamais un secret : il reçoit les bords du conflit, pas le
dépôt, et le garde `couche0` refuse toute clé en clair dans les lignes ajoutées.

## 4. Garde-fous

- **Quota** (`quota.py`) : empreinte par tête de PR, cooldown 20 min, plafond
  10 saisines/heure, 3 saisines par PR en 30 min. Le dry-run ne consomme rien,
  l'union déterministe des journaux non plus.
- **Périmètre d'écriture** : la branche de la PR, point. Refus des conflits sous
  `.github/` et `.mergify.yml`, des binaires, des fichiers > 200 Ko, plafond
  100 fichiers (25 pour le périmètre), budget 240 s.
- **Fichiers dérivés** : jamais soumis au modèle — un verrou (`pnpm-lock.yaml`),
  un sous-module (`vendor/placard`) ou un artefact se **régénère**, il ne se
  réconcilie pas à la main. Le côté de la base est conservé et le rapport dit
  « à régénérer ».
- **Push** : `--force-with-lease` uniquement, avec bail sur la tête attendue —
  un push d'auteur arrivé entre-temps fait échouer l'opération au lieu d'être
  écrasé.
- **Main humaine** : les labels `hold` et `intervention-humaine` coupent toute
  saisine.

## 5. Vérifier que la jambe répond

```bash
python3 .github/hermes/sonde.py --selftest   # hors ligne, sans clé, aucun réseau
python3 .github/hermes/sonde.py              # sonde vivante (clé par l'env)
```

Codes : `0` la jambe répond, `1` refus ou réponse inattendue, `3` aucune clé.
La sonde n'imprime jamais la clé (aperçu masqué du type `sk-…(32)`), ni les
en-têtes, ni le corps brut de la réponse. Le workflow `hermes-probe.yml` la joue
à la demande et chaque lundi ; ce n'est **pas** un check requis : une sonde
rouge prévient, elle ne bloque pas une PR.

Selftests des agents (stdlib, aucun réseau, aucune clé) :

```bash
for f in .github/hermes/test_*.py; do python3 "$f" || echo "ÉCHEC $f"; done
```

(`test_agent.py` n'est pas un fichier de tests malgré son nom : c'est l'agent de
test rouge, son propre fichier de tests est `test_test_agent.py`.)

## 6. Exercice de conflit (drill)

Pour prouver la chaîne sans attendre un vrai conflit d'auteur :

1. depuis `main`, une branche `drill/hermes-base` ajoute un fichier
   `docs/DRILL-HERMES.md` avec une ligne commune et une ligne « A » ;
2. une seconde branche `drill/hermes-conflit`, **depuis le même `main`**, ajoute
   le même fichier avec la même ligne commune et une ligne « B » ;
3. la PR « base » est mergée par la file (CI verte) ; la PR « conflit » passe
   `DIRTY` ;
4. au passage suivant du balayeur (≤ 5 min), l'agent résout : les **deux
   intentions** doivent être présentes dans le fichier rebasé, la porte de
   compilation doit passer, le push porter l'identité du propriétaire, et un
   commentaire de compte rendu doit être posé ;
5. relever : heure du conflit, heure de la résolution, nombre de saisines,
   verdict `mergeable_state` après push. Un drill se note dans ce fichier —
   une preuve non datée n'est pas une preuve.

## 7. Ce que Hermes ne fait pas

- il ne merge jamais, et ne décide jamais qu'une PR est bonne : la CI verte est
  la seule porte ;
- il n'écrit jamais sur `main`, ni dans `.github/`, ni dans `.mergify.yml`, ni
  dans les gardes ;
- il ne pousse jamais une résolution qui ne compile pas ;
- il ne prétend jamais avoir réussi : le succès est relu sur l'état de la PR, et
  un échec laisse un commentaire lisible et un label humain ;
- il ne journalise aucune clé : les journaux portent l'empreinte de la saisine,
  le code HTTP et le nom du modèle.
