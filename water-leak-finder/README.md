# ADI WATER LEAK FINDER — V5.9

Projet indépendant du site commercial ADI INTERNATIONAL.

## État du prototype

- `index.html` : tableau de bord V5.7 de démonstration, recherche de scènes Landsat et inspection des ressources en V5.9.
- `netlify/functions/landsat-search.js` : relais serveur Netlify qui transmet les recherches au catalogue public USGS Landsat STAC.
- Le relais valide les coordonnées, la période, la couverture nuageuse et le nombre de résultats.
- La recherche doit être testée sur le déploiement Netlify. GitHub Pages ne fournit pas les fonctions Netlify.

## Limites actuelles

- Le relais résout le problème d'appel direct depuis le navigateur dans les cas où le catalogue bloque les requêtes cross-origin. Il ne garantit pas que le catalogue USGS soit toujours disponible.
- La V5.9 permet d'examiner les ressources listées par le catalogue pour chaque scène (bandes, aperçus et fichiers de métadonnées).
- Elle ne télécharge pas encore les pixels raster et ne calcule pas encore NDVI, température ou indicateurs sur les pixels.
- Les 100 lignes intégrées restent des données de démonstration et ne sont pas des observations satellite.
- Une anomalie satellitaire ne constitue pas une preuve de fuite d'eau. Toute hypothèse doit être vérifiée avec des données adaptées et sur le terrain.

## Test

1. Ouvrir la version Netlify : `https://adi-international.netlify.app/water-leak-finder/`
2. Cliquer sur « Charger exemple Abobo » ou saisir une zone.
3. Lancer « Rechercher les scènes Landsat ».
4. Vérifier les identifiants, dates et couvertures nuageuses retournés.
5. Cliquer sur « Examiner les ressources de cette scène » pour afficher la liste complète des ressources fournies par STAC.
6. Si une erreur apparaît, conserver le message exact pour le diagnostic.

Aucun achat, abonnement ni identifiant privé n'est ajouté par ce prototype.
Le site principal ADI INTERNATIONAL n'est pas modifié par cette intégration.
