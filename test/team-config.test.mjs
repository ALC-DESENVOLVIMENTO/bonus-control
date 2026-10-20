import test from 'node:test';
import assert from 'node:assert/strict';
import {isAllowedTeamDispatcherMode, normalizeTeamDispatcherConfig, teamModeDispatchers} from '../server.mjs';

test('cadastros antigos mantêm todos os dispatchers elegíveis para os dois modais', () => {
  const team = normalizeTeamDispatcherConfig(['Ana', 'Beto']);
  assert.deepEqual(team, {dispatchers: ['Ana', 'Beto'], modes: {Ana: 'both', Beto: 'both'}});
  assert.deepEqual(teamModeDispatchers(['Ana', 'Beto'], 'ff'), ['Ana', 'Beto']);
  assert.deepEqual(teamModeDispatchers(['Ana', 'Beto'], 'spot'), ['Ana', 'Beto']);
});

test('equipe salva separa as pessoas responsáveis por Frota Fixa e Spot', () => {
  const team = {names: ['Ana', 'Beto', 'Caio'], modes: {Ana: 'spot', Beto: 'ff', Caio: 'both'}};
  assert.deepEqual(teamModeDispatchers(team, 'spot'), ['Ana', 'Caio']);
  assert.deepEqual(teamModeDispatchers(team, 'ff'), ['Beto', 'Caio']);
});

test('novas configurações aceitam somente Frota Fixa ou Spot', () => {
  assert.equal(isAllowedTeamDispatcherMode('ff'), true);
  assert.equal(isAllowedTeamDispatcherMode('spot'), true);
  assert.equal(isAllowedTeamDispatcherMode('both'), false);
  assert.equal(isAllowedTeamDispatcherMode('both', 'both'), true);
  assert.equal(isAllowedTeamDispatcherMode('both', 'ff'), false);
  assert.equal(isAllowedTeamDispatcherMode('hybrid'), false);
  assert.equal(isAllowedTeamDispatcherMode(''), false);
});
