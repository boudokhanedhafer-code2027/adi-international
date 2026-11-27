# ADI WATER LEAK FINDER — V6.0 expérimentale

Projet indépendant du site commercial ADI INTERNATIONAL.

## État du prototype

- `water-leak-finder/index.html` : tableau de bord de démonstration V5.7, recherche de scènes Landsat, inspection des ressources et lecture expérimentale des pixels GeoTIFF.
- `netlify/functions/landsat-search.js` : relais serveur Netlify pour le catalogue public USGS Landsat STAC.
- `netlify/functions/landsat-asset.js` : relais HTTP Range limité aux fichiers GeoTIFF Landsat Collection 2 Level-2 du domaine public USGS.
- L'analyse raster est séparée des 100 lignes synthétiques V5.7.
- La lecture tente un échantillonnage d'au plus 64 × 64 cellules par bande pour B4 (rouge), B5 (proche infrarouge), B6 (SWIR) et QA_PIXEL.
- Les réflectances de surface Landsat Collection 2 Level-2 sont converties avec le facteur 0,0000275 et le décalage −0,2 avant le calcul du NDVI et du NDMI.
- Les bits QA_PIXEL 0 à 5 sont écartés (pixels de remplissage, nuages dilatés, cirrus, nuages, ombres et neige).
- Le résultat indique moyenne, minimum, maximum et nombre de pixels valides.

## Limites importantes

- La fonction de relais et le code navigateur doivent être testés sur le déploiement Netlify. GitHub Pages ne fournit pas les fonctions Netlify.
- Le navigateur charge GeoTIFF.js et proj4.js depuis jsDelivr. Une connexion à ces bibliothèques externes est donc nécessaire.
- L'analyse ne traite qu'un échantillon réduit, pas l'intégralité de la scène. Elle dépend de la disponibilité des COG USGS, des requêtes HTTP Range, de la projection et de la qualité des pixels.
- Le prototype suppose une projection UTM calculée depuis les coordonnées de la zone. Vérifier le CRS de la scène et l'emprise affichée avant toute interprétation.
- La liste des ressources fournie pour la scène testée ne contenait pas de bande thermique. Aucune température satellite n'est donc calculée dans V6.0.
- Aucune bande radar VV/VH Sentinel-1 n'est traitée par ce module Landsat.
- Les 100 lignes intégrées restent des données de démonstration et ne sont jamais utilisées dans le calcul raster.
- NDVI et NDMI décrivent des propriétés de surface. Ils ne localisent pas directement une canalisation et ne prouvent pas une fuite d'eau souterraine. Une anomalie nécessite des données complémentaires et une vérification indépendante sur le terrain.

## Test V6.0

1. Ouvrir la version Netlify : https://adi-international.netlify.app/water-leak-finder/
2. Charger l'exemple Abobo et lancer une recherche Landsat.
3. Sur une scène, cliquer sur « Examiner les ressources de cette scène ».
4. Cliquer sur « Analyser les pixels de la scène sélectionnée ».
5. Vérifier le message d'état et les nombres de pixels valides. Si la lecture échoue, copier le message exact pour corriger le proxy, la projection ou l'accès COG.

Aucun achat, abonnement ni identifiant privé n'est ajouté.
Le site commercial principal ADI INTERNATIONAL n'est pas modifié par cette intégration.
