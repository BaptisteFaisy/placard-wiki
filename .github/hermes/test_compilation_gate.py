#!/usr/bin/env python3
"""Tests de la porte de validation (`compilation_gate.py`) — stdlib uniquement.

Lance : `python3 .github/hermes/test_compilation_gate.py` (aucun réseau, aucune
clé, aucun `pnpm` requis : la toolchain du dépôt est simulée).

Ce que ces tests verrouillent :
  * une résolution qui casse un `.py` est **refusée** — l'absence de `gradlew`
    ne saute plus tous les contrôles (c'était le comportement hérité du dépôt
    d'origine, mesuré sur l'exercice de conflit du 12 novembre 2026) ;
  * un document vidé ou cassé en encodage est refusé (le job `ci` le refuse
    aussi, mais après un push : autant ne pas pousser) ;
  * un contrôle qui ne peut pas tourner est **sauté et dit**, jamais présenté
    comme une validation ;
  * le compte rendu publié porte le détail de ce qui a été joué.
"""
import os
import shutil
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import compilation_gate  # noqa: E402 — module voisin


class DansClone:
    """Contexte : un clone jetable avec les fichiers donnés."""

    def __init__(self, fichiers=None, dossiers=()):
        self.fichiers = fichiers or {}
        self.dossiers = dossiers
        self.tmp = None
        self.avant = None

    def __enter__(self):
        self.tmp = tempfile.mkdtemp()
        self.avant = os.getcwd()
        os.chdir(self.tmp)
        for nom, contenu in self.fichiers.items():
            os.makedirs(os.path.dirname(nom) or ".", exist_ok=True)
            mode = "wb" if isinstance(contenu, bytes) else "w"
            with open(nom, mode, encoding=None if mode == "wb" else "utf-8") as fh:
                fh.write(contenu)
        for dossier in self.dossiers:
            os.makedirs(dossier, exist_ok=True)
        return self.tmp

    def __exit__(self, *_exc):
        os.chdir(self.avant)
        shutil.rmtree(self.tmp, ignore_errors=True)


SANS_GATE = {compilation_gate.GATE_ENV: "1",
             compilation_gate.GATE_INSTALL_ENV: "0"}


class PythonTest(unittest.TestCase):
    """`.py` : py_compile, toujours disponible, jamais sauté par un gradlew absent."""

    def test_py_casse_refuse_meme_sans_gradlew(self):
        with DansClone({"tools/x.py": "def f(:\n    pass\n"}), \
                mock.patch.dict(os.environ, SANS_GATE):
            self.assertFalse(os.path.exists("gradlew"))
            ok, message = compilation_gate.verifier_compilation(["tools/x.py"])
        self.assertFalse(ok, "un .py cassé ne doit jamais être poussé")
        self.assertIn("tools/x.py", message)

    def test_py_valide_passe(self):
        with DansClone({"tools/x.py": "def f():\n    return 1\n"}), \
                mock.patch.dict(os.environ, SANS_GATE):
            ok, message = compilation_gate.verifier_compilation(["tools/x.py"])
        self.assertTrue(ok)
        self.assertIn("py_compile OK", message)


class DocsTest(unittest.TestCase):
    """`.md` : UTF-8 et non vide — le contrôle exact du job `ci`."""

    def test_doc_vide_refuse(self):
        with DansClone({"docs/A.md": "   \n"}), \
                mock.patch.dict(os.environ, SANS_GATE):
            ok, message = compilation_gate.verifier_compilation(["docs/A.md"])
        self.assertFalse(ok)
        self.assertIn("vide", message)

    def test_doc_non_utf8_refuse(self):
        with DansClone({"docs/A.md": b"caf\xe9 cass\xe9"}), \
                mock.patch.dict(os.environ, SANS_GATE):
            ok, message = compilation_gate.verifier_compilation(["docs/A.md"])
        self.assertFalse(ok)
        self.assertIn("UTF-8", message)

    def test_doc_valide_passe_sans_toolchain(self):
        appels = []
        with DansClone({"docs/A.md": "# Titre\n\nTexte.\n"}), \
                mock.patch.dict(os.environ, SANS_GATE), \
                mock.patch.object(compilation_gate.subprocess, "run",
                                  side_effect=lambda argv, **kw:
                                  appels.append(argv) or
                                  mock.Mock(returncode=0, stdout="", stderr="")):
            ok, message = compilation_gate.verifier_compilation(["docs/A.md"])
        self.assertTrue(ok)
        self.assertIn("docs UTF-8", message)
        self.assertEqual([a for a in appels if a[:1] == ["pnpm"]], [],
                         "un diff purement documentaire ne paie pas la toolchain")

    def test_conflit_resolu_garde_les_deux_intentions(self):
        # L'exercice de conflit du 12 novembre 2026 : les deux versions de la
        # ligne disputée doivent rester lisibles après réconciliation.
        corps = ("# Exercice\n\n## Ligne disputée\n\n"
                 "Version B — posée par la seconde branche.\n"
                 "Version A — posée par la première branche.\n")
        with DansClone({"docs/drill/CONFLIT.md": corps}), \
                mock.patch.dict(os.environ, SANS_GATE):
            ok, _message = compilation_gate.verifier_compilation(
                ["docs/drill/CONFLIT.md"])
        self.assertTrue(ok)


class ToolchainTest(unittest.TestCase):
    """`.ts`/verrous : la toolchain du dépôt, ou un saut **dit**."""

    def test_sans_node_modules_saute_et_le_dit(self):
        with DansClone({"packages/a/src/x.ts": "export const x = 1\n"}), \
                mock.patch.dict(os.environ, SANS_GATE):
            ok, message = compilation_gate.verifier_compilation(
                ["packages/a/src/x.ts"])
        self.assertTrue(ok, "un clone sans outillage ne doit pas bloquer le rebase")
        self.assertIn("sautée", message)
        self.assertIn("la CI reste la preuve", message)

    def test_installation_demandee_sans_verrou_saute(self):
        env = dict(SANS_GATE, **{compilation_gate.GATE_INSTALL_ENV: "1"})
        with DansClone({"src/x.ts": "export const x = 1\n"}), \
                mock.patch.dict(os.environ, env):
            ok, message = compilation_gate.verifier_compilation(["src/x.ts"])
        self.assertTrue(ok)
        self.assertIn("aucun verrou", message)

    def test_toolchain_rouge_refusee(self):
        with DansClone({"src/x.ts": "export const x: number = 'a'\n"},
                       dossiers=("node_modules",)), \
                mock.patch.dict(os.environ, SANS_GATE), \
                mock.patch.object(compilation_gate, "_lancer",
                                  return_value=(1, "src/x.ts:1:24 error: TS2322")):
            ok, message = compilation_gate.verifier_compilation(["src/x.ts"])
        self.assertFalse(ok)
        self.assertIn("TS2322", message)

    def test_toolchain_verte_publiee(self):
        with DansClone({"src/x.ts": "export const x = 1\n"},
                       dossiers=("node_modules",)), \
                mock.patch.dict(os.environ, SANS_GATE), \
                mock.patch.object(compilation_gate, "_lancer",
                                  return_value=(0, "OK — 267 tests")):
            ok, message = compilation_gate.verifier_compilation(["src/x.ts"])
        self.assertTrue(ok)
        self.assertIn("pnpm verify", message)

    def test_commande_configurable(self):
        env = dict(SANS_GATE, **{compilation_gate.GATE_CMD_ENV: "true"})
        with DansClone({"src/x.ts": "export const x = 1\n"},
                       dossiers=("node_modules",)), \
                mock.patch.dict(os.environ, env):
            ok, message = compilation_gate.verifier_compilation(["src/x.ts"])
        self.assertTrue(ok)
        self.assertIn("`true` OK", message)

    def test_verrou_touche_seul_appelle_la_toolchain(self):
        with DansClone({"pnpm-lock.yaml": "lockfileVersion: '9.0'\n"},
                       dossiers=("node_modules",)), \
                mock.patch.dict(os.environ, SANS_GATE), \
                mock.patch.object(compilation_gate, "_lancer",
                                  return_value=(0, "OK")) as lance:
            ok, _message = compilation_gate.verifier_compilation(
                ["pnpm-lock.yaml"])
        self.assertTrue(ok)
        self.assertTrue(lance.called, "un verrou mal réconcilié doit être validé")


class YamlTest(unittest.TestCase):
    """`.yml` : parseable si PyYAML est là, sauté et dit sinon."""

    def test_yaml_casse_refuse_si_pyyaml(self):
        try:
            import yaml  # noqa: F401
        except ImportError:
            self.skipTest("PyYAML absent : le contrôle est sauté (et le dit)")
        with DansClone({".github/workflows/x.yml": "a: [1,\n  b: 2"}), \
                mock.patch.dict(os.environ, SANS_GATE):
            ok, message = compilation_gate.verifier_compilation(
                [".github/workflows/x.yml"])
        self.assertFalse(ok)
        self.assertIn("YAML", message)

    def test_yaml_valide_passe_si_pyyaml(self):
        try:
            import yaml  # noqa: F401
        except ImportError:
            self.skipTest("PyYAML absent : le contrôle est sauté (et le dit)")
        with DansClone({".github/workflows/x.yml": "on: push\njobs: {}\n"}), \
                mock.patch.dict(os.environ, SANS_GATE):
            ok, message = compilation_gate.verifier_compilation(
                [".github/workflows/x.yml"])
        self.assertTrue(ok)
        self.assertIn("YAML", message)


class GardeFousTest(unittest.TestCase):
    """Coupe-circuit, compte rendu, et aucune validation implicite."""

    def test_coupe_circuit(self):
        env = dict(SANS_GATE, **{compilation_gate.GATE_ENV: "0"})
        with DansClone({"tools/x.py": "def f(:\n"}), \
                mock.patch.dict(os.environ, env):
            ok, message = compilation_gate.verifier_compilation(["tools/x.py"])
        self.assertTrue(ok)
        self.assertIn("désactivée", message)

    def test_diff_sans_controle_le_dit(self):
        with DansClone(), mock.patch.dict(os.environ, SANS_GATE):
            ok, message = compilation_gate.verifier_compilation(["LICENSE"])
        self.assertTrue(ok)
        self.assertIn("aucun contrôle applicable", message)

    def test_compte_rendu_porte_marqueur_et_detail(self):
        with DansClone({"docs/A.md": "# A\n"}), \
                mock.patch.dict(os.environ, SANS_GATE), \
                mock.patch.object(compilation_gate, "tete_git",
                                  return_value="abc1234"):
            ok, message, corps = compilation_gate.prepare_push(
                ["docs/A.md"], "feat/x", ["docs/A.md"])
        self.assertTrue(ok)
        self.assertIn("<!-- agent-conflit sha=abc1234 -->", corps)
        self.assertIn("docs UTF-8", message)
        self.assertIn(message, corps, "le détail joué doit être publié sur la PR")

    def test_rouge_ne_prepare_aucun_push(self):
        with DansClone({"docs/A.md": ""}), \
                mock.patch.dict(os.environ, SANS_GATE):
            ok, _message, corps = compilation_gate.prepare_push(
                ["docs/A.md"], "feat/x", ["docs/A.md"])
        self.assertFalse(ok)
        self.assertEqual(corps, "")


if __name__ == "__main__":
    unittest.main()
