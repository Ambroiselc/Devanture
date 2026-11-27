# Sites des clients : Pedro, l'agent des sites définitifs (30/10/2026)

Pedro transforme le contenu envoyé par un client (page `/bienvenue/<jeton>`) en vrai site, puis le met en ligne
sur son domaine. Tout se pilote depuis la **fiche du client** (page Clients).

```
Client envoie photos + infos ──► Pedro « Préparer le site » ──► aperçu https://apercu.devanture-artisans.fr/<site>/
                                   (chaque matin, ou bouton)      + e-mail d'aperçu « à valider » sur la page Inès
Client valide par écrit ──► Broise achète le domaine, le branche sur Cloudflare, le note sur la fiche
                        ──► Pedro « Mettre en ligne » ──► https://<domaine>/ (et www.<domaine> renvoie dessus)
```

## Ce que fait Pedro

- Part de la **maquette** du client, dans le **style** qu'il a choisi (sobre si « je vous laisse choisir »), avec son habillage.
- Réécrit les textes avec **ce que le client a écrit** (prestations, zone, horaires, téléphone, message) : Claude Haiku,
  aucun fait inventé. S'il demande de ne pas afficher son adresse, seule la commune reste.
- **Photos** : remises droites, réduites (WebP, 2 tailles), photos d'iPhone (HEIC) converties. Claude Haiku regarde des
  miniatures : prestation montrée, la plus belle en en-tête, et il écarte les photos floues, les documents et les visages
  de clients. Essentiel : 10 photos ; Pro : 30 au plus.
- **Légendes (30/10, demande de Broise)** : le client peut écrire un petit mot sous chaque photo sur sa page d'accueil ;
  Pedro l'affiche tel quel (juste remis au propre). Sans légende du client : une légende courte et naturelle qui nomme le
  travail (« Toiture en ardoise refaite »), jamais de détail du décor (grue, ciel, voiture…).
- **Logo** : bords vides retirés, redessiné en image (un SVG n'est jamais publié tel quel ; un PDF est refusé).
- **Formule Pro** : 4 pages de prestation en plus de l'accueil (5 pages en tout), liées depuis la liste des prestations.
- **Mentions légales** (éditeur = le client avec son SIRET, hébergeur Cloudflare, réalisation Devanture), polices hébergées
  avec le site (rien chez Google Fonts), aucun cookie, fiche « entreprise locale » pour Google.
- **Avis** : bouton « Lire les avis sur Google » vers sa fiche (si Loïc l'avait trouvée). Les avis eux-mêmes ne sont pas
  recopiés : les conditions de Google l'interdisent.
- **Formulaire de devis** : la demande arrive dans la base (`/api/devis`), Inès la transmet aussitôt par e-mail à l'artisan
  (« Répondre » écrit directement à la personne). Les demandes apparaissent sur la fiche du client.

Coût : quelques centimes d'IA par site. Hébergement : gratuit (un seul Worker Cloudflare pour tous les sites).

## Photographes et coachs (27/11)

Même procédure, avec deux choses en plus à demander au client sur sa page d'accueil :

- **Son lien de réservation** (Cal.com, guide : `docs/reservation-en-ligne.md`). Sans lien, le site se fait quand même :
  la partie « Réserver » disparaît et tous les boutons mènent au contact. Une fois le lien noté, « Préparer le site » à nouveau.
- **Un portrait de lui** avec « moi » en légende : il va dans « À propos ». Sans portrait, « À propos » est sans photo.

Pedro garde la mise en page et les couleurs de sa maquette, met toutes ses photos dans la galerie (entières, rien n'est
coupé), n'affiche un tarif que si le client l'a écrit, et l'agenda ne se charge que quand le visiteur clique sur
« Voir les créneaux disponibles ». Pour voir à quoi ça ressemble : `/demo/exemple-photographe?site=1` ou
`/demo/exemple-coach?site=1` (ajouter `&resa=0` pour la version sans réservation).

## À faire une seule fois (≈ 10 minutes)

### 1. Appliquer la migration
GitHub > Actions > **« Appliquer une migration »** > Run workflow > `20261030000000_sites_clients.sql`.

### 2. Secret GitHub `SUPABASE_SECRET_KEY`
1. Supabase > ton projet > **Project Settings** > **API Keys** > onglet **API Keys** > **Secret keys** > copier la clé
   `sb_secret_…` (ou en créer une : « + Add new secret key », nom `github-devi`).
2. GitHub > dépôt Devanture > **Settings** > **Secrets and variables** > **Actions** > **New repository secret** :
   nom `SUPABASE_SECRET_KEY`, valeur la clé.

### 3. Droits de la clé Cloudflare
Pedro branche les domaines des clients : la clé `CLOUDFLARE_API_TOKEN` (celle de la mise en ligne) doit pouvoir modifier le DNS.
Cloudflare > icône de profil > **Profile** > **API Tokens** > ta clé (modèle « Edit Cloudflare Workers ») > **Edit** :
- vérifier **Zone Resources : All zones** (sinon les domaines des futurs clients seraient refusés) ;
- **+ Add more** > **Zone** > **DNS** > **Edit** ;
- **Continue to summary** > **Update token**. La valeur de la clé ne change pas : rien à refaire sur GitHub.

### 4. Publier le serveur des sites
GitHub > Actions > **« Sites des clients — serveur »** > Run workflow (1 minute). Ensuite, il se republie tout seul quand
son code change. Au premier passage, Pedro relie aussi l'adresse `apercu.devanture-artisans.fr`.

## Pour chaque client

1. Son contenu arrive (fiche « Contenu reçu ») : Pedro prépare le site le lendemain matin, ou tout de suite avec
   **« Préparer le site »** (5 minutes environ). La fiche passe à « Site en préparation » et affiche l'aperçu.
2. **Relis l'aperçu** sur ton téléphone. Les remarques de Pedro (photos écartées, peu de photos…) sont dans le journal de la tâche
   (page Tâches). À corriger : complète sa page d'accueil puis **« Refaire le site »**, ou dis-moi ce qu'il faut changer.
3. Valide l'**e-mail d'aperçu** sur la page Inès, puis passe la fiche à « Aperçu envoyé ».
4. Ses corrections arrivent par e-mail : on corrige (« Refaire le site » ou moi), jusqu'à son accord **écrit**.
5. Fiche « Validé » : achète le domaine à son nom (docs/apres-signature.md, étape 6), branche-le sur Cloudflare,
   **note le domaine sur la fiche** et enregistre.
6. Quand Cloudflare dit le domaine **actif** (quelques minutes à quelques heures) : **« Mettre en ligne sur … »**.
   Pedro refait les pages avec l'adresse définitive, relie le domaine et `www`, et passe la fiche à « En ligne ».
   Si le domaine n'est pas encore actif, Pedro le dit et ne touche à rien : réessaie plus tard.

## Où sont les choses

- `agents/site.ts` (Pedro), `agents/lib/site-final.ts` (pages), `agents/lib/site-reel.ts` (vrai site dans les modèles),
  `agents/lib/redaction-site.ts` (textes et légendes), `agents/lib/photos.ts`, `agents/lib/polices.ts`, `agents/lib/cloudflare.ts`.
- Workflow `.github/workflows/agent-site.yml` (chaque jour ouvré à 9 h 47, et les boutons de la fiche).
- `workers/sites/` : le Worker « devanture-sites » ; fichiers dans le stockage Supabase, dossier public `sites/<site>/` ;
  table domaine → site : `sites/_hotes.json`.
- Formulaire : `app/api/devis/route.ts` → fonction SQL `devis_deposer` → table `demandes_devis` → `agents/devis.ts`
  (étape du workflow d'Inès).

## Limites connues

- Stockage Supabase gratuit : 1 Go, soit ≈ 150 à 250 sites. Prévoir le plan payant (25 $/mois) ou Cloudflare R2 avant.
- Les modifications mensuelles des clients passent par « Refaire le site » (après avoir mis à jour ses infos) ou par moi.
- Supprimer un site résilié : retirer le domaine dans Cloudflare (Workers > devanture-sites > Domains) et me demander
  de nettoyer son dossier.
