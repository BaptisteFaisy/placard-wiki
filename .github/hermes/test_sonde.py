#!/usr/bin/env python3
"""Tests de la sonde de la jambe modèle (`.github/hermes/sonde.py`).

Lancement : `python3 .github/hermes/test_sonde.py` (bibliothèque standard, aucun
réseau, aucune clé).

Ce que ces tests verrouillent :
  * la santé de la jambe, c'est « le fournisseur répond » : une réponse **non
    vide** suffit, la conformité à l'invite est rapportée mais ne fait pas
    échouer la sonde (le modèle par défaut raisonne avant d'écrire, et son budget
    de jetons peut être consommé autrement — mesuré le 12 novembre 2026, sonde
    verte une fois sur trois avec un budget de 16 jetons) ;
  * une réponse vide ou un refus HTTP est bien un échec ;
  * aucun secret n'est jamais imprimé : l'aperçu d'une clé ne contient jamais la
    clé, et un appel sans clé se termine proprement (code 3), sans exception.
"""
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sonde  # noqa: E402 — module voisin


class MasquageTest(unittest.TestCase):
    """L'aperçu d'une clé ne la contient jamais."""

    def test_apercu_sans_fuite(self):
        for valeur in ("une-cle-fictive-de-32-caracteres-au-faux", "x"):
            self.assertNotIn(valeur, sonde.masquer(valeur))

    def test_apercu_avec_longueur(self):
        self.assertEqual(sonde.masquer("sk-abc123"), "sk-…(9)")
        self.assertEqual(sonde.masquer("x"), "…(1)")
        self.assertEqual(sonde.masquer(""), "(absente)")


class ReponseTest(unittest.TestCase):
    """Ce que la sonde accepte, et ce qu'elle refuse."""

    def test_reponse_non_vide_suffit(self):
        # Le modèle a répondu autre chose que PONG : la jambe est vivante.
        with mock.patch.object(sonde, "appeler",
                               return_value=(200, ("Je suis là.", "raisonnement"), 1.2)), \
                mock.patch.object(sonde, "regler",
                                  return_value=("cle", "combo/cheap", "https://x")), \
                mock.patch.object(sonde, "log"):
            self.assertEqual(sonde.main([]), 0)

    def test_reponse_vide_est_un_echec(self):
        with mock.patch.object(sonde, "appeler",
                               return_value=(200, ("", ""), 1.2)), \
                mock.patch.object(sonde, "regler",
                                  return_value=("cle", "combo/cheap", "https://x")), \
                mock.patch.object(sonde, "log"):
            self.assertEqual(sonde.main([]), 1)

    def test_refus_http_est_un_echec(self):
        with mock.patch.object(sonde, "appeler",
                               return_value=(401, ("", ""), 0.2)), \
                mock.patch.object(sonde, "regler",
                                  return_value=("cle", "combo/cheap", "https://x")), \
                mock.patch.object(sonde, "log"):
            self.assertEqual(sonde.main([]), 1)

    def test_sans_cle_code_3_pas_d_exception(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            for nom in ("MODEL_API_KEY", "FIREWORKS_API_KEY"):
                os.environ.pop(nom, None)
            with mock.patch.object(sonde, "log"):
                self.assertEqual(sonde.main([]), 3)


class SelftestTest(unittest.TestCase):
    """Le `--selftest` hors ligne reste vert (aucun réseau, aucune clé)."""

    def test_selftest(self):
        self.assertEqual(sonde.main(["--selftest"]), 0)


if __name__ == "__main__":
    unittest.main()
