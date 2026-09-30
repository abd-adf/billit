// Controle de coherence Billit ↔ projects-data.js
// Usage : node scripts/check-billit.mjs [AAAA-MM-JJ]   (defaut : 1er janvier de l'annee en cours)
// Lit BILLIT_API_KEY / BILLIT_PARTY_ID dans .env et appelle l'API Billit en lecture seule.
// Affiche : factures non mappees a un projet, doublons probables d'achats,
// et regenere doublons-billit.csv a partir de PROJECTS_DATA.duplicates.
import fs from 'fs';

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
  const i = l.indexOf('=');
  return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
}));
const HEADERS = { ApiKey: env.BILLIT_API_KEY, PartyID: env.BILLIT_PARTY_ID };
const PROJECTS_DATA = new Function(fs.readFileSync('public/projects-data.js', 'utf8') + '\nreturn PROJECTS_DATA;')();
const from = process.argv[2] || `${new Date().getFullYear()}-01-01`;

async function get(path) {
  const r = await fetch('https://api.billit.be' + path, { headers: HEADERS });
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  return r.json();
}

async function fetchAll(direction) {
  const filter = encodeURIComponent(`(OrderType eq 'Invoice' or OrderType eq 'CreditNote') and OrderDirection eq '${direction}' and OrderDate ge DateTime'${from}'`);
  const all = [];
  for (let skip = 0; ; skip += 100) {
    const items = (await get(`/v1/orders?$filter=${filter}&$top=100&$skip=${skip}`)).Items;
    all.push(...items);
    if (items.length < 100) return all;
  }
}

const signedExcl = o => (o.OrderType === 'CreditNote' ? -1 : 1) * (o.TotalExcl || 0);
const line = o => [o.OrderType === 'CreditNote' ? 'NC' : 'F', o.OrderNumber || '(vide)', o.OrderDate.slice(0, 10),
  o.CounterParty?.DisplayName, signedExcl(o), o.OrderTitle || '', `ID=${o.OrderID}`].join(' | ');
const normNum = n => (n || '').replace(/\s+\d{2}\/\d{2}\/\d{4}$/, '').replace(/\s+/g, '').toUpperCase();

const [sales, costs] = await Promise.all([fetchAll('Income'), fetchAll('Cost')]);
const dup = new Set(PROJECTS_DATA.duplicates || []);

console.log(`\n=== Projets Billit ===`);
console.log((await get('/v1/projects')).map(p => `${p.ProjectName} (${p.Status})`).join(', '));

console.log(`\n=== Ventes non mappees (depuis ${from}) ===`);
sales.filter(o => !PROJECTS_DATA.sales[o.OrderNumber]).forEach(o => console.log('  ' + line(o)));

console.log(`\n=== Achats non mappees (hors doublons), tries par montant ===`);
costs.filter(o => !PROJECTS_DATA.purchases[o.OrderNumber] && !dup.has(o.OrderID))
  .sort((a, b) => b.TotalExcl - a.TotalExcl).forEach(o => console.log('  ' + line(o)));

// Doublons probables : meme fournisseur, meme montant, meme type, et
// (numero normalise identique OU dates a moins de 7 jours avec un numero vide/generique)
console.log(`\n=== Doublons probables d'achats non encore exclus ===`);
const live = costs.filter(o => !dup.has(o.OrderID));
const seen = new Set();
for (const a of live) for (const b of live) {
  if (a.OrderID >= b.OrderID || a.OrderType !== b.OrderType) continue;
  if (a.CounterParty?.DisplayName !== b.CounterParty?.DisplayName || a.TotalExcl !== b.TotalExcl || !a.TotalExcl) continue;
  const days = Math.abs(new Date(a.OrderDate) - new Date(b.OrderDate)) / 864e5;
  const sameNum = normNum(a.OrderNumber) && normNum(a.OrderNumber) === normNum(b.OrderNumber);
  const weakNum = [a, b].some(o => !o.OrderNumber || /^(InvoiceNumber|Date)$/i.test(o.OrderNumber));
  if (sameNum || (weakNum && days <= 7)) {
    const k = a.OrderID + '-' + b.OrderID; if (seen.has(k)) continue; seen.add(k);
    console.log(`  ${line(a)}\n    = ${line(b)}\n`);
  }
}

// CSV pour le comptable (separateur ; + BOM pour Excel BE)
const byId = Object.fromEntries(costs.map(o => [o.OrderID, o]));
const rows = [['OrderID doublon', 'Fournisseur', 'Numero doublon', 'Date', 'HTVA', 'TVAC', 'Statut', 'Paye', 'Cree le', 'Numero original conserve', 'OrderID original']];
for (const id of PROJECTS_DATA.duplicates || []) {
  const o = byId[id];
  if (!o) { rows.push([id, '(introuvable, supprime ?)', '', '', '', '', '', '', '', '', '']); continue; }
  const orig = costs.find(x => x.OrderID !== id && !dup.has(x.OrderID) && x.CounterParty?.DisplayName === o.CounterParty?.DisplayName
    && x.TotalExcl === o.TotalExcl && Math.abs(new Date(x.OrderDate) - new Date(o.OrderDate)) / 864e5 <= 7);
  rows.push([id, o.CounterParty?.DisplayName, o.OrderNumber || '(vide)', o.OrderDate.slice(0, 10),
    String(o.TotalExcl).replace('.', ','), String(o.TotalIncl).replace('.', ','), o.OrderStatus, o.Paid ? 'oui' : 'non',
    o.Created.slice(0, 10), orig?.OrderNumber || '', orig?.OrderID || '']);
}
const csv = '﻿' + rows.map(r => r.map(c => /[;"\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c).join(';')).join('\r\n') + '\r\n';
fs.writeFileSync('doublons-billit.csv', csv);
const total = (PROJECTS_DATA.duplicates || []).reduce((s, id) => s + (byId[id]?.TotalExcl || 0), 0);
console.log(`doublons-billit.csv regenere : ${rows.length - 1} doublons, ${total.toFixed(2)} EUR HTVA exclus`);
