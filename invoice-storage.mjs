import {createHash} from 'node:crypto';
import {DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client} from '@aws-sdk/client-s3';

const requiredStorageSettings = ['INVOICE_S3_ENDPOINT', 'INVOICE_S3_BUCKET', 'INVOICE_S3_ACCESS_KEY_ID', 'INVOICE_S3_SECRET_ACCESS_KEY'];
let cachedStorageSignature = '';
let cachedStorage = null;

export function invoiceStorageSettings(env = process.env) {
  const present = requiredStorageSettings.filter(key => String(env[key] || '').trim());
  if (!present.length) return null;
  if (present.length !== requiredStorageSettings.length) throw new Error('invoice-storage-config-incomplete');
  const urlStyle = String(env.INVOICE_S3_URL_STYLE || 'path').trim().toLowerCase();
  if (!['path', 'virtual-host'].includes(urlStyle)) throw new Error('invoice-storage-url-style-invalid');
  return {
    endpoint: String(env.INVOICE_S3_ENDPOINT).trim(),
    bucket: String(env.INVOICE_S3_BUCKET).trim(),
    region: String(env.INVOICE_S3_REGION || 'auto').trim(),
    accessKeyId: String(env.INVOICE_S3_ACCESS_KEY_ID).trim(),
    secretAccessKey: String(env.INVOICE_S3_SECRET_ACCESS_KEY),
    forcePathStyle: urlStyle === 'path'
  };
}

export function invoiceObjectKey(period, id, fileName) {
  const month = String(period || '').trim();
  const objectId = String(id || '').trim();
  const monthKey = month.match(/^(\d{4}-(?:0[1-9]|1[0-2]))(?::[12])?$/)?.[1];
  if (!monthKey || !/^[A-Za-z0-9-]{1,80}$/.test(objectId)) throw new Error('invoice-object-key-invalid');
  const rawName = String(fileName || '').normalize('NFC').split(/[\\/]/).pop();
  if (!rawName || /[\u0000-\u001f\u007f]/.test(rawName)) throw new Error('invoice-object-key-invalid');
  const originalName = rawName.trim();
  if (!originalName || originalName === '.' || originalName === '..') throw new Error('invoice-object-key-invalid');
  const safeName = originalName.replace(/[^\p{L}\p{N}._ -]/gu, '_');
  return `${monthKey}/${objectId}/${safeName}`;
}

export function invoiceObjectSha256(body) {
  return createHash('sha256').update(body).digest('hex');
}

export function getInvoiceStorage(env = process.env) {
  const settings = invoiceStorageSettings(env);
  if (!settings) return null;
  const signature = JSON.stringify(settings);
  if (cachedStorage && cachedStorageSignature === signature) return cachedStorage;
  cachedStorage = {
    ...settings,
    client: new S3Client({
      endpoint: settings.endpoint,
      region: settings.region,
      forcePathStyle: settings.forcePathStyle,
      credentials: {accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey}
    })
  };
  cachedStorageSignature = signature;
  return cachedStorage;
}

export async function putInvoiceObject(storage, {key, body, contentType}) {
  const bytes = Buffer.from(body);
  await storage.client.send(new PutObjectCommand({
    Bucket: storage.bucket,
    Key: key,
    Body: bytes,
    ContentLength: bytes.length,
    ContentType: contentType,
    Metadata: {sha256: invoiceObjectSha256(bytes)}
  }));
  return {size: bytes.length, sha256: invoiceObjectSha256(bytes)};
}

export async function getInvoiceObject(storage, key) {
  const result = await storage.client.send(new GetObjectCommand({Bucket: storage.bucket, Key: key}));
  if (!result.Body) throw new Error('invoice-object-empty');
  const bytes = Buffer.from(await result.Body.transformToByteArray());
  if (!bytes.length) throw new Error('invoice-object-empty');
  return bytes;
}

export async function verifyInvoiceObject(storage, key, expected) {
  const result = await storage.client.send(new HeadObjectCommand({Bucket: storage.bucket, Key: key}));
  return Number(result.ContentLength) === Number(expected.size) && result.Metadata?.sha256 === expected.sha256;
}

export async function deleteInvoiceObject(storage, key) {
  await storage.client.send(new DeleteObjectCommand({Bucket: storage.bucket, Key: key}));
}
