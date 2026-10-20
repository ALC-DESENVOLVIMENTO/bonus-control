import test from 'node:test';
import assert from 'node:assert/strict';
import {assertInvoiceBonusEligible, assertMonthlyInvoicePeriod, importDateKeyPriority, importPeriodDateRanges, importedDateKey, importPeriod, importedRowDate, importedRowPeriod, invoiceContentDisposition, selectedOperationPeriods, sqlImportDateValue, sqlImportRouteDate, validateImportDates} from '../server.mjs';

test('period detection accepts spreadsheet date header casing and duplicate columns', () => {
  assert.equal(importedRowPeriod({DATA: '2026-08-14'}), '2026-08');
  assert.equal(importedRowPeriod({Data: '14/08/2026'}), '2026-08');
  assert.equal(importedRowPeriod({DATA: '', DATA_1: '2026-08-31'}), '2026-08');
  assert.equal(importedRowPeriod({'Data da rota': '2026/08/01'}), '2026-08');
  assert.equal(importedRowPeriod({'Data do dispatch': '2026-08-01'}), '2026-08');
  assert.equal(importedRowPeriod({'Data Dispatch': '2026-08-01'}), '2026-08');
});

test('date aliases are normalized consistently and select the preferred populated field', () => {
  assert.equal(importDateKeyPriority('DATA'), 0);
  assert.equal(importDateKeyPriority('data_1'), 0);
  assert.equal(importDateKeyPriority('Data da rota'), 2);
  assert.equal(importDateKeyPriority('campo sem relação'), -1);
  assert.equal(importedRowDate({DATA: '', DATA_1: '2026-08-03', DATE: '2026-09-03'}), '2026-08-03');
  assert.equal(importedRowPeriod({'DATA_1': 'not-a-date'}), '');
});

test('Excel serial dates and invalid months are handled safely', () => {
  assert.equal(importPeriod('46245'), '2026-08');
  assert.equal(importPeriod('2026-13-01'), '');
  assert.equal(importPeriod('31/13/2026'), '');
});

test('date normalization stores valid calendar days and rejects impossible dates', () => {
  assert.equal(importedDateKey('15/09/2026'), '2026-09-15');
  assert.equal(importedDateKey('2026-09-30T00:00:00Z'), '2026-09-30');
  assert.equal(importedDateKey('46245'), '2026-08-11');
  assert.equal(importedDateKey('31/02/2026'), '');
  assert.equal(importedDateKey('2026-02-29'), '');
  assert.equal(importedDateKey('2024-02-29'), '2024-02-29');
});

test('period token normalization preserves quinzenas and removes redundant halves under a full month', () => {
  assert.deepEqual(selectedOperationPeriods(['2026-09:1', '2026-09:2']), ['2026-09:1', '2026-09:2']);
  assert.deepEqual(selectedOperationPeriods(['2026-09:1', '2026-09', 'invalid']), ['2026-09']);
  assert.match(sqlImportRouteDate('r.data'), /make_date/);
  assert.match(sqlImportRouteDate('r.data'), /1899-12-30/);
});

test('date ranges are half-open, exact for month and quinzenas, including leap years', () => {
  assert.deepEqual(importPeriodDateRanges(['2026-09:1']), [{start: '2026-09-01', end: '2026-09-16'}]);
  assert.deepEqual(importPeriodDateRanges(['2026-09:2']), [{start: '2026-09-16', end: '2026-10-01'}]);
  assert.deepEqual(importPeriodDateRanges(['2026-09']), [{start: '2026-09-01', end: '2026-10-01'}]);
  assert.deepEqual(importPeriodDateRanges(['2024-02']), [{start: '2024-02-01', end: '2024-03-01'}]);
  assert.deepEqual(importPeriodDateRanges(['2026-09:1', '2026-09', '2026-09:2']), [{start: '2026-09-01', end: '2026-10-01'}]);
});

test('invoice eligibility fails closed if bonus cannot be confirmed and rejects zero bonus', () => {
  assert.equal(assertInvoiceBonusEligible(130000), 130000);
  assert.throws(() => assertInvoiceBonusEligible(0), error => error.status === 409 && error.code === 'invoice-base-not-bonus-eligible');
  assert.throws(() => assertInvoiceBonusEligible(null), error => error.status === 503 && error.code === 'bonus-eligibility-unavailable');
});

test('invoice periods are monthly only', () => {
  assert.equal(assertMonthlyInvoicePeriod('2026-09').key, '2026-09');
  assert.throws(() => assertMonthlyInvoicePeriod('2026-09:1'), error => error.status === 400 && error.code === 'invoice-period-must-be-monthly');
  assert.throws(() => assertMonthlyInvoicePeriod('invalid'), error => error.status === 400 && error.code === 'invoice-fields-invalid');
});

test('invoice download preserves the original filename and safely encodes it', () => {
  const disposition = invoiceContentDisposition('NF São José.pdf');
  assert.match(disposition, /^attachment; filename="NF Sao Jose\.pdf";/);
  assert.match(disposition, /filename\*=UTF-8''NF%20S%C3%A3o%20Jos%C3%A9\.pdf$/);
  assert.throws(() => invoiceContentDisposition('NF.pdf\r\nX-Evil: yes'), error => error.status === 400 && error.code === 'file-name-invalid');
});

test('SQL date extraction handles case, separators, duplicate suffixes and blank primary headers', () => {
  const sql = sqlImportDateValue('r.data');
  assert.match(sql, /jsonb_each_text\(r\.data\)/);
  assert.match(sql, /regexp_replace\(k\.key/);
  assert.match(sql, /'datadodispatch'/);
  assert.match(sql, /NULLIF\(BTRIM\(k\.value\), ''\) IS NOT NULL/);
  assert.match(sql, /ORDER BY array_position/);
});

test('date-based imports reject rows with no recognizable period before persistence', () => {
  assert.doesNotThrow(() => validateImportDates('LOGICA_FF', [{DATA: '2026-08-01'}]));
  assert.throws(() => validateImportDates('LOGICA_FF', [{Base: 'Cuiabá', Utilização: '100%'}]), error => error.code === 'import-date-column-unrecognized');
  assert.doesNotThrow(() => validateImportDates('FF_LOCADORA', [{Placa: 'ABC1D23'}]));
});
