# Réservation en ligne des indépendants (Cal.com) — guide de l'appel de lancement

Version du 27/11/2026 (décision de Broise : la réservation en ligne fait partie des deux formules pour les photographes et
les coachs, sans supplément). Durée : 15 à 20 minutes, au téléphone, avec le client devant son ordinateur.

## Principe

- Le client a **son propre compte Cal.com**, gratuit, à son adresse e-mail. Ce sont ses clients et son agenda : s'il quitte
  Devanture, il garde tout. Ne jamais créer le compte à ta place ni avec ton adresse.
- Cal.com lit son agenda habituel (Google, Outlook, Apple) et ne propose que les créneaux libres : un rendez-vous perso bloque
  le créneau tout seul.
- Le client réserve depuis le site (page intégrée), reçoit une confirmation, et le rendez-vous s'inscrit dans l'agenda de
  l'indépendant. Devanture n'intervient plus ensuite.
- Offre gratuite : réservations et types de séance illimités, intégration sur un site, paiement possible via Stripe.
  Limite : le logo Cal.com reste visible (le retirer est payant), c'est discret.

## Pendant l'appel, pas à pas

1. **Créer le compte** : le client va sur cal.com, « Get started », s'inscrit avec son e-mail pro (ou « Continuer avec Google »).
   Il choisit son identifiant (ex. `cal.com/remi-photo`) : court, sans accent.
2. **Relier son agenda** : il connecte l'agenda qu'il utilise vraiment (Google Agenda le plus souvent). Vérifier que
   « Vérifier les conflits » est bien coché sur cet agenda.
3. **Ses disponibilités** (« Availability ») : jours et heures où il accepte des séances. Fuseau Europe/Paris.
4. **Ses types de séance** (« Event types »), un par prestation du site. Pour chacun :
   - nom clair (« Séance famille », « Coaching individuel »), durée, lieu (« à définir ensemble », adresse, ou à domicile) ;
   - **délai minimum avant réservation** (ex. 48 h) et **temps entre deux séances** (ex. 30 min pour se déplacer) ;
   - nombre maximum de réservations par jour si besoin.
   - Pas de prix affiché tant qu'il ne le souhaite pas ; l'acompte par Stripe peut venir plus tard.
5. **Langue** : réglages du compte, mettre l'interface en français.
6. **Tester** : réserver un faux rendez-vous depuis son lien, vérifier qu'il arrive dans son agenda et par e-mail, puis l'annuler.
7. **Le lien** : il colle `https://cal.com/son-identifiant` dans le champ « Votre page de réservation » de sa page d'accueil
   Devanture (ou te l'envoie par e-mail). Le noter aussi dans les notes de sa fiche client.

## Cas particuliers

- **Mariages** : on ne réserve pas une journée entière en deux clics. Sur le site, le mariage passe par un formulaire
  « Demander votre date » ; la réservation en ligne sert aux séances courtes (portrait, famille, couple) et aux coachs.
- **Il a déjà un outil** (Calendly, Google Agenda, Planity…) : garder son outil, on intègre son lien à la place.
- **Il ne veut pas de réservation en ligne** : le site garde le bouton d'appel et le formulaire de contact. Rien à facturer en moins.

## Côté site (Pedro)

Le lien de réservation arrive dans le contenu du client (`clients.contenu.reservation`). À faire au premier client
indépendant : modèle de site définitif « indépendant » pour Pedro, avec la page Cal.com intégrée (bouton « Réserver » qui
ouvre la page, ou intégration dans la section réservation), et mention de Cal.com dans les mentions légales.
