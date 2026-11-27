# ADI WATER LEAK FINDER — V5.7

Projet indépendant du site commercial ADI INTERNATIONAL.

## Statut

Ce dossier prépare l'intégration de la version V5.7 existante. Le code source complet de V5.7 n'a pas encore été transféré dans ce dossier : ne pas considérer cette page comme une version opérationnelle.

## Organisation prévue

- `index.html` : interface principale V5.7.
- `landsat.js` : recherche et récupération des scènes Landsat depuis un service STAC public compatible.
- `analysis.js` : calcul des indicateurs et présentation des résultats.

## Principes de fiabilité

- Distinguer les acquisitions satellitaires réelles des données de démonstration.
- Afficher la source, la date, la couverture nuageuse et les limites de chaque scène lorsque ces métadonnées sont disponibles.
- Ne jamais présenter un indice satellitaire comme une preuve certaine de fuite d'eau.
- Permettre la recherche par coordonnées et la définition d'une zone d'étude carrée.
- Ne pas modifier le site public ADI INTERNATIONAL.

## Prochaine étape

Importer ici le code source complet de V5.7, puis intégrer et tester la recherche Landsat sur des scènes réelles avant toute publication comme outil opérationnel.
