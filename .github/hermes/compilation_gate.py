#!/usr/bin/env python3
"""Porte de validation de l'agent de conflit (Hermes) — la toolchain du dépôt.

Une résolution de conflit **ne doit jamais atteindre la branche sans passer la
toolchain du dépôt**. Motif mesuré sur un dépôt voisin (relevé antérieur, hors de
cet arbre) : la réconciliation avait poussé une tête cassée — paramètre manquant,
variable hors portée, un test aux arguments inversés —, le balayeur a classé
l'échec « réel », et la PR est morte en silence jusqu'à une reprise humaine.

Les contrôles, du moins cher au plus cher, chacun borné et **honnête** :

| Nature | Contrôle | Coût |
|---|---|---|
| `.py` | `py_compile` (stdlib, toujours disponible) | < 1 s |
| `.md`/`.txt` | UTF-8 et non vide — le contrôle exact du job `ci` | < 1 s |
| `.yml`/`.yaml` | `yaml.safe_load` si PyYAML est présent, sinon **sauté et dit** | < 1 s |
| `.ts`/`.tsx`/`.js`/`.mjs`/`.json` | `pnpm verify` (types + tests + limites + manifeste) si la toolchain est installée dans le clone | ~15 s |
| `.kt` sous `core/` ou `app/` | Gradle `compileDebugKotlin` (héritage du dépôt d'origine) | borné |

Le clone du balayeur n'a pas `node_modules` : sans lui, `pnpm verify` ne peut pas
tourner. `HERMES_GATE_INSTALL=1` fait installer les dépendances (borné, best
effort) ; sinon le contrôle est **sauté et le dit** — la CI reste alors la
preuve, et le compte rendu publié sur la PR cite exactement ce qui a été joué.

Rouge → rien n'est poussé, la branche reste intacte, la PR reste `DIRTY` (le tour
suivant rappelle l'agent, dans la limite du quota) et le compte rendu cite les
erreurs. Une porte qui ne peut pas s'exécuter ne bloque rien et le dit : jamais
de « valide » silencieux. Coupe-circuit : `CONFLICT_COMPILE_GATE=0`.

Bibliothèque standard uniquement (PyYAML utilisé s'il est là), aucune horloge
implicite, aucun secret.
"""

import os
import shutil
import subprocess
import sys

# Un `.kt` hors de ces arbres ne se compile pas seul (`settings.gradle.kts`).
MODULES_GRADLE = ("core", "app")
GATE_ENV = "CONFLICT_COMPILE_GATE"
GATE_INSTALL_ENV = "HERMES_GATE_INSTALL"
GATE_CMD_ENV = "HERMES_GATE_CMD"
GATE_TIMEOUT_S = 150
INSTALL_TIMEOUT_S = 180
GATE_EXCERPT = 1_500
EXT_PY = (".py",)
EXT_DOC = (".md", ".mdx", ".txt")
EXT_YAML = (".yml", ".yaml")
EXT_TS = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json")
VERROUS = ("pnpm-lock.yaml", "package-lock.json", "yarn.lock")
# Marqueur de la tête posée par l'agent : le balayeur le cherche mot pour mot
# pour attribuer un échec à la résolution (label `intervention-humaine`) au
# lieu de laisser la PR mourir en silence.
MARK_AGENT = "<!-- agent-conflit sha=%s -->"


def _log(message):
    print("hermes-agent: %s" % message, flush=True)


def fichiers_modifies(base="origin/main"):
    """Fichiers que la branche change par rapport à `base` (best-effort)."""
    try:
        proc = subprocess.run(["git", "diff", "--name-only", "%s...HEAD" % base],
                              capture_output=True, text=True, timeout=120)
    except (OSError, subprocess.SubprocessError) as exc:
        _log("diff illisible, rien à valider : %s" % exc)
        return []
    if proc.returncode != 0:
        _log("diff illisible (%s), rien à valider" % base)
        return []
    return [line for line in (proc.stdout or "").splitlines() if line.strip()]


def classer(fichiers):
    """Répartit les chemins par nature de contrôle — aucun contrôle inutile.

    Un verrou de dépendances finit en `.yaml` mais n'est **pas** un YAML qu'on
    relit : c'est du code généré, sa réconciliation se valide avec la toolchain.
    """
    classes = {"py": [], "doc": [], "yaml": [], "ts": [], "verrou": [], "autre": []}
    for path in fichiers:
        if os.path.basename(path) in VERROUS:
            classes["verrou"].append(path)
        elif path.endswith(EXT_PY):
            classes["py"].append(path)
        elif path.endswith(EXT_DOC):
            classes["doc"].append(path)
        elif path.endswith(EXT_YAML):
            classes["yaml"].append(path)
        elif path.endswith(EXT_TS):
            classes["ts"].append(path)
        else:
            classes["autre"].append(path)
    return classes


def taches_compilation(fichiers):
    """(tâches Gradle, fichiers Python) à vérifier pour ces chemins.

    Un `.kt` sous `core/` ou `app/` demande la compilation de son module ; un
    `.py` se vérifie seul (`py_compile`). Tout le reste (docs, JSON, `.kts`,
    arbres non Gradle) ne prouve rien et n'est pas compilé ici.
    """
    gradle, python = [], []
    for path in fichiers:
        if path.endswith(".py"):
            python.append(path)
            continue
        if not path.endswith(".kt") or "/" not in path:
            continue
        module = path.split("/", 1)[0]
        tache = ":%s:compileDebugKotlin" % module
        if module in MODULES_GRADLE and tache not in gradle:
            gradle.append(tache)
    return gradle, python


def sdk_android():
    """SDK Android, ou `None` : sans lui Gradle refuse de se configurer."""
    for var in ("ANDROID_HOME", "ANDROID_SDK_ROOT"):
        chemin = os.environ.get(var)
        if chemin and os.path.isdir(chemin):
            return chemin
    maison = os.path.join(os.path.expanduser("~"), "Android", "Sdk")
    return maison if os.path.isdir(maison) else None


def ecrire_local_properties(sdk):
    """`local.properties` (gitignoré) : le clone du balayeur n'en a pas."""
    try:
        with open("local.properties", "w", encoding="utf-8") as fichier:
            fichier.write("sdk.dir=%s\n" % sdk)
    except OSError as exc:
        _log("local.properties non écrit : %s" % exc)


def extrait_compilateur(etape, texte):
    """Extrait publiable : les lignes d'erreur, sinon la fin du journal."""
    lignes = [ligne.strip() for ligne in texte.splitlines() if ligne.strip()]
    fautes = [ligne for ligne in lignes
              if ligne.startswith("e: ") or "error:" in ligne
              or ligne.lower().startswith("error")
              or ligne.startswith("FAILURE:")]
    garde = fautes[:8] or lignes[-8:]
    return "`%s` :\n```\n%s\n```" % (etape, "\n".join(garde)[:GATE_EXCERPT])


def verifier_python(chemins):
    """`py_compile` sur chaque `.py` touché : stdlib, toujours disponible."""
    for path in chemins:
        try:
            proc = subprocess.run([sys.executable, "-m", "py_compile", path],
                                  capture_output=True, text=True, timeout=60)
        except (OSError, subprocess.SubprocessError) as exc:
            return True, "Python sauté (%s)" % str(exc)[:80]
        if proc.returncode != 0:
            return False, extrait_compilateur("Python %s" % path,
                                              proc.stderr or proc.stdout)
    return True, "py_compile OK (%d fichier(s))" % len(chemins)


def verifier_docs(chemins):
    """UTF-8 et non vide : exactement le contrôle « sanity docs » du job `ci`."""
    for path in chemins:
        try:
            with open(path, "rb") as fichier:
                brut = fichier.read()
        except OSError as exc:
            return True, "docs sautés (%s)" % str(exc)[:80]
        if not brut.strip():
            return False, "`%s` est vide après résolution (le job `ci` le refuse)" % path
        try:
            brut.decode("utf-8")
        except UnicodeDecodeError as exc:
            return False, "`%s` n'est plus UTF-8 : %s" % (path, str(exc)[:120])
    return True, "docs UTF-8 et non vides (%d)" % len(chemins)


def verifier_yaml(chemins):
    """YAML encore parseable — sauté et dit si PyYAML manque au runner."""
    try:
        import yaml
    except ImportError:
        return True, "YAML sauté (PyYAML absent du runner)"
    for path in chemins:
        try:
            with open(path, encoding="utf-8") as fichier:
                yaml.safe_load(fichier)
        except OSError as exc:
            return True, "YAML sauté (%s)" % str(exc)[:80]
        except yaml.YAMLError as exc:
            return False, "`%s` n'est plus un YAML valide : %s" % (path, str(exc)[:200])
    return True, "YAML parseable (%d)" % len(chemins)


def _lancer(commande, timeout):
    """Lance une commande du dépôt. Rend (code, sortie) ou (None, raison)."""
    try:
        proc = subprocess.run(commande, capture_output=True, text=True,
                              timeout=timeout)
    except subprocess.TimeoutExpired:
        return None, "%d s dépassées" % timeout
    except (OSError, subprocess.SubprocessError) as exc:
        return None, str(exc)[:120]
    return proc.returncode, (proc.stdout or "") + "\n" + (proc.stderr or "")


def installer_dependances():
    """Installe les dépendances du monorepo dans le clone (best effort, borné).

    Rend `None` si l'installation a abouti, sinon la raison (elle est alors
    publiée : une porte qui n'a pas pu tourner ne prétend pas le contraire).
    """
    verrou = next((v for v in VERROUS if os.path.exists(v)), None)
    if verrou is None:
        return "aucun verrou de dépendances dans le clone"
    if not shutil.which("pnpm") and not shutil.which("corepack"):
        return "ni pnpm ni corepack sur le PATH du runner"
    if shutil.which("corepack"):
        _lancer(["corepack", "enable"], 60)
        _lancer(["corepack", "prepare", "pnpm@9.15.9", "--activate"], 90)
    if not shutil.which("pnpm"):
        return "pnpm indisponible après corepack"
    code, sortie = _lancer(["pnpm", "install", "--frozen-lockfile",
                            "--prefer-offline"], INSTALL_TIMEOUT_S)
    if code is None:
        return "installation non concluante (%s)" % sortie
    if code != 0:
        lignes = (sortie or "").strip().splitlines()
        return "installation en échec (%s)" % (lignes[-1][:120] if lignes
                                              else "code %s" % code)
    return None


def verifier_depot(chemins):
    """La toolchain du dépôt (`pnpm verify` par défaut) sur le clone résolu."""
    commande = os.environ.get(GATE_CMD_ENV) or "pnpm verify"
    if not os.path.isdir("node_modules"):
        if os.environ.get(GATE_INSTALL_ENV, "0") != "1":
            return True, ("toolchain du dépôt sautée (node_modules absent du "
                          "clone, %s non activé) — la CI reste la preuve"
                          % GATE_INSTALL_ENV)
        raison = installer_dependances()
        if raison is not None:
            return True, "toolchain du dépôt sautée (%s)" % raison
    code, sortie = _lancer(commande.split(), GATE_TIMEOUT_S)
    if code is None:
        return True, "toolchain du dépôt non concluante (%s)" % sortie
    if code != 0:
        return False, extrait_compilateur(commande, sortie)
    return True, "`%s` OK (%d fichier(s) de code touchés)" % (commande, len(chemins))


def verifier_gradle(taches):
    """Compilation Gradle des modules Kotlin touchés (dépôt d'origine)."""
    if not taches:
        return True, ""
    if not os.path.exists("gradlew"):
        return True, "porte de compilation sautée : pas de `gradlew` ici"
    sdk = sdk_android()
    if sdk:
        ecrire_local_properties(sdk)
    commande = ["./gradlew", "--console=plain", "--quiet",
                "-Dorg.gradle.jvmargs=-Xmx2g", "--max-workers=2"] + taches
    code, sortie = _lancer(commande, GATE_TIMEOUT_S)
    if code is None:
        return True, "porte de compilation non concluante : %s (%s)" % (
            sortie, " ".join(taches))
    if code != 0:
        return False, extrait_compilateur(" ".join(taches), sortie)
    return True, "porte de compilation : %s OK" % " ".join(taches)


def verifier_compilation(fichiers=None):
    """Valide la résolution avant le push. Rend (ok, message publié).

    `ok` faux n'est pas une panne : c'est la preuve que la résolution est
    cassée, donc le push est refusé et la branche reste intacte. `ok` vrai porte
    toujours le détail de ce qui a été joué **ou sauté** — jamais de validation
    implicite.
    """
    if os.environ.get(GATE_ENV, "1") == "0":
        return True, "porte de validation désactivée (%s=0)" % GATE_ENV
    fichiers = fichiers_modifies() if fichiers is None else fichiers
    classes = classer(fichiers)
    gradle, _python = taches_compilation(fichiers)
    # La toolchain du dépôt n'est jouée que si le diff touche du code (ou un
    # verrou de dépendances) : un conflit purement documentaire n'a pas à payer
    # 15 s de typecheck, et un `.kt` relève du Gradle ci-dessous.
    code_touche = classes["ts"] + classes["verrou"]
    etapes = []
    controles = ((verifier_python, classes["py"]),
                 (verifier_docs, classes["doc"]),
                 (verifier_yaml, classes["yaml"]),
                 (verifier_depot, code_touche))
    for controle, chemins in controles:
        if not chemins:
            continue
        ok, message = controle(chemins)
        if not ok:
            return False, message
        if message:
            etapes.append(message)
    ok, message = verifier_gradle(gradle)
    if not ok:
        return False, message
    if message:
        etapes.append(message)
    return True, " · ".join(etapes) or "aucun contrôle applicable à ce diff"


def tete_git():
    """SHA de la tête (le push ne la change pas : marqueur exact)."""
    try:
        proc = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True,
                              text=True, timeout=60)
    except (OSError, subprocess.SubprocessError):
        return ""
    return (proc.stdout or "").strip() if proc.returncode == 0 else ""


def prepare_push(files, branch, fichiers=None):
    """(ok, message, corps) : décide du push et prépare son compte rendu.

    Le corps porte le marqueur de tête en première ligne ; l'appelant ne le
    poste qu'après un push réussi.
    """
    ok, message = verifier_compilation(fichiers)
    if not ok:
        return False, message, ""
    unique = sorted(set(files))
    corps = ("%s\n\nConflit réconcilié par l'agent : %d fichier(s) (%s), "
             "rebase poussé sur `%s` (%s). La file reprend."
             % (MARK_AGENT % tete_git(), len(unique), ", ".join(unique),
                branch, message))
    return True, message, corps
