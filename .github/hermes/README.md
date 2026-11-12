# `.github/hermes/` — les agents de la file de merge

**Hermes** est le nom du système qui résout les conflits de ce dépôt : trois
agents, trois problèmes distincts, et jamais une porte de merge — seule la CI
verte fait merger. Tous sont lus sur `origin/main` par le balayeur
(`pr-auto-merge.yml`), jamais sur la branche d'une PR (un juge ne s'écrit pas
dans le prétoire), et n'écrivent que du texte ou des puces vérifiées.

La jambe modèle est **InferHub** (`combo/cheap`) ; si l'API refuse, la même
question est reposée à l'agent `hermes` du daemon ZeroClaw du runner (repli A2A).
Sans aucune des deux jambes : rien n'est poussé, la PR est commentée et
étiquetée pour un humain. Jamais d'échec silencieux.

## Fichiers

| Fichier | Rôle |
|---|---|
| `conflict_agent.py` | résolveur de conflits : rebase, résolution conflit par conflit, push avec bail, compte rendu |
| `scope_agent.py` | agent de périmètre : rédige le `## Scope` manquant et le fait valider par le garde de `main` |
| `test_agent.py` | agent de test rouge : lit le journal + l'indice de triage, corrige dans le clone, ne pousse que si ça compile |
| `fournisseur.py` | **une seule** définition des réglages du modèle (InferHub par défaut) + chargement du repli A2A |
| `a2a.py` | client A2A du daemon ZeroClaw (repli : alias `hermes`) |
| `texte.py` | découpe en hunks, recopie du fichier intact, marques de conflit restantes |
| `union_journal.py` | union déterministe des journaux en ajout pur (aucune saisine de modèle) |
| `quota.py` | empreintes, cooldown, plafonds de saisine |
| `compilation_gate.py` | porte de validation : la toolchain du dépôt avant tout push (py_compile, docs UTF-8, YAML, `pnpm verify`, Gradle) ; un contrôle impossible est sauté **et dit** |
| `sonde.py` | sonde vivante de la jambe modèle (`hermes-probe.yml`), aucun secret imprimé |
| `test_*.py` | selftests stdlib, aucun réseau, aucune clé (dont `test_compilation_gate.py`) |

Vue longue (architecture, décisions, exercice de conflit) : [`docs/HERMES.md`](../../docs/HERMES.md).

## Agent de conflit (`conflict_agent.py`)

Quand le sweep de `pr-auto-merge` échoue à rebaser une PR, il appelle
`conflict_agent.py` dans son clone, rebase en cours. L'agent demande à un modèle
la résolution de chaque fichier en conflit, termine le rebase, pousse sur la
branche de la PR avec bail et rend compte en commentaire. La file reprend au
passage suivant ; seule la CI verte fait merger.

**Fournisseur** : InferHub (`https://api.inferhub.dev/v1/chat/completions`,
modèle `combo/cheap`) par défaut. Les variables historiques `FIREWORKS_*`
restent lues en repli, les variables génériques `MODEL_API_KEY`,
`MODEL_API_URL` et `MODEL_NAME` ont la priorité : changer de fournisseur ne
demande plus de toucher au code. Si l'API refuse (clé, quota, modèle retiré),
un second repli interroge l'agent `hermes` du daemon ZeroClaw du runner
(`.github/hermes/a2a.py`).

Les journaux en ajout pur (`CHANGELOG.md`, `CHANGELOG`) ne passent jamais par le
modèle : deux entrées écrites en tête de fichier ne sont pas un désaccord, elles
sont réunies sans perte (`union_journal.py`, `union_sans_perte`). Un bloc qui
remplacerait une ligne commune, lui, reste au modèle. C'est ce qui a arrêté la
boucle du 29/10 (#215 rebasée six fois sur `CHANGELOG.md`, une saisine et un
quota par rebase). Les empreintes et plafonds vivent dans `quota.py`.

Les deux modules sont chargés par `conflict_agent.py` depuis `origin/main`
(import direct d'abord) : le sweep ne copie que le script d'agent dans `/tmp`,
et une branche de PR peut être antérieure à ce découpage.

## Contrat d'appel

```bash
MODEL_API_KEY=... python3 conflict_agent.py resolve \
  --repo BaptisteFaisy/placard-wiki --pr 118 --branch feat/x --sha <tête>
```

Le script est lu sur `origin/main` (pas sur la branche de la PR, qui peut
être antérieure). Sorties : `0` poussé, `1` échec avec compte rendu,
`2` rien à faire (l'appelant saute sans bruit).

## Réglages

| Variable / secret | Défaut | Effet |
|---|---|---|
| secret `INFERHUB_API_KEY` (passé en `MODEL_API_KEY`) | — | sans clé, aucun agent ne saisit le modèle |
| var `MODEL_NAME` | `combo/cheap` | modèle interrogé |
| var `MODEL_API_URL` | `https://api.inferhub.dev/v1/chat/completions` | point d'API |
| var `HERMES_AGENT_RESOLVE` | `1` | `0` coupe le résolveur de conflits sans toucher au code |
| var `HERMES_AGENT_SCOPE` | `1` | `0` coupe l'agent de périmètre |
| secret/var `FIREWORKS_*` | — | **noms historiques**, lus en repli seulement |

Changer de fournisseur ne demande plus de toucher au code : `MODEL_*` a la
priorité, `FIREWORKS_*` reste accepté, les défauts du module sont InferHub.

## Repli A2A (daemon ZeroClaw du runner)

Quand l'API du fournisseur refuse (clé expirée, quota, `HTTP 412`, modèle
retiré), `fournisseur.py` charge `a2a.py` et la même question est posée à
l'agent `hermes` du daemon ZeroClaw de la machine du runner (`POST /a2a/hermes`,
JSON-RPC `SendMessage`). Un seul pilote de résolution, deux chemins vers le
modèle. Jetons essayés dans l'ordre, jamais écrits dans le dépôt :
`~/.zeroclaw/data/gateway-admin.token`, `~/.config/zeroclaw-serveur/token`,
`/opt/zeroclaw/ephem/data/gateway-admin.token`.

| Variable | Défaut | Rôle |
|---|---|---|
| `HERMES_ZC_URL` | `http://127.0.0.1:42617` | passerelle du daemon (locale au runner) |
| `HERMES_ZC_AGENT` | `hermes` | alias de l'agent saisi |
| `HERMES_ZC_TOKEN_FILE` | voir ci-dessus | jeton client A2A |
| `HERMES_AGENT_TIMEOUT` | `300` | secondes d'attente du chat |

Garanties du repli : **aucune exception** (sans jeton, sans daemon ou sur
réponse illisible, `hermes_complete` rend `None` et l'appelant conserve son
erreur d'origine) ; **aucun push supplémentaire** (le périmètre d'écriture
reste la branche de la PR) ; **mêmes garde-fous** (cooldown, plafonds, porte de
compilation) ; succès jugé sur l'**état réel de la PR**, jamais sur le récit du
modèle.

## Sonde vivante

`hermes-probe.yml` (`workflow_dispatch` + lundi 06:25 UTC) joue les selftests
hors ligne puis une invite triviale au fournisseur :

```bash
python3 .github/hermes/sonde.py --selftest   # hors ligne, sans clé
python3 .github/hermes/sonde.py              # sonde vivante (clé par l'env)
```

Codes : `0` la jambe répond, `1` refus ou réponse inattendue, `3` aucune clé.
La sonde n'imprime **jamais** la clé (aperçu masqué `sk-…(32)`), ni les
en-têtes, ni le corps brut de la réponse. Ce n'est pas un check requis de la
file : une sonde rouge prévient, elle ne bloque pas une PR.

## Garde-fous

Empreinte par tête de PR + cooldown 20 min, plafond 10 saisines/heure (`SPAWN_CAP`)
et 3 saisines par PR en 30 min (`SAISINES_PR_MAX` : une PR ne peut pas brûler
tout le quota horaire à elle seule), 100 fichiers max, refus des conflits sous
`.github/`, des binaires et des fichiers de plus de 200 Ko, budget 240 s, push
avec bail uniquement. Le dry-run ne consomme ni empreinte ni quota, et l'union
déterministe des journaux ne consomme rien du tout.
Labels `hold` / `intervention-humaine` : main humaine, aucune saisine.
Succès : label `agent-conflit`. Le modèle ne voit que les bords du conflit,
jamais aucun secret.

Recette : `python3 conflict_agent.py resolve --dry-run --repo BaptisteFaisy/placard-wiki
--pr N` affiche les prompts sans rien appeler (dans un clone en conflit).

## Agent de périmètre (`scope_agent.py`)

Une PR dont le corps n'a pas de `## Scope` (ou dont la section ne couvre pas tous
les fichiers modifiés) est refusée par `couche0`, donc vue `BLOCKED` par le
balayeur. L'agent lit le diff, rédige une puce ``- `chemin` — raison`` par
fichier en français, puis **rejoue `check_scope` du garde de `main`** sur le
corps recomposé avant d'écrire : fichier non déclaré et déclaration inutile
restent refusés. Ce n'est pas un contournement du garde, c'est la déclaration
manquante qui est écrite.

```bash
MODEL_API_KEY=... python3 scope_agent.py fix \
  --repo BaptisteFaisy/placard-wiki --pr 215 --sha <tête> --guard /tmp/check_couche0.py
```

Sorties : `0` corps complété (un commentaire porte le marqueur `automerge-scope`
avec la tête, donc une seule tentative par commit), `1` échec avec compte rendu,
`2` rien à faire. Réglages : les mêmes que l'agent de conflit (une seule
source, `fournisseur.provider_settings()`), `HERMES_AGENT_SCOPE=0` pour couper.
Plafond 25 fichiers ;
au-delà, label `intervention-humaine` et main humaine.

Une puce rendue sous forme de glob ou de dossier (`app/**/Settings*.kt`,
`docs/`) est rapprochée du fichier avec la **règle du garde** (`matches`), pas
par égalité de chaîne : le 29/10, un glob juste était compté comme absent et la
PR restait bloquée sur « le modèle n'a rien rendu ». Si des fichiers manquent
encore, une **relance ciblée** ne redemande qu'eux, avec leur diff ; la réponse
du modèle est journalisée au moindre échec.

## Indice de triage (`--indice`)

L'agent ne part plus du seul journal. Le workflow `triage-rouge` relance le
test tombé seul et écrit son verdict dans `/tmp/triage.txt` (test, périmètre,
rejeu isolé) ; `test_agent.py fix --indice /tmp/triage.txt` l'ajoute au prompt,
sous « Triage automatique (déjà fait, ne le refais pas) ».

C'est ce qui manquait sur le dépôt d'origine (PR #919) : le test tombé n'était
pas dans le diff, le coupable était le nouveau test de la PR (état partagé de la
séance laissé sale), et l'agent — lancé sans indice — a rendu « budget de
150 s dépassé », deux fois.

Sans `--indice`, le comportement est celui d'avant (journal seul). L'option est
facultative et ne casse aucun appelant : le balayeur peut la passer aussi.

## Validation

```bash
python3 .github/hermes/sonde.py --selftest
for f in .github/hermes/test_a2a.py .github/hermes/test_conflict_agent.py \
         .github/hermes/test_provider.py .github/hermes/test_quota.py \
         .github/hermes/test_scope_agent.py .github/hermes/test_union_journal.py; do
  python3 "$f" || echo "ÉCHEC $f"
done
```

Aucun réseau, aucune clé. Le job `ci` les rejoue à chaque PR ; `hermes-probe`
y ajoute la sonde vivante.
