# ADI INTERNATIONAL — Module livraison V1

## Statut
Prototype front-end autonome de démonstration, dans la branche `feature/delivery-module-v1`. Il n'est pas intégré au site public et ne constitue pas un système de livraison opérationnel.

## Ouvrir le prototype
Après fusion et publication volontaire, le chemin sera `/delivery/`. Avant fusion, il peut être prévisualisé depuis la branche avec GitHub Pages uniquement si une prévisualisation de branche est configurée ; aucune publication n'est demandée ici.

## Fonctions de démonstration
- Création locale de dossiers d'expédition fictifs.
- Champs destination, fournisseur, transporteur envisagé, acceptation de l'étiquette ADI et emballage neutre.
- Comparaison visuelle de tarifs et délais explicitement fictifs pour France, Tunisie et Côte d'Ivoire.
- Création d'incidents fictifs : retard, non-livraison, perte, refus, douane, retour, réclamation.
- Décisions de test sur les incidents et liste locale sur l'appareil.

## Non développé / non connecté
- Aucun fournisseur ou transporteur connecté ; aucun devis, tarif ou délai réel.
- Aucun numéro de suivi réel ni webhook/API de transporteur.
- Aucun backend, authentification, rôle, base de données ou journal d'audit serveur.
- Aucun document douanier ou conseil tarifaire automatisé.
- Aucun paiement, commande fournisseur, achat, étiquette, envoi, retour payant, remboursement ou remplacement.
- Aucune connexion avec le catalogue, le formulaire client ou le paiement ADI.

## Verrous obligatoires
1. Expédition directe uniquement après confirmation des conditions fournisseur/transporteur et du paiement client.
2. Emballage neutre et étiquette ADI uniquement après preuve écrite distincte de l'accord du fournisseur et du transporteur.
3. Vérifier frais, délais, restrictions, valeur, origine, description, classification, taxes et droits auprès de sources compétentes ; ne jamais inventer.
4. Aucun achat, dépense, publication, retour payant, remboursement ou remplacement sans approbation humaine explicite.
5. L'approbation de publication ne vaut jamais approbation d'achat.
6. Ne jamais saisir de données personnelles ou de véritables dossiers clients dans cette démonstration.

## Tests manuels conseillés
- Créer un dossier de test pour chacune des trois destinations.
- Vérifier que les données apparaissent dans la liste et persistent localement au rechargement.
- Créer un incident de chaque type, enregistrer une décision de test puis le clôturer.
- Vérifier l'affichage mobile et desktop.
- Vérifier qu'aucune action n'envoie de requête réseau ou n'effectue d'opération financière.

## Prochaine phase
Concevoir un backend privé avec authentification, rôles, stockage, journal d'audit immuable et API serveur. Ajouter les intégrations transporteurs seulement après sélection et validation contractuelle. Les tarifs et suivis doivent provenir de réponses vérifiables du transporteur, avec date et destination. Ne pas placer de secrets API dans le navigateur ou le dépôt.
