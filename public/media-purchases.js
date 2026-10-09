// Reconcile reviewed invoice data with Billit without writing to Billit.
(function (root) {
  const suppliers = { Google: 'GOOGLE IRELAND LIMITED', Meta: 'META PLATFORMS IRELAND LIMITED' };
  const normalize = value => String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
  const reference = value => normalize(value).replace(/\s+\d{2}\/\d{2}\/\d{4}$/, '');
  const key = (supplier, number) => `${normalize(supplier)}|${reference(number)}`;

  function validate(data) {
    if (data?.version !== 1 || data.project !== 'EF_26' || !Array.isArray(data.invoices) || !data.invoices.length) {
      throw new Error('Import médias absent ou invalide');
    }
    const keys = new Set();
    for (const item of data.invoices) {
      if (!suppliers[item.supplier] || !item.reference || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) ||
          !Number.isSafeInteger(item.cents) || !item.cents || !Number.isFinite(Date.parse(item.date)) ||
          new Date(item.date).toISOString().slice(0, 10) !== item.date) throw new Error('Facture média invalide');
      const id = key(suppliers[item.supplier], item.reference);
      if (keys.has(id)) throw new Error('Référence média répétée dans l’import');
      keys.add(id);
    }
    return data;
  }

  function merge(billitItems, source, from, to) {
    const data = validate(source);
    const verified = new Map(data.invoices.map(row => [key(suppliers[row.supplier], row.reference), row]));
    const matched = new Map();
    const items = [];
    for (const item of billitItems) {
      const id = key(item.CounterParty?.DisplayName, item.OrderNumber);
      const row = verified.get(id);
      // Credit note/invoice identity must match too. Other Billit entries are untouched.
      if (item.OrderDirection === 'Cost' && row && item.OrderType === (row.cents < 0 ? 'CreditNote' : 'Invoice')) {
        if (!matched.has(id)) matched.set(id, []);
        matched.get(id).push(item);
      } else items.push(item);
    }
    const media = [];
    let deltaCents = 0;
    for (const [id, row] of verified) {
      const existing = matched.get(id) || [];
      const rawCents = existing.reduce((sum, item) => sum + Math.round(item.TotalExcl * 100) * (item.OrderType === 'CreditNote' ? -1 : 1), 0);
      // The PDF date controls the reviewed invoice period, including when Billit differs.
      if (row.date < from || row.date > to) { deltaCents -= rawCents; continue; }
      const amount = Math.abs(row.cents) / 100;
      const status = !existing.length ? 'Ajout dashboard' : rawCents !== row.cents ? 'Montant corrigé dans le dashboard' : 'Déjà dans Billit';
      const item = {
        ...existing[0], OrderID: existing[0]?.OrderID || `media:${id}`,
        OrderNumber: row.reference, OrderDate: row.date, OrderDirection: 'Cost',
        OrderType: row.cents < 0 ? 'CreditNote' : 'Invoice',
        TotalExcl: amount, TotalIncl: amount, TotalVAT: 0, Currency: 'EUR',
        CounterParty: { ...existing[0]?.CounterParty, DisplayName: suppliers[row.supplier] },
        ProjectCode: data.project, DashboardProject: data.project,
        DashboardSource: status,
      };
      items.push(item);
      media.push({ ...row, project: data.project, status, billitCents: rawCents });
      deltaCents += row.cents - rawCents;
    }
    media.sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference));
    return { items, media, deltaCents, checkedOn: data.checkedOn };
  }

  const api = { validate, merge };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MediaPurchases = api;
})(typeof window !== 'undefined' ? window : this);
