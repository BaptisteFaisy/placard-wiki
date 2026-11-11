import { describe, expect, it } from 'vitest';

import { fakeSuspiciousString, isDummyValue, prng } from '@placard/core';

import {
  RULE_CONNECTION_JDBC_PARAM,
  RULE_CONNECTION_URI,
  findConnectionStrings,
} from './connection-strings.js';

/** Valeurs fabriquées à l'exécution (PLA-N-09 : aucun littéral au format réel). */
const rand = prng('tests-connection-strings');
const PASSWORD = fakeSuspiciousString(rand);

function uri(scheme: string, password: string, user = 'svc-admin'): string {
  return `${scheme}://${user}:${password}@db.internal:5432/app`;
}

describe('famille 10 — chaînes de connexion', () => {
  it.each(['postgres', 'postgresql', 'mongodb', 'mongodb+srv', 'mysql', 'redis', 'amqp'])(
    'détecte %s:// avec mot de passe non vide',
    (scheme) => {
      const matches = findConnectionStrings(`export DB_URL="${uri(scheme, PASSWORD)}"`);
      expect(matches).toHaveLength(1);
      const match = matches[0]!;
      expect(match.ruleId).toBe(RULE_CONNECTION_URI);
      expect(match.password).toBe(PASSWORD);
      expect(match.isKnownFake).toBe(false);
    },
  );

  it('accepte un utilisateur vide (forme redis://:motdepasse@hôte)', () => {
    const matches = findConnectionStrings(uri('redis', PASSWORD, ''));
    expect(matches).toHaveLength(1);
    expect(matches[0]!.password).toBe(PASSWORD);
  });

  it('ignore une URL sans identifiants', () => {
    expect(findConnectionStrings('postgres://db.internal:5432/app')).toHaveLength(0);
  });

  it('ignore un mot de passe vide', () => {
    expect(findConnectionStrings('postgres://svc-admin:@db.internal/app')).toHaveLength(0);
  });

  it('ignore un gabarit de configuration (${VAR}) — ce n’est pas un secret', () => {
    expect(findConnectionStrings('postgres://svc:${DB_PASS}@db.internal/app')).toHaveLength(0);
  });

  it('signale une valeur factice connue sans la jeter (isKnownFake)', () => {
    const matches = findConnectionStrings('postgres://svc:changeme@db.internal/app');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.isKnownFake).toBe(true);
    expect(isDummyValue('changeme')).toBe(true);
  });

  it('détecte la forme JDBC à paramètre password= non vide', () => {
    const line = `jdbc:postgresql://db.internal:5432/app?user=svc&password=${PASSWORD}`;
    const matches = findConnectionStrings(line);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.ruleId).toBe(RULE_CONNECTION_JDBC_PARAM);
    expect(matches[0]!.password).toBe(PASSWORD);
  });

  it('ignore JDBC avec password= vide', () => {
    expect(findConnectionStrings('jdbc:mysql://db:3306/app?user=svc&password=')).toHaveLength(0);
  });

  it('borne correctement l’occurrence dans la ligne', () => {
    const line = `voir ${uri('amqps', PASSWORD)} pour le bus`;
    const match = findConnectionStrings(line)[0]!;
    // L'intervalle retenu couvre l'autorité avec identifiants, jusqu'au « @ ».
    expect(line.slice(match.start, match.end)).toBe(`amqps://svc-admin:${PASSWORD}@`);
  });

  it('ne lève jamais sur un contenu hostile', () => {
    expect(() => findConnectionStrings('postgres://')).not.toThrow();
    expect(() => findConnectionStrings('://:@'.repeat(200))).not.toThrow();
    expect(findConnectionStrings('a'.repeat(50_000))).toHaveLength(0);
  });
});
