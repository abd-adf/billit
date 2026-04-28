# Contexte projet - Dashboard Financier Billit

## Ce que c'est

Dashboard financier interne connecté à l'API Billit Production.
Déployé sur Netlify, code hébergé sur GitHub.
Pas de framework, pas de build step - HTML/CSS/JS vanilla + une Netlify Function Node.js.

## Stack

- Frontend : HTML/CSS/JS vanilla dans `public/index.html`
- Backend : Netlify Function (ESM) dans `netlify/functions/billit-proxy.js`
- Déploiement : Netlify (publish dir = `public`, functions dir = `netlify/functions`)
- API : Billit Production (`https://api.billit.be`)

## Architecture des appels API

Le frontend ne contacte jamais Billit directement.
Il appelle `/api/billit?endpoint=...`
La Netlify Function ajoute les credentials et proxifie vers Billit.

```
Browser → /api/billit?endpoint=/v1/orders?$filter=... → Netlify Function → api.billit.be
```

## Variables d'environnement (Netlify, jamais commitées)

- `BILLIT_API_KEY` : clé API Billit, injectée en header `Authorization: Basic {KEY}`
- `BILLIT_PARTY_ID` : PartyID Billit, injecté en header `PartyID: {ID}`

En local avec `netlify dev`, créer un fichier `.env` à la racine (ignoré par git) :
```
BILLIT_API_KEY=xxxx
BILLIT_PARTY_ID=xxxx
```

## API Billit - ce qu'on utilise

Endpoint unique : `GET /v1/orders` avec filtres OData.

Champs clés dans la réponse :
- `OrderType` : `Invoice` | `Quotation` | `CreditNote`
- `OrderDirection` : `Income` (ventes) | `Cost` (achats)
- `OrderStatus` : `Draft` | `ToSend` | `Sent` | `Paid` | `WaitingForApproval`
- `TotalExcl` : montant HTVA
- `TotalIncl` : montant TVAC
- `Paid` : boolean
- `Invoiced` : boolean (true = devis déjà facturé)
- `CounterParty.DisplayName` : nom client ou fournisseur
- `OrderDate` : date du document

Pagination : `$top=500` pour l'instant (suffisant). Si besoin de scaler, implémenter `$skip`.

## Métriques du dashboard

### Ventes
- **Facturé à date** = `OrderType=Invoice` + `OrderDirection=Income` sur la période
  - Total HTVA, dont payé (`Paid=true`) et à payer (`Paid=false`)
  - Breakdown par client (`CounterParty.DisplayName`)
- **A facturer** = `OrderType=Quotation` + `Invoiced=false` sur la période
  - Les lignes contenant "avance" ou "acompte" dans OrderNumber/Remarks/Description sont exclues
  - Breakdown par client
- **Dev pipeline** = `OrderType=Quotation` + `OrderStatus=WaitingForApproval` sur la période
  - Total HTVA uniquement

### Achats
- **Total achats** = `OrderType=Invoice` + `OrderDirection=Cost` sur la période
- Breakdown par fournisseur (`CounterParty.DisplayName`)
- Breakdown par projet (`ProjectCode` ou `CostCenter` ou `ExternalProvider`)
- Breakdown par catégorie (`VentilationCode` ou `Category`)

> Note : les champs "projet" et "catégorie" achats ne sont pas natifs dans Billit.
> Si le client utilise d'autres champs, adapter `loadPurchases()` dans `index.html`.

## Ce qui n'est PAS dans ce projet

- Pas d'authentification utilisateur (dashboard interne, accès par URL)
- Pas de base de données, pas de cache
- Pas de graphiques (tables uniquement pour l'instant)
- Pas de gestion multi-company Billit (un seul PartyID configuré)

## Conventions

- Montants toujours affichés en EUR avec `Intl.NumberFormat('fr-BE')`
- Dates en ISO `YYYY-MM-DD` pour les filtres OData Billit
- Pas de tirets cadratin dans les textes UI
- Les filtres OData Billit utilisent `DateTime'YYYY-MM-DD'` comme format
