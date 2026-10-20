import test from 'node:test';
import assert from 'node:assert/strict';
import {getInvoiceObject, invoiceObjectKey, invoiceObjectSha256, invoiceStorageSettings, putInvoiceObject, verifyInvoiceObject} from '../invoice-storage.mjs';

test('invoice objects are grouped under their calendar month', () => {
  assert.equal(invoiceObjectKey('2026-09', 'invoice-42', 'NF São José.pdf'), '2026-09/invoice-42/NF São José.pdf');
  assert.equal(invoiceObjectKey('2026-09:2', 'legacy-42', 'NF.pdf'), '2026-09/legacy-42/NF.pdf');
});

test('invoice object keys reject invalid periods and path/control characters', () => {
  assert.throws(() => invoiceObjectKey('2026-13', 'invoice-42', 'NF.pdf'), /invoice-object-key-invalid/);
  assert.throws(() => invoiceObjectKey('2026-09', 'invoice/42', 'NF.pdf'), /invoice-object-key-invalid/);
  assert.equal(invoiceObjectKey('2026-09', 'invoice-42', '..\\NF.pdf'), '2026-09/invoice-42/NF.pdf');
  assert.throws(() => invoiceObjectKey('2026-09', 'invoice-42', 'NF.pdf\n'), /invoice-object-key-invalid/);
});

test('bucket configuration is optional locally but rejects partial production setup', () => {
  assert.equal(invoiceStorageSettings({}), null);
  assert.throws(() => invoiceStorageSettings({INVOICE_S3_BUCKET: 'private-bucket'}), /invoice-storage-config-incomplete/);
  const settings = invoiceStorageSettings({
    INVOICE_S3_ENDPOINT: 'https://s3.example.test',
    INVOICE_S3_BUCKET: 'private-bucket',
    INVOICE_S3_ACCESS_KEY_ID: 'access',
    INVOICE_S3_SECRET_ACCESS_KEY: 'secret',
    INVOICE_S3_URL_STYLE: 'virtual-host'
  });
  assert.equal(settings.region, 'auto');
  assert.equal(settings.forcePathStyle, false);
});

test('invoice object digest is stable for the uploaded bytes', () => {
  assert.equal(invoiceObjectSha256(Buffer.from('invoice bytes')), 'f3cbbf0fb1cedd39097a0159ee1b5e1a85fec1efcf8150399a6d25c3cf9739f3');
});

test('bucket uploads, reads and verifies the original bytes', async () => {
  const stored = new Map();
  const storage = {bucket: 'private-bucket', client: {send: async command => {
    if (command.constructor.name === 'PutObjectCommand') {
      stored.set(command.input.Key, {body: Buffer.from(command.input.Body), size: command.input.ContentLength, sha256: command.input.Metadata.sha256, contentType: command.input.ContentType});
      return {};
    }
    if (command.constructor.name === 'HeadObjectCommand') {
      const item = stored.get(command.input.Key);
      return item ? {ContentLength: item.size, Metadata: {sha256: item.sha256}} : {};
    }
    if (command.constructor.name === 'GetObjectCommand') {
      const item = stored.get(command.input.Key);
      return {Body: {transformToByteArray: async () => item.body}};
    }
    throw new Error('unexpected-command');
  }}};
  const body = Buffer.from('original PDF bytes');
  const result = await putInvoiceObject(storage, {key: '2026-09/id/NF.pdf', body, contentType: 'application/pdf'});
  assert.equal(result.size, body.length);
  assert.equal(await verifyInvoiceObject(storage, '2026-09/id/NF.pdf', result), true);
  assert.deepEqual(await getInvoiceObject(storage, '2026-09/id/NF.pdf'), body);
});
