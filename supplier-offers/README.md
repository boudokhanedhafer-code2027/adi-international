# ADI INTERNATIONAL — Import des offres fournisseurs

## Objectif
Ce dossier prépare l'import multi-fournisseurs par CSV ou future API. Ce n'est pas encore une connexion active à des fournisseurs.

## Processus obligatoire
1. Importer les lignes dans une zone privée de préparation, jamais directement dans le catalogue public.
2. Vérifier sur la page fournisseur le produit, modèle/variante, état, MOQ, prix/devise, disponibilité, frais et délai de livraison.
3. Préciser la destination. Si les frais ou la livraison ne sont pas confirmés, marquer « À confirmer ».
4. Séparer le prix produit, la livraison, les autres frais et les taxes/droits non confirmés.
5. Calculer le prix ADI en EUR uniquement si les coûts et la marge sont défendables.
6. Soumettre chaque fiche à validation humaine.
7. Publication uniquement après approbation humaine explicite.

## Statuts
- imported : importée, non vérifiée.
- verification_pending : vérification nécessaire.
- verified_pending_approval : vérifiée, en attente de validation ADI.
- rejected : refusée, jamais publiée.
- approved_for_publication : approbation humaine enregistrée.
- published : publication manuelle confirmée.

## Verrous obligatoires
- Toute offre importée reste privée par défaut.
- Aucune publication automatique.
- Aucun achat fournisseur, paiement fournisseur ou dépense automatique.
- Un achat ne peut être envisagé qu'après paiement client confirmé ET approbation humaine distincte.
- L'approbation de publication ne vaut pas approbation d'achat.
- Ne jamais inventer prix, stock, frais ou délais.
- Conserver l'URL source et la date de vérification.
- Ne jamais stocker de clés API ou mots de passe dans ce dépôt.

## Limitation technique actuelle
GitHub Pages est un site statique : il ne possède pas encore de base de données, d'espace privé sécurisé, de connexion API fournisseur ni de tableau d'administration. Ce guide et le modèle CSV préparent le format; une future intégration réelle nécessitera un backend sécurisé et une authentification pour les validations humaines.
