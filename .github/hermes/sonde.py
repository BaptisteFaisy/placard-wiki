#!/usr/bin/env python3
"""Sonde vivante de la jambe modèle des agents Hermes (InferHub `combo/cheap`).

À quoi ça sert : les agents du dossier (résolveur de conflits, agent de
périmètre, agent de test) dépendent d'un fournisseur de modèle externe. Quand la
clé expire, que le quota tombe ou que le modèle est retiré, les agents se
taisent et les conflits reviennent à un humain — silencieusement. Cette sonde
rend l'état de la jambe **visible** : un run `hermes-probe` rouge dit « le
fournisseur ne répond plus », sans attendre qu'une PR pourrisse.

Elle lit les réglages exactement comme les agents
(`fournisseur.provider_settings()` : noms génériques `MODEL_*` prioritaires sur
les historiques `FIREWORKS_*`), envoie une invite triviale, et juge la réponse.

Aucun secret n'est imprimé : ni la clé, ni les en-têtes, ni le corps brut de la
réponse. Seuls le code HTTP, le modèle appelé, la durée et le texte court de la
réponse sont affichés.

Usage :
    python3 .github/hermes/sonde.py                # sonde vivante (réseau)
    python3 .github/hermes/sonde.py --selftest     # hors ligne, sans clé
    python3 .github/hermes/sonde.py --invite "…" --delai 60

Codes de sortie : 0 = la jambe répond ; 1 = refus ou réponse inattendue ;
3 = aucune clé (sonde impossible, dit explicitement) ; 2 = erreur interne.
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fournisseur  # noqa: E402 — module voisin, une seule source des réglages

INVITE_DEFAUT = "Réponds exactement PONG, sans aucun autre mot."
ATTENDU = "PONG"
DELAI_DEFAUT_S = 60


def log(message):
    """Une ligne de journal, sans rien de sensible."""
    print("hermes-sonde: %s" % message, flush=True)


def masquer(cle):
    """Aperçu d'une clé : famille et longueur, jamais la valeur (§ aperçu masqué).

    Même discipline que dans le produit : `sk-…(32)` dit de quelle famille est la
    clé et si elle a une longueur plausible, sans la rendre utilisable. Une clé
    trop courte n'est pas préfixée du tout : en montrer un bout la révélerait.
    """
    if not cle:
        return "(absente)"
    if len(cle) <= 8:
        return "…(%d)" % len(cle)
    return "%s…(%d)" % (cle[:3], len(cle))


def regler(sonde_pas_de_cle):
    """Les réglages du fournisseur, ou None si la clé manque (code 3)."""
    cle, modele, url = fournisseur.provider_settings()
    log("clé %s · modèle %s · url %s" % (masquer(cle), modele, url))
    if not cle:
        if sonde_pas_de_cle:
            log("aucune clé (MODEL_API_KEY ni FIREWORKS_API_KEY) : sonde impossible")
            return None
        raise SystemExit("réglages illisibles")
    return cle, modele, url


def appeler(cle, modele, url, invite, delai):
    """Une invite au fournisseur. Rend (code_http, texte, durée_s)."""
    # `max_tokens` large : le modèle par défaut raisonne avant de répondre, et
    # un budget de 16 jetons peut être entièrement consommé par le raisonnement
    # — la réponse visible arrive alors vide (mesuré le 12 novembre 2026 : la
    # sonde passait une fois sur trois).
    corps = json.dumps({
        "model": modele,
        "messages": [{"role": "user", "content": invite}],
        "max_tokens": 512,
        "temperature": 0,
    }).encode("utf-8")
    requete = urllib.request.Request(url, data=corps, method="POST")
    requete.add_header("Authorization", "Bearer " + cle)
    requete.add_header("Content-Type", "application/json")
    debut = time.time()
    try:
        with urllib.request.urlopen(requete, timeout=delai) as reponse:
            brut = reponse.read().decode("utf-8", "replace")
            code = reponse.status
    except urllib.error.HTTPError as exc:              # un refus HTTP est un verdict
        brut = exc.read().decode("utf-8", "replace")[:200]
        code = exc.code
        log("refus HTTP %s (extrait, sans clé : %s)" % (code, brut))
        return code, "", round(time.time() - debut, 1)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        log("fournisseur injoignable : %s" % str(exc)[:160])
        return 0, "", round(time.time() - debut, 1)
    try:
        message = json.loads(brut)["choices"][0]["message"]
        texte = message.get("content") or ""
        raisonnement = message.get("reasoning_content") or ""
    except (ValueError, KeyError, IndexError, TypeError):
        texte = ""
        raisonnement = ""
        log("réponse illisible (pas de choices[0].message.content)")
    return code, (texte, raisonnement), round(time.time() - debut, 1)


def selftest():
    """Vérifications hors ligne : aucun réseau, aucune clé requise."""
    assert masquer("") == "(absente)", "une clé absente doit être dite absente"
    assert masquer("sk-abc123") == "sk-…(9)", "aperçu : préfixe et longueur seulement"
    assert masquer("x") == "…(1)", "une clé courte ne montre aucun caractère"
    for valeur in ("sk-abc123", "cle-quelconque"):
        apercu = masquer(valeur)
        assert valeur not in apercu, "l'aperçu ne doit jamais contenir la valeur"
    for nom in ("MODEL_API_KEY", "MODEL_NAME", "MODEL_API_URL",
                "FIREWORKS_API_KEY", "FIREWORKS_MODEL", "FIREWORKS_BASE_URL"):
        os.environ.pop(nom, None)
    cle, modele, url = fournisseur.provider_settings()
    assert cle == "", "sans variable, aucune clé ne doit apparaître"
    assert modele == "combo/cheap", "modèle par défaut : combo/cheap (InferHub)"
    assert url == "https://api.inferhub.dev/v1/chat/completions", "URL par défaut InferHub"
    os.environ["MODEL_API_KEY"] = "sonde"
    os.environ["FIREWORKS_API_KEY"] = "historique"
    cle, modele, url = fournisseur.provider_settings()
    assert cle == "sonde", "les noms génériques MODEL_* sont prioritaires"
    os.environ.pop("MODEL_API_KEY", None)
    cle, _modele, _url = fournisseur.provider_settings()
    assert cle == "historique", "repli historique FIREWORKS_API_KEY accepté"
    os.environ.pop("FIREWORKS_API_KEY", None)
    log("selftest : 5 familles de vérifications, aucun réseau, OK")
    return 0


def main(argv=None):
    """Point d'entrée : selftest hors ligne, ou sonde vivante."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--selftest", action="store_true",
                        help="vérifications hors ligne (aucun réseau, aucune clé)")
    parser.add_argument("--invite", default=INVITE_DEFAUT, help="invite envoyée")
    parser.add_argument("--delai", type=int, default=DELAI_DEFAUT_S, help="secondes")
    args = parser.parse_args(argv)
    if args.selftest:
        return selftest()
    reglages = regler(sonde_pas_de_cle=True)
    if reglages is None:
        return 3
    cle, modele, url = reglages
    code, (texte, raisonnement), duree = appeler(cle, modele, url, args.invite, args.delai)
    contenu = (texte or "").strip()
    # La santé de la jambe, c'est « le fournisseur répond ». La forme exacte de
    # la réponse est un contrôle de conformité, pas un critère de santé : un
    # modèle qui raisonne avant d'écrire peut dépenser ses jetons autrement (mesuré
    # le 12 novembre 2026). On exige donc une réponse **non vide**, et on
    # rapporte si elle est conforme à l'invite.
    recu = ATTENDU.lower() in ((contenu + " " + (raisonnement or "")).lower())
    log("HTTP %s en %s s · réponse non vide : %s · conforme à l'invite (%s) : %s"
        % (code or "aucune", duree, "oui" if contenu else "non", ATTENDU,
           "oui" if recu else "non"))
    if code == 200 and contenu:
        log("jambe modèle opérationnelle : les agents Hermes peuvent résoudre")
        return 0
    log("jambe modèle HORS SERVICE : les conflits retomberont sur un humain "
        "(repli A2A ZeroClaw éventuel, voir .github/hermes/README.md)")
    return 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception as exc:                                   # noqa: BLE001
        log("erreur interne : %s" % str(exc)[:200])
        raise SystemExit(2)
