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
- `VentilationCode` : code comptable
- `Lines` : lignes de commande

## Métriques du dashboard

### 01 - Ventes (Facturé à date)
- **Facturé** = `OrderType=Invoice` + `OrderDirection=Income`, net des `CreditNote` Income
- **A facturer** = `OrderType=Offer` + `OrderStatus=ToInvoice`, net des acomptes détectés
- **Pipeline Dev** = `OrderType=Offer` + `OrderStatus=ApprovalNeeded`
- **Landing 2026** = Facturé + A facturer (KPI violet)

### Détection des acomptes
Les factures d'acompte ont `OrderTitle` contenant :
- FR : "Acompte pour Devis XXXX"
- NL : "Voorschot voor Offerte XXXX"
Le montant est soustrait du devis correspondant dans "A facturer".

### 02 - Achats
- **Total achats** = `OrderType=Invoice` + `OrderDirection=Cost`, net des `CreditNote` Cost
- Breakdown par fournisseur, projet (via ExternalProvider), catégorie (via SUPPLIER_CATEGORY map)
- `SUPPLIER_CATEGORY` dans index.html : mapping fournisseur → catégorie, à compléter si nouveau fournisseur
- **Intragroupe** : KPI achats et ventes intragroupe, via la liste `INTRAGROUP` dans index.html (nom de contrepartie, sans casse). Actuellement : Adfinitas, BONUM GROUP HOLDING. Fundraisers Belgium n'est PAS intragroupe

### 03 - Marge brute par projet
- Données dans `public/projects-data.js` : mapping `{OrderNumber → projet}` pour ventes et achats
- Mise à jour sans export Excel (workflow par défaut) :
  1. `node scripts/check-billit.mjs` (lit `.env`, API en lecture seule) : liste les ventes/achats non mappés, les doublons probables, et régénère `doublons-billit.csv`
  2. Claude propose un projet pour chaque facture non mappée d'après le client/fournisseur et le titre (ex : Amis des Aveugles → ADA_26, titre "ADA - ..." → ADA_26, Greenpeace → GP_26)
  3. L'utilisateur valide les cas ambigus (ex : factures Adfinitas ADI26-xxxx sans titre), puis Claude édite projects-data.js → git push
  - Frais généraux (Securex, Arts 44, Ticket Restaurant, SaaS...) restent volontairement non mappés
- Exports Excel Billit (ventes + achats avec colonne Projet) : seulement pour un contrôle complet, si des flags ont été modifiés dans Billit sur des factures déjà mappées
- Cas particuliers connus : PAF ! SRL → MEMISA_26 ; factures ADI26-0760/0761/0762 → ADA_26

### Doublons d'achats
- Billit empêche souvent de supprimer une facture d'achat payée ou transmise au comptable
- Les doublons sont listés par OrderID dans `PROJECTS_DATA.duplicates` (projects-data.js, avec commentaire) et exclus dans `loadPurchases`
- Cause habituelle : réencodage groupé (ex. le 27/04 et le 18/06) avec la date ajoutée au numéro ("2026-ART-370 31/03/2026") ou un numéro vide / "InvoiceNumber"
- Ne jamais ajouter un doublon sans validation de l'utilisateur ; garder de préférence la version payée
- Après chaque ajout : relancer `node scripts/check-billit.mjs` pour régénérer `doublons-billit.csv` (à la racine, séparateur `;`, pour le comptable) et commiter le CSV
- Projets Billit (`/v1/projects`) : ADA_26, PELICANO_26, EF_26, CHARCOT_26, CAP48_26, GP_26 (Greenpeace), AVE_26, MEMISA_26 (inclut PAF ! SRL), MUCO_26

## Limitations connues de l'API Billit

- `$top` limité à 100 (pas 500)
- Le lien commande → projet n'est PAS exposé par l'API (ni liste, ni détail, ni filtre OData). `/v1/projects` liste les projets mais sans leurs commandes. Seul l'export Excel Billit contient la colonne Projet, d'où projects-data.js
- Le champ `Invoiced` n'est pas filtrable en OData
- Les catégories d'achat ne sont pas dans l'API liste

## Ce qui n'est PAS dans ce projet

- Pas d'authentification utilisateur (dashboard interne, accès par URL)
- Pas de base de données, pas de cache
- Pas de graphiques (tables uniquement)
- Pas de gestion multi-company Billit (un seul PartyID configuré)

## Conventions

- Montants toujours affichés en EUR avec `Intl.NumberFormat('fr-BE')`
- Dates en ISO `YYYY-MM-DD` pour les filtres OData Billit, en date locale (`isoDate`), jamais via `toISOString()` qui recule d'un jour en UTC
- Les notes de crédit ont un `TotalExcl` positif dans l'API : les soustraire via `signedExcl`
- Les filtres OData Billit utilisent `DateTime'YYYY-MM-DD'` comme format
- Pas de tirets cadratin dans les textes UI
