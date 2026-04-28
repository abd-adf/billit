# Contexte projet - Dashboard Financier Billit

## Ce que c'est

Dashboard financier interne connecté à l'API Billit Production.
Déployé sur Netlify, code hébergé sur GitHub (https://github.com/abd-adf/billit.git).
Pas de framework, pas de build step - HTML/CSS/JS vanilla + une Netlify Function Node.js.

## Stack

- Frontend : HTML/CSS/JS vanilla dans `public/index.html`
- Backend : Netlify Function (ESM) dans `netlify/functions/billit-proxy.js`
- Déploiement : Netlify (publish dir = `public`, functions dir = `netlify/functions`)
- API : Billit Production (`https://api.billit.be`)
- Données projet : `public/projects-data.js` (mapping statique, mis à jour manuellement)

## Architecture des appels API

Le frontend ne contacte jamais Billit directement.
Il appelle `/api/billit?endpoint=...`
La Netlify Function ajoute les credentials et proxifie vers Billit.

```
Browser → /api/billit?endpoint=/v1/orders?$filter=... → Netlify Function → api.billit.be
```

## Variables d'environnement (Netlify, jamais commitées)

- `BILLIT_API_KEY` : clé API Billit, injectée en header `ApiKey: {KEY}` (UUID, pas Basic/Bearer)
- `BILLIT_PARTY_ID` : PartyID Billit (6 chiffres), injecté en header `PartyID: {ID}`

En local avec `netlify dev`, créer un fichier `.env` à la racine (ignoré par git).

## API Billit - ce qu'on utilise

Endpoint : `GET /v1/orders` avec filtres OData. Limite `$top=100` max.

Champs clés dans la réponse liste :
- `OrderType` : `Invoice` | `Offer` | `CreditNote` (attention : pas "Quotation", c'est "Offer")
- `OrderDirection` : `Income` (ventes) | `Cost` (achats)
- `OrderStatus` : `Draft` | `ToSend` | `ToInvoice` | `ApprovalNeeded` | `Paid` | `Invoiced` | `Refused`
- `TotalExcl` : montant HTVA
- `TotalIncl` : montant TVAC
- `Paid` : boolean
- `OrderNumber` : numéro de commande (string)
- `OrderTitle` : titre/objet de la commande
- `CounterParty.DisplayName` : nom client ou fournisseur
- `OrderDate` : date du document
- `ExternalProvider` : source externe (ex: Peppol, APIFeed)

Champs NON disponibles dans la liste (seulement dans le détail `/v1/orders/{id}`) :
- `Projet` : code projet (ex: ADA_26) - c'est pourquoi on utilise projects-data.js
- `VentilationCode` : code comptable
- `Lines` : lignes de commande

## Métriques du dashboard

### 01 - Ventes (Facturé à date)
- **Facturé** = `OrderType=Invoice` + `OrderDirection=Income`
- **A facturer** = `OrderType=Offer` + `OrderStatus=ToInvoice`, net des acomptes détectés
- **Pipeline Dev** = `OrderType=Offer` + `OrderStatus=ApprovalNeeded`
- **Landing 2026** = Facturé + A facturer (KPI violet)

### Détection des acomptes
Les factures d'acompte ont `OrderTitle` contenant :
- FR : "Acompte pour Devis XXXX"
- NL : "Voorschot voor Offerte XXXX"
Le montant est soustrait du devis correspondant dans "A facturer".

### 02 - Achats
- **Total achats** = `OrderType=Invoice` + `OrderDirection=Cost`
- Breakdown par fournisseur, projet (via ExternalProvider), catégorie (via SUPPLIER_CATEGORY map)
- `SUPPLIER_CATEGORY` dans index.html : mapping fournisseur → catégorie, à compléter si nouveau fournisseur

### 03 - Marge brute par projet
- Données dans `public/projects-data.js` : mapping `{OrderNumber → projet}` pour ventes et achats
- À mettre à jour mensuellement depuis exports Excel Billit (ventes + achats avec colonne Projet)
- Workflow : user envoie les deux xlsx → Claude génère le nouveau projects-data.js → git push
- Projets actuels : ADA_26, PELICANO_26, EF_26, CHARCOT_26

## Limitations connues de l'API Billit

- `$top` limité à 100 (pas 500)
- Le champ `Projet` n'est pas dans la liste `/v1/orders`, seulement dans le détail
- Le champ `Invoiced` n'est pas filtrable en OData
- Les catégories d'achat ne sont pas dans l'API liste

## Ce qui n'est PAS dans ce projet

- Pas d'authentification utilisateur (dashboard interne, accès par URL)
- Pas de base de données, pas de cache
- Pas de graphiques (tables uniquement)
- Pas de gestion multi-company Billit (un seul PartyID configuré)

## Conventions

- Montants toujours affichés en EUR avec `Intl.NumberFormat('fr-BE')`
- Dates en ISO `YYYY-MM-DD` pour les filtres OData Billit
- Les filtres OData Billit utilisent `DateTime'YYYY-MM-DD'` comme format
- Pas de tirets cadratin dans les textes UI
