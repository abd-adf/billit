import { createHash } from 'node:crypto';
import { getStore } from '@netlify/blobs';

// Only the exact reviewed import can be written. No arbitrary upload or edit API.
const IMPORT_SHA256 = 'ed0f4eca5d5c40e3e0303865d1d9cc7ac5af220273c1efb8f75530b23323a91e';
const KEY = `verified/${IMPORT_SHA256}`;
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });

export default async function handler(req) {
  if (!['GET', 'POST'].includes(req.method)) return reply({ error: 'Method not allowed' }, 405);
  const store = getStore({ name: 'dashboard-media', consistency: 'strong' });
  if (req.method === 'POST') {
    if (Number(req.headers.get('content-length')) > 10000) return reply({ error: 'Import too large' }, 413);
    const raw = await req.text();
    if (Buffer.byteLength(raw) > 10000) return reply({ error: 'Import too large' }, 413);
    if (createHash('sha256').update(raw).digest('hex') !== IMPORT_SHA256) {
      return reply({ error: 'This import does not match the reviewed invoices' }, 400);
    }
    const data = JSON.parse(raw);
    const result = await store.setJSON(KEY, data, { onlyIfNew: true });
    return reply({ saved: true, created: result.modified, count: data.invoices.length });
  }
  const data = await store.get(KEY, { type: 'json' });
  if (!data) return reply({ error: 'Les factures médias vérifiées ne sont pas encore disponibles.' }, 503);
  return reply(data);
}
