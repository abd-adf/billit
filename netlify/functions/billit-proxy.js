// netlify/functions/billit-proxy.js
// Proxy securisé vers l'API Billit - la clé API ne quitte jamais le serveur

const BILLIT_API_BASE = 'https://api.billit.be';

export default async (req, context) => {
  // CORS pour dev local
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers });
  }

  const BILLIT_API_KEY = process.env.BILLIT_API_KEY;
  const BILLIT_PARTY_ID = process.env.BILLIT_PARTY_ID;

  if (!BILLIT_API_KEY || !BILLIT_PARTY_ID) {
    return new Response(
      JSON.stringify({ error: 'Variables d\'environnement BILLIT_API_KEY et BILLIT_PARTY_ID manquantes.' }),
      { status: 500, headers }
    );
  }

  const url = new URL(req.url);
  // Le param "endpoint" contient le chemin + query string Billit
  const billitPath = url.searchParams.get('endpoint');

  if (!billitPath) {
    return new Response(JSON.stringify({ error: 'Paramètre "endpoint" manquant.' }), { status: 400, headers });
  }

  const billitUrl = `${BILLIT_API_BASE}${billitPath}`;

  try {
    const response = await fetch(billitUrl, {
      method: 'GET',
      headers: {
        'ApiKey': BILLIT_API_KEY,
        'PartyID': BILLIT_PARTY_ID,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Erreur lors de l\'appel à l\'API Billit.', detail: err.message }),
      { status: 502, headers }
    );
  }
};

export const config = {
  path: '/api/billit',
};
