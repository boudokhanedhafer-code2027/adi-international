# ADI INTERNATIONAL — Espace privé de validation

> Document de préparation technique. Cet espace n'est pas encore en ligne et ne constitue pas une interface d'administration active.

## Objectif

Créer un espace réservé aux personnes autorisées pour examiner les offres fournisseurs avant toute publication sur le catalogue public.

## Règles obligatoires

1. Toute offre importée est privée par défaut.
2. Une offre doit conserver son fournisseur, son URL source et sa date de vérification.
3. Le prix du produit et les frais de livraison restent affichés séparément.
4. Une livraison non confirmée pour la destination choisie doit être signalée comme « à confirmer ».
5. Aucun prix, stock, délai, frais, taxe ou caractéristique ne doit être inventé.
6. Une offre ne peut être publiée qu'après vérification et approbation humaine explicite.
7. L'approbation de publication n'autorise jamais un achat fournisseur.
8. Aucun achat ni aucune dépense ne peut être déclenché automatiquement. Toute commande future nécessitera le paiement client confirmé et une approbation humaine distincte.
9. Les secrets API et mots de passe ne doivent jamais être enregistrés dans le dépôt GitHub ou dans le code du navigateur.

## Parcours d'une offre

`imported` → `verification_pending` → `verified_pending_approval` → `approved_for_publication` → `published`

Une offre peut également passer à `rejected`. Toute modification importante après approbation doit remettre l'offre en attente de vérification.

## Informations à conserver

- Fournisseur et URL source
- Nom du produit, modèle/variante et état
- Quantité minimale de commande
- Prix fournisseur et devise
- Disponibilité/stock déclaré
- Frais de livraison, devise, destination et statut de confirmation
- Délai annoncé et autres frais éventuels
- Statut des taxes et droits de douane (confirmés ou inconnus)
- Date de dernière vérification
- Prix de vente ADI en EUR et méthode de calcul
- Statut de vérification, décision humaine, date et identifiant de l'approbateur
- Historique des changements et des décisions

## Écrans prévus

### 1. Connexion privée
Authentification côté serveur, accès réservé aux comptes autorisés et protection des sessions.

### 2. File de validation
Liste privée des offres importées, avec filtres par statut, fournisseur et date.

### 3. Fiche d'examen
Données source, prix produit, livraison séparée, informations manquantes, estimation du coût total et prix ADI proposé.

### 4. Décision humaine
Actions distinctes : « Approuver pour publication », « Refuser » et « Garder en attente ». La décision doit être enregistrée dans un journal d'audit.

## Architecture nécessaire

GitHub Pages sert uniquement le site statique. Il ne peut pas, à lui seul, protéger une file d'offres privées ni sécuriser des identifiants d'administration. La version réelle nécessitera :
- un serveur/API avec contrôle d'accès côté serveur ;
- une base de données privée ;
- une authentification et des rôles d'administration ;
- un journal d'audit ;
- une action de publication séparée, déclenchée uniquement après approbation.

Le catalogue public ne devra recevoir que les offres approuvées et destinées à être publiées.

## État actuel

Préparation des règles et du parcours uniquement. Aucun fournisseur n'est connecté par ce document. Aucun espace privé actif, aucune publication, aucun achat et aucune dépense ne sont déclenchés.
