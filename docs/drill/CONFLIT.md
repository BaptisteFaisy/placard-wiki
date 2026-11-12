# Exercice de conflit — fichier disputé

Fichier créé pour l'exercice de conflit décrit dans `docs/HERMES.md` §6 : deux
branches écrivent la même ligne différemment, la première fusionne, la seconde
devient `DIRTY`, et le système Hermes doit la résoudre avec sa jambe InferHub
sans perdre aucune des deux intentions.

## Ligne disputée

Version B — posée par la branche `drill/hermes-conflit`.
Version A — posée par la branche `drill/hermes-base`.

## Paragraphes ajoutés par la jambe B

Cette section n'existe que dans la seconde branche : une résolution honnête la
conserve intégralement, avec la ligne disputée réconciliée (les deux versions
datées et attribuées), et non pas écrasée par un côté.

## Journal de l'exercice

- Emplacement : `docs/drill/CONFLIT.md`, hors `.github/` (l'agent de conflit
  refuse d'écrire dans les gardes).
- Seconde branche : ouverte depuis le même `main` que la première, sans jamais
  la voir — le conflit est donc réel, pas rejoué.
