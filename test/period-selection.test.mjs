import test from 'node:test';
import assert from 'node:assert/strict';
import periodSelection from '../period-selection.js';
const {recommendedOperationPeriod} = periodSelection;

const catalog = (dds, mercado, logic) => ({
  DDS: {periods: dds},
  MERCADO_LIVRE: {periods: mercado},
  LOGICA_FF: {periods: logic}
});

test('prioriza o mês completo quando as duas quinzenas estão presentes em todas as fontes da modalidade', () => {
  const data = catalog(
    [{period:'2026-09',rows:120,firstQuinzenaRows:60,secondQuinzenaRows:60}],
    [{period:'2026-09',rows:90,firstQuinzenaRows:40,secondQuinzenaRows:50}],
    [{period:'2026-09',rows:300,firstQuinzenaRows:150,secondQuinzenaRows:150}]
  );
  assert.deepEqual(recommendedOperationPeriod(data, 'ff'), {month:'2026-09',part:'monthly'});
});

test('seleciona a quinzena disponível quando o mês ainda está incompleto', () => {
  const data = catalog(
    [{period:'2026-09',rows:60,firstQuinzenaRows:60,secondQuinzenaRows:0}],
    [{period:'2026-09',rows:40,firstQuinzenaRows:40,secondQuinzenaRows:0}],
    [{period:'2026-09',rows:150,firstQuinzenaRows:150,secondQuinzenaRows:0}]
  );
  assert.deepEqual(recommendedOperationPeriod(data, 'ff'), {month:'2026-09',part:'1'});
});

test('não exige LOGICA FF para recomendar período do Spot', () => {
  const data = catalog(
    [{period:'2026-09',rows:120,firstQuinzenaRows:60,secondQuinzenaRows:60}],
    [{period:'2026-09',rows:90,firstQuinzenaRows:40,secondQuinzenaRows:50}],
    []
  );
  assert.deepEqual(recommendedOperationPeriod(data, 'spot'), {month:'2026-09',part:'monthly'});
});

test('se as fontes estiverem desencontradas, recomenda a quinzena com maior cobertura', () => {
  const data = catalog(
    [{period:'2026-09',rows:120,firstQuinzenaRows:60,secondQuinzenaRows:60}],
    [{period:'2026-09',rows:50,firstQuinzenaRows:10,secondQuinzenaRows:40}],
    [{period:'2026-09',rows:150,firstQuinzenaRows:150,secondQuinzenaRows:0}]
  );
  assert.deepEqual(recommendedOperationPeriod(data, 'ff'), {month:'2026-09',part:'1'});
});

test('usa o período mais recente com dados e retorna null para catálogo vazio', () => {
  const data = catalog(
    [{period:'2026-08',rows:20,firstQuinzenaRows:20,secondQuinzenaRows:0},{period:'2026-09',rows:20,firstQuinzenaRows:0,secondQuinzenaRows:20}],
    [{period:'2026-08',rows:20,firstQuinzenaRows:20,secondQuinzenaRows:0},{period:'2026-09',rows:20,firstQuinzenaRows:0,secondQuinzenaRows:20}],
    [{period:'2026-08',rows:20,firstQuinzenaRows:20,secondQuinzenaRows:0},{period:'2026-09',rows:20,firstQuinzenaRows:0,secondQuinzenaRows:20}]
  );
  assert.deepEqual(recommendedOperationPeriod(data, 'ff'), {month:'2026-09',part:'2'});
  assert.equal(recommendedOperationPeriod({}, 'ff'), null);
});

test('ignora registros futuros isolados e usa o mês completo mais recente entre as fontes', () => {
  const data = catalog(
    [
      {period:'2027-12',rows:1,firstQuinzenaRows:1,secondQuinzenaRows:0},
      {period:'2026-10',rows:1,firstQuinzenaRows:1,secondQuinzenaRows:0},
      {period:'2026-09',rows:26739,firstQuinzenaRows:12910,secondQuinzenaRows:13829}
    ],
    [
      {period:'2026-09',rows:26893,firstQuinzenaRows:13066,secondQuinzenaRows:13827}
    ],
    [
      {period:'2026-09',rows:16530,firstQuinzenaRows:7710,secondQuinzenaRows:8820}
    ]
  );
  assert.deepEqual(recommendedOperationPeriod(data, 'ff', '2026-10'), {month:'2026-09',part:'monthly'});
});
