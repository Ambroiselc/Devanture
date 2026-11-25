# Registre des traitements de données personnelles — Devanture

Document exigé par l'article 30 du RGPD (la CNIL le recommande même aux micro-entreprises).
À relire **une fois par an** et à chaque nouvel outil. Dernière mise à jour : 27 octobre 2026 (boîte mail intégrée : réception des réponses, tri et réponses par l'agente Inès).

**Responsable du traitement** : [Prénom Nom], micro-entrepreneur, Devanture — [adresse] — SIRET en cours
d'attribution — contact@devanture.fr. Pas de DPO (non obligatoire à cette taille).

> Ce registre n'est pas un avis juridique. Il suit les recommandations publiques de la CNIL ;
> en cas de doute, la CCI Grand Lille ou un avocat peut le relire.

---

## Traitement 1 — Prospection commerciale par e-mail (B2B)

| | |
|---|---|
| **Finalité** | Repérer des commerces de la métropole lilloise sans site (ou avec un site daté), leur préparer une maquette et leur proposer, par e-mail, la création d'un site. |
| **Base légale** | Intérêt légitime (art. 6.1.f RGPD). En B2B, la CNIL n'exige pas de consentement préalable si le message est en rapport avec la profession de la personne, qu'elle est informée et peut s'opposer simplement. |
| **Personnes concernées** | Commerçants, artisans et petites entreprises (gérants, contacts professionnels). |
| **Données** | Nom du commerce, catégorie, adresse, téléphone et e-mail **professionnels**, site actuel, informations publiques (horaires, photos, avis), score d'intérêt et sa justification, qualité estimée du site, page où l'e-mail a été trouvé, SIRET et code d'activité, identifiant Google du lieu, historique des échanges, notes. Un prospect écarté ne conserve pas d'e-mail. **Aucune** donnée sensible, aucune donnée de particulier. |
| **Source** | Sources publiques : recherche des artisans visibles sur Google (API Google Places), puis annuaire officiel des entreprises (recherche-entreprises.api.gouv.fr, données ouvertes ; les entreprises « non diffusibles » sont exclues), fiche Google (via l'API Google Places ; seul l'identifiant du lieu est conservé), site web du commerce (3 pages au plus par visite), et depuis le 26/10/2026 la liste officielle des entreprises RGE publiée par l'ADEME (data.ademe.fr, Licence Ouverte 2.0 : nom, adresse, e-mail et site déclarés publiquement par l'entreprise ; l'e-mail indique alors « publiée dans la liste officielle des entreprises RGE »). |
| **Destinataires** | Le responsable uniquement. Sous-traitants techniques : voir tableau plus bas. Aucune vente ni location de fichier. |
| **Durée de conservation** | **3 ans** à compter de la collecte ou du dernier contact venant du prospect (réponse, clic, demande). Ensuite suppression. Exception : la liste d'opposition (voir ci-dessous). |
| **Information des personnes** | Chaque e-mail indique : qui écrit (Devanture, nom, adresse), pourquoi, d'où vient l'adresse, une réponse « STOP » pour ne plus être contacté, et un lien vers la page devanture-artisans.fr/donnees-personnelles (en place depuis le 27/10/2026). (Art. 14 RGPD : au plus tard lors du premier contact.) |
| **Droit d'opposition** | Toute demande (« stop », « non merci », « ne plus m'écrire ») est ajoutée le jour même à la **liste d'opposition** du tableau de bord. La base de données bloque ensuite automatiquement tout e-mail vers cette adresse. |

### Appels aux artisans qui ont ouvert leur maquette — depuis le 24/11/2026
- Page « À appeler » du tableau de bord (réservée à Broise) : les artisans déjà contactés par e-mail qui ont ouvert
  leur maquette, avec le **téléphone professionnel public** déjà collecté (liste RGE de l'ADEME). Appel B2B, en rapport
  avec l'activité de l'entreprise (Bloctel ne concerne que les particuliers).
- Le résultat de l'appel (intéressé, à rappeler, messagerie, pas intéressé) et une note courte sont ajoutés aux notes du
  prospect (même durée de conservation : 3 ans). « Ne m'appelez plus » → liste d'opposition, plus aucun contact.

### Boîte mail (réponses des artisans) — depuis le 27/10/2026
- Les e-mails reçus sur …@devanture-artisans.fr passent par Cloudflare (Email Routing + Worker « boite-mail »),
  sont enregistrés dans Supabase (table `mailbox_messages` : expéditeur, objet, texte, noms des pièces jointes)
  et copiés dans la boîte Gmail du responsable. Les pièces jointes elles-mêmes ne sont pas stockées dans la base.
- L'agente Inès (Claude Haiku, via l'API Anthropic) lit chaque message pour le trier et proposer une réponse.
  Elle ne répond seule qu'aux messages simples ; prix, contrat, paiement, appel, plainte, pièce jointe ou expéditeur
  inconnu attendent la validation du responsable.
- « STOP », « ne plus me contacter » : détectés par le code (sans IA) et ajoutés le jour même à la liste d'opposition ;
  « pas intéressé » : ajouté aussi (raison « refus »), après une courte réponse de prise en compte.
- Durée : messages des personnes opposées effacés 7 jours après l'opposition ; réponses automatiques et spam après
  30 jours ; le reste 3 ans (5 ans pour les clients), par le nettoyage quotidien (`public.nettoyer_boite()`).

### Relance et visites des maquettes — depuis le 30/10/2026

Une seule relance par artisan, 6 jours après le premier e-mail s'il n'a ni répondu ni demandé STOP (même lien de
désinscription). Les maquettes comptent leurs visites (nombre, première et dernière date) quand la page reste ouverte
au moins 1,5 seconde (4 secondes jusqu'au 5/11/2026). Depuis le 5/11/2026, chaque ouverture garde aussi sa date, sa durée
(temps passé onglet visible) et le type d'appareil (téléphone ou ordinateur), sous un identifiant tiré au hasard à chaque
ouverture (table `maquette_visites`, effacée avec la maquette). Aucun cookie, aucune adresse IP, rien n'est gardé dans le
navigateur du visiteur.

Depuis le 13/11/2026 : les visites venues d'un réseau d'hébergeur (robots de Microsoft 365 qui vérifient les liens des
e-mails…) ne sont plus comptées ; l'opérateur réseau est lu par Cloudflare au moment de la visite, jamais l'adresse IP.

Depuis le 19/11/2026 : chaque ouverture de maquette garde aussi, comme les visites du site vitrine, la famille de système et
de navigateur (« Windows », « Chrome »), l'opérateur réseau, le pays et la ville approximative déduits par Cloudflare (souvent
la ville du fournisseur d'accès). Toujours ni adresse IP ni cookie ; effacé avec la maquette. Les visites venues de
l'étranger (hors France et pays voisins) sont traitées comme des robots et ne sont pas comptées.
Les visites de robots retirées après coup sont gardées à part (`maquette_visites_robots`) pour pouvoir les remettre.

### « Ce site m'intéresse » — depuis le 13/11/2026
- But : permettre à l'artisan de se manifester en un clic depuis sa maquette, pour être recontacté au sujet de son site.
- Données : date, style regardé, type d'appareil, et ce qu'il saisit lui-même, facultativement : un numéro de téléphone
  (professionnel en pratique) et un court message (table `maquette_interets`). Rien d'autre.
- Base légale : sa demande (mesures précontractuelles, art. 6.1.b) ; le bandeau précise que le numéro sert seulement à le
  recontacter au sujet du site, sans engagement.
- Destinataire : Broise, prévenu par un e-mail d'alerte (Resend) ; durée : comme la fiche du prospect (3 ans au plus),
  effacé avec la maquette.

### Liste d'opposition
- But : garantir qu'une personne qui a refusé n'est **jamais** recontactée, même si son adresse est retrouvée plus tard.
- Données : e-mail ou domaine, nom du commerce, raison, date.
- Durée : **au moins 3 ans** à compter de l'opposition (minimum recommandé par la CNIL pour ce type de liste). En pratique on la garde tant que Devanture prospecte : la supprimer ferait courir le risque de recontacter la personne.

## Traitement 2 — Gestion des clients (contrats, facturation, suivi)

| | |
|---|---|
| **Finalité** | Créer et entretenir le site des clients, facturer, répondre aux demandes de modification. |
| **Base légale** | Exécution du contrat (art. 6.1.b) ; obligations comptables (art. 6.1.c). |
| **Données** | Identité et coordonnées du client, SIRET, contenus fournis pour le site, factures, paiements (via Stripe : Devanture ne voit jamais le numéro de carte ou l'IBAN complet), échanges e-mail. |
| **Durée** | Pendant le contrat, puis 5 ans (prescription commerciale). Factures et pièces comptables : **10 ans** (art. L123-22 du Code de commerce). |

Depuis le 29/10/2026 : les paiements Stripe sont relevés toutes les 2 heures (table `paiements_stripe` : e-mail, nom
d'entreprise, montant, jamais de données de carte ou de compte). Chaque client reçoit un lien d'accueil personnel
(`/bienvenue/<jeton>`, 64 caractères aléatoires) pour envoyer ses infos, son logo et ses photos : fichiers rangés dans
le stockage Supabase (dossier privé `clients/`, Irlande), lisibles seulement par l'administrateur ; le dépôt se ferme
dès que le site est validé. À effacer avec la fiche client au terme de la durée ci-dessus.

Depuis le 30/10/2026 (Pedro, l'agent des sites) : les photos et le logo du client sont réduits et publiés avec son site
(stockage Supabase, dossier **public** `sites/`, c'est une page web), après légende par Claude Haiku (petites miniatures).
Pedro écarte les photos de documents et les visages de clients en gros plan ; Broise relit l'aperçu avant tout envoi.

## Traitement 2 bis — Demandes de devis reçues par les sites des clients (Devanture sous-traitant)

| | |
|---|---|
| **Responsable** | Chaque client (l'artisan), pour son site. Devanture agit comme **sous-traitant** (hébergement et transmission). |
| **Finalité** | Transmettre à l'artisan les demandes de devis envoyées par le formulaire de son site. |
| **Base légale** | Mesures précontractuelles à la demande de la personne (art. 6.1.b), côté artisan. |
| **Données** | Nom, téléphone, e-mail (facultatif), commune, message (table `demandes_devis`, Irlande). Aucun cookie sur les sites. |
| **Durée** | Effacées automatiquement après **3 ans** (agents/devis.ts). |
| **Transmission** | E-mail à l'artisan par Resend (`devis@` du domaine d'envoi), dès réception. Garde-fous anti-abus : 30 demandes par site et par jour, 3 par numéro et par heure, champ piège. |

Les mentions légales de chaque site client (page `mentions-legales/`, faite par Pedro) indiquent l'éditeur (le client),
l'hébergeur (Cloudflare), la réalisation (Devanture), l'usage du formulaire et l'absence de cookies. Polices hébergées
avec le site (aucune requête vers Google Fonts). Le contrat client devra comporter une clause de sous-traitance (art. 28) :
à ajouter aux CGV lors de la relecture par un juriste.

## Traitement 3 — Demandes reçues via le site devanture.fr

| | |
|---|---|
| **Finalité** | Répondre aux commerçants qui écrivent (demande de maquette, question). |
| **Base légale** | Mesures précontractuelles à la demande de la personne (art. 6.1.b). |
| **Données** | Ce que la personne écrit dans son e-mail (nom, commerce, adresse, message). Depuis le 25/11/2026, formulaire « Recevoir ma maquette gratuite » (nom du commerce, métier, ville, e-mail ; téléphone et message facultatifs) : `POST /api/demande-maquette` → `public.demande_maquette` → rangé dans `mailbox_messages` comme un e-mail reçu (mêmes durée et traitement que la boîte mail ; champ piège anti-robots, au plus 20 demandes par heure). Le site n'a **pas de cookies**. Depuis le 2/11/2026, il compte ses visites (table `site_visites` : jour, page d'arrivée, provenance, nombre) sans aucune donnée personnelle : ni IP, ni cookie, ni identifiant, rien stocké sur l'appareil (pas de consentement requis). Depuis le 13/11/2026, détail de chaque visite (table `site_visites_detail` : heure, durée, pages vues, provenance, type d'appareil, famille du système et du navigateur sans version, opérateur réseau et pays lus par Cloudflare pour écarter les robots ; numéro de visite tiré au hasard à chaque chargement, jamais gardé dans le navigateur ; pas d'IP) : même base légale, aucune donnée permettant d'identifier le visiteur. |
| **Durée** | 3 ans après le dernier échange, sauf si la personne devient cliente (→ traitement 2). |

---

## Sous-traitants et transferts hors UE

| Outil | Rôle | Données concernées | Localisation / garanties |
|---|---|---|---|
| Supabase | Base de données du tableau de bord | Toutes (traitements 1 et 2) | Région **eu-west-1 (Irlande)**, vérifiée le 29/10/2026. DPA disponible dans le tableau de bord Supabase. |
| GitHub (Microsoft) | Code + sauvegardes hebdomadaires (90 jours) | Copie de la base | États-Unis — Data Privacy Framework + clauses contractuelles types. Dépôt **privé** obligatoire. |
| Anthropic (API Claude) | Note des prospects (Claude Haiku), rédaction des maquettes et des brouillons d'e-mails, relecture de ces brouillons par Coco (30/10 : même données, rien de nouveau), tri et réponses de la boîte mail | Données publiques du commerce ; texte des e-mails reçus | États-Unis — DPA et clauses contractuelles types ; les données envoyées via l'API ne servent pas à entraîner les modèles (selon les conditions commerciales d'Anthropic). Ne jamais y envoyer de données de paiement. |
| Google (API Places) | Retrouver la fiche Google des entreprises (avis, site) | Nom et adresse de l'entreprise envoyés dans la recherche | États-Unis — Data Privacy Framework. |
| Google (Gmail) | Copie de chaque e-mail reçu dans la boîte du responsable | E-mails reçus et pièces jointes | États-Unis — Data Privacy Framework. |
| Liste des entreprises RGE (ADEME) | Liste d'artisans avec leurs coordonnées professionnelles | Aucune donnée envoyée hors critères de recherche (codes postaux) | France — service public, données ouvertes. |
| Annuaire des entreprises (État, DINUM) | Liste des entreprises par activité et commune | Aucune donnée envoyée hors critères de recherche | France — service public. |
| Resend | Envoi des réponses d'Inès (plus aucune prospection depuis le 28/10), région Irlande (eu-west-1) | Adresse, contenu des e-mails | États-Unis — DPA à accepter à l'ouverture du compte. |
| Google Workspace | Boîtes d'envoi de la prospection (28/10, domaines réservés) : envoi des premiers e-mails, réception des rebonds et des réponses (recopiées dans la boîte d'Inès puis marquées lues) | Adresse, contenu des e-mails | États-Unis — avenant de traitement des données (Cloud Data Processing Addendum) à accepter dans la console d'administration. |
| Stripe | Paiements des clients (création, abonnements) et factures (28/10) | Nom, entreprise, adresse de facturation, e-mail, moyen de paiement (carte ou IBAN, gardés par Stripe) | Irlande (Stripe Payments Europe) ; transferts vers les États-Unis encadrés par le DPA de Stripe. Factures gardées 10 ans (obligation comptable). |
| Cloudflare | Hébergement du site vitrine et des sites clients (puis du tableau de bord) ; DNS ; réception des e-mails (Email Routing + Worker « boite-mail ») | Journaux techniques (adresses IP des visiteurs) ; e-mails reçus en transit | États-Unis — Data Privacy Framework + clauses contractuelles types ; DPA intégré aux conditions Cloudflare. |

Pour chaque outil : accepter le **DPA** (accord de sous-traitance) proposé dans ses réglages, et le noter ici avec la date.

## Mesures de sécurité

- Accès au tableau de bord : un seul compte administrateur, mot de passe d'au moins 12 caractères ; activer la double authentification sur Supabase, GitHub, Google et l'hébergeur.
- Base protégée par la RLS : seul un administrateur connecté lit ou modifie les données ; le rôle anonyme n'a aucun droit.
- Aucune clé secrète dans le code (fichier `.env.local` ignoré par Git, secrets GitHub chiffrés).
- Sauvegarde automatique chaque semaine, effacée après 90 jours.
- Budget IA plafonné (alerte dans le tableau de bord + limite dans la console Anthropic).

## Droits des personnes

Accès, rectification, effacement, opposition, limitation : par e-mail à contact@devanture.fr.
Réponse sous **1 mois**. Procédure : retrouver la personne dans le tableau de bord, répondre, et pour un
effacement supprimer le prospect **mais garder l'adresse dans la liste d'opposition** (sinon elle pourrait
être recontactée). En cas de désaccord, la personne peut saisir la CNIL (cnil.fr).

## Violation de données

En cas de fuite (ex. clé secrète publiée, compte piraté) : changer immédiatement les clés et mots de passe,
noter l'incident ici (date, données touchées, mesures), et le **notifier à la CNIL sous 72 h** si la fuite
présente un risque pour les personnes (notifications.cnil.fr).

| Date | Incident | Données touchées | Mesures | Notifié CNIL ? |
|---|---|---|---|---|
| — | — | — | — | — |

## Sources
- CNIL, [La prospection commerciale par courrier électronique](https://www.cnil.fr/fr/la-prospection-commerciale-par-courrier-electronique)
- CNIL, [Le registre des activités de traitement](https://www.cnil.fr/fr/RGPD-le-registre-des-activites-de-traitement)
- RGPD, articles 6, 14, 30 et 33
