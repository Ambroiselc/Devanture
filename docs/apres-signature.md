# Après la signature : du paiement au site en ligne

Version du 29/10/2026, réservation en ligne des indépendants ajoutée le 27/11/2026. Suivi de chaque client sur la page **Clients** du tableau de bord
(app.devanture-artisans.fr/clients) : chaque fiche affiche l'étape en cours et ce qu'il faut faire.

Qui fait quoi : **Broise** (toi), **Claude** (moi, en conversation, puis l'agent de site définitif), **le client**.

## Règle d'or : le domaine s'achète en dernier

Le nom de domaine n'est acheté **qu'après la validation écrite du site par le client**. Jusque-là, il voit son site
sur un lien d'aperçu. Si un client abandonne en route, aucun domaine n'a été payé pour rien.

## Les étapes

| # | Étape (page Clients) | Qui | Ce qu'il faut faire |
|---|---|---|---|
| 1 | **Payé** | Broise | L'artisan a payé par le lien Stripe envoyé par Inès. Créer sa fiche sur la page Clients (formule, paiement, offre de lancement). Envoyer l'e-mail de bienvenue (modèle ci-dessous). |
| 1 bis | **Payé** (photographe, coach) | Broise + le client | **Appel de lancement** (15-20 min, en soirée) : créer ensemble son compte de réservation en ligne Cal.com, gratuit, à SON nom (guide pas à pas : [reservation-en-ligne.md](reservation-en-ligne.md)). Il colle ensuite le lien de sa page de réservation sur sa page d'accueil. |
| 2 | **Contenu demandé** | Le client | Il envoie logo, 5 à 15 photos de chantiers, horaires, prestations, zone d'intervention, numéro, nom de domaine souhaité, style préféré (sobre ou chaleureux). Les CGV lui laissent 15 jours. Relance au bout d'une semaine. |
| 3 | **Contenu reçu** | Claude | Broise me transmet le contenu (ou il arrive par la boîte mail). Je pars de sa maquette et de ses vraies photos. |
| 4 | **Site en préparation** | Claude | Je construis le site. Broise le relit (≈ 10 min) avant l'envoi au client. |
| 5 | **Aperçu envoyé** | Le client | Il reçoit le lien d'aperçu. Inès trie ses corrections ; on corrige jusqu'à son accord **écrit** (un e-mail suffit, article 8 des CGV). |
| 6 | **Validé par le client** | Broise | Acheter le domaine chez OVH **au nom du client** (voir plus bas), le brancher sur Cloudflare, noter le domaine sur la fiche. |
| 7 | **Domaine acheté** | Claude | Je publie le site et le relie au domaine. Le client clique sur l'e-mail de vérification de l'AFNIC. |
| 8 | **En ligne** | Broise | Valider la réponse d'Inès avec le lien d'abonnement correspondant à la formule. Avec 0 € de départ, l'abonnement tourne déjà : rien à envoyer. La date de mise en ligne se remplit seule. |
| 9 | **Abonné** | Broise | Fini. Modifications à la demande (1 ou 2 par mois selon la formule). Demander un avis Google au bout de 2 semaines, sans rien offrir en échange (interdit par Google). |

Sorties : **Abandonné** (le client renonce avant la mise en ligne) et **Résilié** (fin d'abonnement : transfert gratuit
du domaine sur demande, une fois les sommes dues réglées, article 9 des CGV).

## Quel lien de paiement, et quand

- **Formule avec création** : lien « création » à la signature (étape 1), lien « abonnement » à la mise en ligne (étape 8).
- **Formule 0 € de départ** : lien « 0 € de départ » **à la commande** (étape 1) ; le premier mois compte dans les 12, qui
  commencent ce jour-là (CGV du 29/10). Rien d'autre à envoyer à la mise en ligne.
- Les liens sont sur la page d'Inès (carte « Liens de paiement »). Toute réponse qui en contient un attend la validation de Broise.

## Acheter le domaine du client (étape 6, ≈ 10 min, ≈ 8-10 €/an pour un .fr)

1. Sur ovh.com, chercher le nom (ex. `hebert-couverture.fr`), **Ajouter au panier**, refuser toutes les options.
2. **Propriétaire du domaine** → « Créer un nouveau contact » au nom du **client** : type entreprise ou entrepreneur
   individuel, son nom d'entreprise, son SIRET, son adresse, **son e-mail** (l'AFNIC lui écrit : le prévenir).
3. Laisser le compte OVH de Broise en contact administratif et technique.
4. Payer (le domaine est compris dans la formule, renouvellement compris).
5. Cloudflare : **+ Add → Connect a domain**, plan **Free** ; recopier les 2 serveurs `…ns.cloudflare.com` chez OVH
   (Web Cloud → Noms de domaine → le domaine → Serveurs DNS → Modifier).
6. Noter le domaine sur la fiche et passer à « Domaine acheté ».

## Modèle d'e-mail de bienvenue (étape 1)

> Objet : Bienvenue, on lance votre site
>
> Bonjour [prénom],
>
> Merci pour votre confiance, votre paiement est bien reçu. Pour préparer votre site, j'ai besoin de quelques éléments :
> votre logo si vous en avez un, 5 à 15 photos de vos chantiers, vos horaires, vos prestations et les communes où vous
> intervenez. Dites-moi aussi le nom d'adresse que vous aimeriez (par exemple votre-entreprise.fr) et le style que vous
> préférez entre les deux maquettes.
>
> Vous pouvez tout m'envoyer en réponse à cet e-mail, même en plusieurs fois. Dès que j'ai tout, je vous envoie un aperçu.
>
> Ambroise, Devanture

## Décisions du 29/10

- **Formules** (arrangement A) : Essentiel = une page complète avec bouton d'appel, formulaire de demande de devis, zone
  d'intervention, galerie de 10 photos, avis Google affichés, fiche Google créée, 1 modification par mois ; Pro = tout
  l'Essentiel, jusqu'à 5 pages, galerie sans limite, fiche Google suivie (1 publication par mois, réponses aux avis),
  QR code pour demander des avis, bilan mensuel, 2 modifications par mois. Prix inchangés.
- **0 € de départ** : premier mois payé à la commande et compté dans les 12 (protège contre les abandons).
- **Domaine** acheté seulement après la validation écrite du site.

## Automatique depuis le 29/10

- **Paiement relevé tout seul** (`agents/paiements.ts`, avec Inès toutes les 2 heures de 7 h à 19 h environ) :
  fiche client créée, prospect passé « client », e-mail de bienvenue **à valider** sur la page Inès. Si l'adresse
  du paiement ne correspond à aucun prospect : « Paiements à rattacher » sur la page Clients.
  Abonnement sans engagement payé → fiche « Abonné ».
- **Page d'accueil du client** (`/bienvenue/<jeton>`, lien dans l'e-mail de bienvenue et sur sa fiche) : il y dépose
  logo et photos (réduites dans son téléphone), prestations, zone, horaires, numéro, adresse souhaitée, style. La fiche
  passe seule à « Contenu reçu » et affiche tout ce qu'il a envoyé.
- Prérequis côté Stripe : la clé restreinte doit avoir la **lecture sur « Checkout Sessions »**.

## Automatique depuis le 30/10 : Pedro

Pedro, l'agent des sites définitifs, fait les étapes 3, 4 et 7 : site préparé depuis la maquette et le contenu du client
(aperçu sur apercu.devanture-artisans.fr), puis mise en ligne en un clic sur le domaine. Procédure et réglages :
**docs/sites-clients.md**. Le formulaire de devis des sites marche pour de vrai : les demandes partent par e-mail à l'artisan.
