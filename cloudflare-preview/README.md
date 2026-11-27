# ADI WATER LEAK FINDER — Cloudflare Pages preview

Cette copie est isolée dans `cloudflare-preview/` et ne modifie ni le site commercial, ni la version Netlify en production.

## Déploiement de prévisualisation

Dans Cloudflare Pages, connecter le dépôt GitHub `boudokhanedhafer-code2027/adi-international`, sélectionner la branche `cloudflare-pages-preview`, définir le répertoire racine / répertoire de sortie sur `cloudflare-preview`, sans commande de build. Les Pages Functions sont dans `cloudflare-preview/functions/api/` et exposent :

- `POST /api/landsat-search` : relais STAC vers le catalogue USGS.
- `HEAD /api/landsat-asset?url=...` et `GET` avec en-tête Range : relais limité aux GeoTIFF Landsat USGS.

## Vérifications et limites

- La version Netlify reste inchangée ; ne pas basculer le domaine principal.
- Le code est une adaptation initiale des fonctions Netlify vers l'API Cloudflare Pages Functions. Il doit être déployé et testé sur une URL de prévisualisation avant toute migration.
- Aucun résultat de pixels n'est considéré comme validé tant qu'une lecture GeoTIFF réussie ne l'a pas confirmé.
- Les 100 lignes V5.7 sont des données de démonstration. NDVI/NDMI décrivent la surface et ne prouvent pas une fuite souterraine.
- Aucun secret, achat ou abonnement n'est ajouté.
