# Dashboard Financier Billit

Dashboard financier connecté à l'API Billit Production, déployé sur Netlify.

## Architecture

```
billit-dashboard/
├── public/
│   └── index.html          # Dashboard frontend (pur HTML/CSS/JS)
├── netlify/
│   └── functions/
│       └── billit-proxy.js # Proxy serverless - protège la clé API
├── netlify.toml            # Config Netlify
└── README.md
```

Le frontend appelle `/api/billit?endpoint=...`
La Netlify Function ajoute la clé API et fait le vrai appel vers `https://api.billit.be`
La clé API ne transite jamais dans le navigateur.

---

## Setup Netlify - Variables d'environnement

Dans **Netlify > Site > Environment variables**, ajouter :

| Variable | Valeur | Description |
|---|---|---|
| `BILLIT_API_KEY` | Votre clé API Billit (base64 si Basic Auth) | Trouvable dans MyBillit > Profil > API |
| `BILLIT_PARTY_ID` | Votre PartyID Billit | Trouvable dans MyBillit > Profil |

### Où trouver ces valeurs dans Billit

**PartyID** : MyBillit > Paramètres > Compte > PartyID

**API Key** : MyBillit > Paramètres > API > Clé secrète

> Note : L'API Key Billit s'utilise en header `Authorization: Basic {KEY}` et `PartyID: {PARTY_ID}`

---

## Déploiement GitHub + Netlify

```bash
# 1. Créer le repo GitHub
git init
git add .
git commit -m "init dashboard billit"
git remote add origin https://github.com/VOTRE_USER/billit-dashboard.git
git push -u origin main

# 2. Dans Netlify
# New site > Import from GitHub > sélectionner le repo
# Build settings :
#   Build command : (vide, pas de build)
#   Publish directory : public
# Ajouter les variables d'environnement BILLIT_API_KEY et BILLIT_PARTY_ID
```

---

## Métriques disponibles

### Ventes
- **Facturé à date** : total HTVA des factures émises sur la période, avec répartition payé / à payer et breakdown par client
- **A facturer** : devis non encore facturés (Invoiced = false), hors avances/acomptes, avec breakdown par client
- **Dev pipeline** : devis en statut "attente approbation" (WaitingForApproval), total HTVA

### Achats
- Total HTVA des factures fournisseurs sur la période
- Breakdown par fournisseur
- Breakdown par projet (champ ProjectCode / CostCenter)
- Breakdown par catégorie (VentilationCode / Category)

---

## Ajustements possibles

### Statuts OData Billit

Si les statuts de vos devis diffèrent, adapter les filtres dans `public/index.html` :

- Devis à facturer : `Invoiced eq false` (actuellement)
- Devis en attente approbation : `OrderStatus eq 'WaitingForApproval'` (actuellement)

Autres valeurs possibles pour `OrderStatus` : `Draft`, `ToSend`, `Sent`, `Paid`, `WaitingForApproval`

### Projets et catégories achats

Billit ne stocke pas nativement "projet" et "catégorie" comme champs dédiés.
Les valeurs affichées utilisent dans l'ordre : `ProjectCode`, `ExternalProvider`, `CostCenter` pour les projets,
et `VentilationCode`, `Category` pour les catégories.

Si vous utilisez un champ personnalisé différent, adapter les lignes correspondantes dans la fonction `loadPurchases()`.

### Pagination

La fonction `fetchAllPages()` charge jusqu'à 500 documents par appel (`$top=500`).
Pour de très grands volumes, implémenter une vraie pagination avec `$skip`.
