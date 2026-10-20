import pg from 'pg';
import {getInvoiceStorage, invoiceObjectKey, putInvoiceObject, verifyInvoiceObject} from '../invoice-storage.mjs';

const {Pool} = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const storage = getInvoiceStorage();
if (!storage) throw new Error('Invoice S3 storage is not configured');
const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === 'disable' ? false : connectionString.includes('railway.internal') ? false : {rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false'},
  max: 2,
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 5000),
  idleTimeoutMillis: 10000
});

try {
  let lastId = 0;
  let copied = 0;
  while (true) {
    const batch = await pool.query('SELECT id, period, file_name, mime_type, file_data FROM invoices WHERE id > $1 AND storage_key IS NULL AND file_data IS NOT NULL ORDER BY id LIMIT 25', [lastId]);
    if (!batch.rowCount) break;
    for (const invoice of batch.rows) {
      lastId = Number(invoice.id);
      const body = Buffer.from(invoice.file_data);
      if (!body.length) throw new Error(`Invoice ${invoice.id} has empty file data`);
      const key = invoiceObjectKey(invoice.period, `legacy-${invoice.id}`, invoice.file_name);
      const uploaded = await putInvoiceObject(storage, {key, body, contentType: invoice.mime_type || 'application/octet-stream'});
      if (!await verifyInvoiceObject(storage, key, uploaded)) throw new Error(`Bucket verification failed for invoice ${invoice.id}`);
      await pool.query('UPDATE invoices SET storage_key=$1 WHERE id=$2 AND storage_key IS NULL', [key, invoice.id]);
      copied++;
      process.stdout.write(`Migrated invoice id ${invoice.id} to ${invoice.period}\n`);
    }
  }
  const remaining = await pool.query('SELECT COUNT(*)::int AS count FROM invoices WHERE storage_key IS NULL AND file_data IS NOT NULL');
  process.stdout.write(`Migration complete: ${copied} copied; ${remaining.rows[0].count} remaining in database-only storage. Database file copies were preserved.\n`);
} finally {
  await pool.end();
  storage.client.destroy();
}
