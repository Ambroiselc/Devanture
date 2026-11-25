# Devanture — règles pour Claude Code

@AGENTS.md

- Application Next.js 16 (App Router) + TypeScript + Tailwind 4 + Supabase.
- Le propriétaire débute en développement : expliquer chaque étape simplement, en français.
- Aucun secret dans le code ni dans Git. Les clés vont dans `.env.local` (ignoré par Git) ; documenter toute nouvelle variable dans `.env.example`.
- La clé secrète Supabase ne doit jamais être préfixée `NEXT_PUBLIC_` ni importée dans un composant client.
- Toute nouvelle table : RLS activée + politiques basées sur `public.is_admin()`, dans un nouveau fichier de `supabase/migrations/`.
- Les données fictives ont `is_demo = true` et vivent dans `lib/demo-data.ts` (+ `supabase/seed.sql`).
- Agents : scripts Node dans `agents/` (TypeScript lu directement par Node 22), lancés par GitHub Actions.
  Phase 2 : Loïc, l'agent de prospection (`docs/agent-prospection.md`), piloté depuis la page `/loic`
  (réglages dans `agent_settings`, lancement via l'API GitHub). Toujours aucun envoi d'e-mail.
  Tester avec `DEVANTURE_SIMULATION=1` sur une base locale, jamais sur la vraie base.
  Phase 3 : Sid, l'agent des maquettes (`agents/demos.ts`, workflow `agent-demos.yml`, piloté depuis la page `/sid`)
  rédige avec Claude Haiku les textes du modèle « artisan-pro » (`agents/lib/demo-artisan-pro.ts`) ;
  aperçu sur `/demo/<id>` et `/demo/exemple`. Règle : aucune info inventée (pas de prix, d'avis,
  d'ancienneté, de certification) ; ce qu'on ne sait pas s'affiche « à compléter » en pointillés.
  Phase 4 : Valérie, l'agente des e-mails (`agents/emails.ts`, workflow `agent-emails.yml`, page `/valerie`)
  rédige le premier e-mail (versions A/B, `agents/lib/variantes-email.ts`) ; signature et mentions RGPD
  ajoutées par le code (`assemblerEmail`). Le lien de la maquette est le marqueur `{{lien_demo}}`, remplacé à l'envoi.
  Broise valide chaque e-mail sur `/valerie` ; aucun envoi tant que Resend n'est pas branché.
  Captures (26/10) : Sid photographie chaque maquette en vue téléphone (`agents/lib/capture.ts`, Playwright),
  stockée dans `website_captures` (bytea) et servie par `/demo/<id>/capture`. Second test : `emails.with_image`,
  une moitié de chaque version A/B avec l'image intégrée dans l'e-mail (à brancher avec l'envoi).
  Chaîne automatique (26/10) : le workflow de Loïc lance ensuite Sid (`--tout` depuis le 28/10 : tous les qualifiés sans démo, arrêt après 25 min) puis Valérie (`--tout` aussi, arrêt après 15 min) :
  tout ce que Loïc qualifie devient un e-mail à valider dans le même passage ; seul l'envoi a un rythme imposé.
  Méthode « RGE d'abord » (26/10, `agents/lib/rge.ts`, option `--rge`) : liste officielle RGE de l'ADEME (e-mail inclus),
  parcourue commune par commune sur les 45 communes de la métropole, puis (27/10) département par département quand elle est
  épuisée (`DEPARTEMENTS_SUIVANTS` dans prospection.ts : 59, 62, 80, 02, 60…) ; Sid prend alors les communes voisines
  (`communesVoisines`, geo.ts) pour la zone d'intervention. Vague automatique (27/10) : RGE d'abord,
  Google seulement pour compléter les fiches que la liste RGE n'a pas fournies.
  Métier des artisans RGE (10/11, `agents/lib/metier-artisan.ts`) : le NOM de l'entreprise s'il désigne un seul métier (début de mot),
  puis le code NAF (annuaire, `nafParSiret`, gardé dans `prospects.naf_code`) seulement s'il est précis et contredit les domaines RGE (`COMPATIBLES`, `GENERALISTES`), sinon
  ensuite les domaines RGE (`metierRge`, qui présentait des menuisiers « fenêtres de toit » comme couvreurs). Tests :
  `node agents/test-metier.ts`. Rattrapage des artisans pas encore contactés : workflow `corriger-metiers.yml`
  (`agents/corriger-metiers.ts`, simulation par défaut ; « appliquer » en 1re ligne de `tests/metiers.txt`).
  Envoi (26/10, `agents/envoi.ts`, workflow `agent-envoi.yml`, 4 vagues par jour ouvré + un rattrapage à 16 h 37 UTC depuis le 29/10, car GitHub retarde parfois d'1 h ou saute une vague) : Resend, montée progressive
  (`agents/lib/rythme-envoi.ts` : 10 → 15 → 20 → 30 → 40 → 50 par jour, un palier chaque lundi et jeudi, divisé par deux si spam ou > 3 % de rebonds),
  vérification MX, suivi des rebonds/plaintes → liste d'opposition. Coupé tant que `send_enabled` est faux ou que
  EMAIL_FROM / DEMO_BASE_URL manquent. Boîtes d'envoi (28/10, `agents/lib/boites-envoi.ts`) : les conditions de Resend
  interdisent la prospection à froid, donc Valérie envoie depuis de vraies boîtes Google Workspace sur des domaines réservés
  (secret `BOITES_ENVOI`, une ligne « adresse mot-de-passe-d'application » par boîte ; colonne `emails.sender`).
  Chaque boîte a sa montée (`PALIERS_BOITE` 5 → 25 par jour) ; Resend ne prospecte plus dès qu'une boîte existe (28/10,
  `quotaResend`) : réservé aux réponses d'Inès (au plus 15 par jour de prospection seulement s'il n'y a aucune boîte). Relève IMAP (`releverBoites`, par l'envoi et par
  Inès) : rebonds → opposition, autres messages → `mailbox_messages`. Plafond `send_max_per_day` jusqu'à 300.
  Relance (30/10, `agents/lib/relance.ts`, migration 20261030010000_relances_et_vues.sql) : une seule, 6 à 30 jours après le
  1er e-mail sans réponse (prospect « contacte », rien reçu de lui hors réponse automatique) ; texte fixe, `emails.relance_de`,
  préparée « à valider » au début de chaque vague, envoyée UNIQUEMENT depuis la boîte du premier e-mail avec In-Reply-To (fil d'origine), sinon remise à la vague suivante ;
  premier e-mail parti par Resend (26-28/10) : relance « nouvelle adresse » (2/11, `texteRelanceNouvelleAdresse`, objet sans « Re: »,
  e-mail neuf hors fil, n'importe quelle boîte ; anciennes relances « Re: » non parties supprimées par `preparerRelances`) ;
  toutes les relances dues partent d'abord depuis le 5/11 (`PART_RELANCES` = 1 dans envoi.ts ; 0,3 avant, elles s'accumulaient),
  maquettes ouvertes d'abord, puis les plus anciennes ; les premiers e-mails prennent le reste des places.
  Plafond par vague (19/11, demande de Broise : « une douzaine par série, pas tout d'un coup ») : chaque canal envoie au plus
  ceil(quota du jour / 4) par vague (≈ 14 avec 2 boîtes à 25), envoyés en entier au premier passage de la vague (20/11), même après une vague sautée ; seul le rattrapage
  (à partir de 17 h 30, heure de Paris) envoie tout le reste du quota d'un coup.
  Vagues manquées (19/11 : GitHub a sauté les 2 premières) : cron toutes les 30 min (7,37 7-16 UTC) ; chaque vague a sa plage
  (`DEBUT_VAGUES` : 8 h 30, 10 h, 12 h 30, 15 h) et un passage n'envoie que ce qui manque au plafond de la vague en cours
  (`cette_vague`). Un envoi resté « en cours » plus de 70 min (annulé sur GitHub) est marqué « annulee » au passage suivant.
  Réveil (19/11 après-midi : GitHub n'a lancé AUCUN créneau programmé de l'envoi de la journée) : Worker Cloudflare
  `workers/reveil` (« devanture-reveil », Cron Trigger « 7,37 7-16 * * 1-5 », gratuit) qui lance agent-envoi.yml par l'API
  GitHub (secret Worker GITHUB_TOKEN = secret GitHub CLE_GITHUB_ACTIONS, posé par le workflow `reveil.yml`).
  20/11 (bilan de Coco à 1 h du matin, Loïc 8 h en retard, Inès 2 passages sur 7 ; feu vert de Broise) : le Worker
  réveille TOUS les agents programmés. Cron Cloudflare chaque minute ; tableau `TACHES` dans workers/reveil/src/index.ts
  (horaires UTC = anciens cron, à garder alignés avec lib/prochaines-taches.ts : `heuresUtc` × `minutes`, retard fixe de 2 min). Plus AUCUN `schedule:` dans les workflows
  (évite les doublons en retard) ; Loïc reçoit l'input `auto: true` (= ancien `--auto` du créneau programmé).
  Visites des maquettes (30/10) : petit script dans `/m/<slug>` → POST `/m/<slug>` après 1,5 s visibles (4 s jusqu'au 5/11 ; ignoré si navigator.webdriver) → `public.maquette_vue`
  (`websites.vues`, `premiere_vue`, `derniere_vue`, une visite par 30 min ; sans cookie ni IP). Affiché sur la page Valérie.
  Durée (5/11, migration 20261105010000_visites_maquettes.sql) : identifiant de visite au hasard, temps onglet visible envoyé
  après 1,5 s puis toutes les 15 s et à la sortie (corps JSON {v, d, a, p}) → `public.maquette_visite` → table `maquette_visites`
  (date, durée, téléphone/ordinateur) ; affichée par `components/visites-maquette.tsx` (vue d'ensemble, page Valérie, via `lib/visites-maquettes.ts`).
  19/11 (migration 20261119000000_visites_maquettes_reseau.sql) : chaque ouverture garde aussi système, navigateur
  (`lireAppareil`), opérateur, pays et ville approximative (`lireReseau`, cf.city ; jamais l'IP) ; affichés sur la ligne
  de la visite ; repli sur l'ancienne fonction / les anciennes colonnes tant que la migration n'est pas appliquée.
  18/11 (demande de Broise) : chaque ouverture porte une pastille « version A/B/C (+ photo) » ou « relance » = le dernier
  e-mail parti avant elle (`envoiAvant`, `detailsOuvertures` lit aussi les relances) ; ligne « E-mails reçus » par artisan.
  Aperçu de Broise (2/11) : jamais compté s'il est connecté au tableau de bord (`estConnecte`, GET et POST) ou avec `?apercu=1`
  (liens du tableau de bord, gardé par le sélecteur de style) ; pastille « Aperçu — visite non comptée » en bas à gauche.
  Visites du SITE VITRINE (2/11, migration 20261102020000_visites_site.sql) : script du layout de devanture-site → sendBeacon
  POST `/api/visite` (exception dans `proxy.ts`) après 4 s → `public.site_vue` → `site_visites` (jour, page, source, visites ;
  sans IP ni cookie). Ignoré si Broise est connecté (`lib/est-connecte.ts`, cookies envoyés car même site), avec `?apercu=1`,
  pour les robots et la navigation interne. Panneau « Site vitrine » de la vue d'ensemble (7 et 30 jours, provenances, pages).
  Détail par visite (13/11, migration 20261113000000_visites_site_detail.sql, demande de Broise) : le script du site
  (dépôt devanture-site, layout.tsx) tire un numéro de visite au hasard et renvoie { v, d, n } toutes les 15 s, au changement
  de page et en quittant → `public.site_visite` (crée la ligne de `site_visites_detail` ET ajoute 1 au compteur du jour ;
  ensuite allonge durée et pages) ; appareil / système / navigateur lus dans le User-Agent (`lib/appareil.ts`). Repli sur
  `site_vue` si la migration manque. Le renvoi de devanture-sites.fr vers le site vitrine ajoute `?src=email` (→ « e-mail
  de prospection ») ou `?src=maquette` (proxy.ts). Panneau : liste « Dernières visites, une par une » (`lib/visites-site.ts`,
  `components/visites-site.tsx`) avec indices : maquette ouverte dans l'heure d'avant, e-mails partis dans les 3 h.
  Visites d'avant le 13/11 retrouvées dans les journaux Cloudflare (`agents/visites-site-detail-retrouvees.ts`, « detail-site »
  en 1re ligne de tests/compteur.txt ; lignes `retrouvee`, sans durée ; Broise, robots déclarés et essais de Claude écartés).
  Robots (13/11 après-midi, diagnostic `agents/diag-azure.ts`, « azure » dans tests/compteur.txt) : Microsoft 365 ouvre les
  liens de chaque e-mail reçu depuis ses serveurs (AS8075 : Dublin, San José, Paris), exécute la page et était compté comme
  visite du site ET ouverture de maquette (toutes les ouvertures « Microsoft 365 » du 9 au 13/11). `lib/reseau.ts` reconnaît
  les réseaux d'hébergeurs (cf.asn de Cloudflare via `getCloudflareContext`, jamais l'IP) ; migration
  20261113010000_visites_site_robots.sql : colonnes reseau / pays / robot, un robot n'entre pas dans les compteurs par jour.
  19/11 (visites « CHINANET », 4-11 s) : `PAYS_HUMAINS` dans lib/reseau.ts : une visite venue d'un pays hors France (outre-mer
  compris) et voisins proches = robot, site ET maquettes ; anciennes visites du site nettoyées par
  `agents/retirer-robots-site.ts` (« robots-site » en 1re ligne de tests/compteur.txt, relançable).
  Maquettes (13/11) : POST /m/<slug> d'un réseau d'hébergeur ignoré (app/m/[slug]/route.ts) ; historique nettoyé par
  `agents/retirer-robots-maquettes.ts` (« robots-maquettes » dans tests/compteur.txt ; relançable).
  13/11 (bilan sans robots : photo 0/105, A 9/66, B 1/54 ; décisions de Broise) : plus AUCUNE photo dans les e-mails ;
  version B arrêtée, nouvelle version C très courte (35-60 mots, question en un mot) ; Valérie équilibre A et C
  (`VARIANTES_ACTIVES`) ; `--b-en-c` (input « b_en_c » du workflow Valérie) réécrit en C les B pas encore partis.
  Bandeau « Ce site m'intéresse » collé en haut des maquettes publiques (`lib/bandeau-interet.ts`) → POST
  `/m/<slug>/interet` → `public.maquette_interet` → table `maquette_interets` (migration 20261113030000) → réveil
  d'Inès → `agents/interets.ts` envoie l'alerte à Broise (Resend, expéditeur alertes@, ignoré par Inès) ; panneau
  en tête de la vue d'ensemble (`components/artisans-interesses.tsx`, « Marquer traité ») ; alerte urgente de Coco ;
  plus de relance automatique pour un artisan intéressé.
  19/11 (demande de Broise, 0 réponse intéressée, ouvertures de 4 à 20 s) : plus AUCUN trou en haut des maquettes.
  Téléphone, e-mail et horaires : la vraie valeur ou rien (fini « Votre numéro », « Vos horaires » en pointillés, et la
  note Google vide du style chaleureux) ; boutons « Appeler » seulement avec un numéro. Téléphone public de la liste RGE :
  `telephoneValide` + champ `telephone` dans rge.ts (si l'ADEME refuse le champ → lecture sans), gardé par Loïc dans
  `prospects.phone`, mis par Sid dans `content.telephone` ; rattrapage des anciens : `agents/telephones.ts` (workflow
  `telephones.yml`, « appliquer » en 1re ligne de tests/telephones.txt). Le cadre gris « Votre photo ici » est remplacé
  par une photo du métier (`agents/lib/photo-metier.ts` : Unsplash, 2-3 par métier, choisie par le nom, `onerror` efface
  l'image) ; jamais sur les sites définitifs de Pedro. Réalisations / « Mes derniers chantiers » (19/11, même demande) :
  remplies de photos d'illustration du métier (`photosChantiers`, autres que celle de l'en-tête), en image de fond des cadres
  (pas de photo = couleur du cadre), avec la mention « Photos d'illustration : vos propres chantiers prendront leur place ».
  Version « moderne » (19/11, validée par Broise) : `agents/lib/moderne.ts` (`moderniser`) ajoute par-dessus la page rendue
  une feuille de style + un script (galerie des chantiers qui défile en boucle, haut de page en cascade, zoom lent de la photo,
  blocs qui apparaissent au défilement, barre de progression, prefers-reduced-motion respecté) ; par défaut sur /m et /demo,
  `?moderne=0` pour l'ancienne. Pas sur les sites de Pedro.
  Bilan en lecture seule : workflow `bilan.yml` (`agents/bilan.ts`), relancé en modifiant `tests/bilan.txt` ; résultat en annotations.
  Migrations : workflow « Appliquer une migration » (`agents/appliquer-migration.ts`) au lieu du SQL Editor.
  Deux styles (26/10) : chaque maquette existe en « pro » et « chaleureux » (19/11 : chaleureux = style 1, affiché par défaut sur /m et /demo) (`agents/lib/demo-styles.ts`,
  sélecteur en haut de `/demo/<id>?style=…`) ; captures par style + « duo » pour l'e-mail (`website_captures.style`).
  Habillage (27/10, `agents/lib/habillage.ts`) : chaque maquette reçoit une combinaison de variantes par style
  (palette, polices, en-tête, prestations, réalisations ; `content.habillage`, absente = apparence d'origine).
  Sid choisit la plus éloignée de celles des « voisins » (même métier + même département, clients de la même commune).
  Rattrapage des anciennes maquettes : `--habiller` (sans IA, refait les captures). `/demo/exemple` tire un habillage
  au hasard (`?v=<code>` pour en garder un). Nouvelle variante : l'ajouter dans le modèle ET dans `NB_VARIANTES`.
  Nettoyage quotidien (`agents/nettoyage.ts` → `public.nettoyer_base()`) : photos inutiles, coordonnées des opposés,
  journaux > 90 jours, prospects > 3 ans. Ne touche jamais `opposition_list`.
  Boîte mail (27/10, `docs/boite-mail.md`) : Worker Cloudflare `workers/boite-mail` (Email Routing → `mailbox_messages`,
  copie Gmail, réveille le workflow `agent-boite.yml`) ; Inès (`agents/boite.ts`, agent `boite`, page `/ines` ; la boîte mail elle-même,
  façon messagerie — Reçus, Envoyés avec la prospection de Valérie, Brouillons, Spam — est sur `/boite?dossier=…&m=<fil>`) trie,
  met les STOP en opposition (détection codée, sans IA), répond seule aux messages simples (questions, « pas intéressé »)
  et prépare les autres (prix, contrat, paiement, appel, intéressés, inconnus, pièces jointes → garde-fous
  `agents/lib/boite.ts`) ; envoi via Resend 8 h – 20 h. Adresse de réponse par prospect : `ambroise+p-<id>@…`
  (`adresseReponse`, aussi utilisée par Valérie). Nettoyage : `public.nettoyer_boite()`.
  Contacts de chauffe (3/11, migration 20261103000000_contacts_chauffe.sql) : `agent_settings.contacts_chauffe` (ligne `boite`,
  champ sur /ines) ; leurs messages → catégorie `chauffe`, statut `ignore`, sans prospect, sans IA ; exclus des comptes de réponses
  (Coco, bilan, relances). Colombe (fiche de test « Colombe Carrelage & Crédences », écartée) est le premier.
- Mise en ligne (27/10, `docs/mise-en-ligne.md`) : OpenNext Cloudflare (`open-next.config.ts`, `wrangler.jsonc`, Worker
  `devanture-app` sur app.devanture-artisans.fr, construit à chaque push). Maquettes publiques `/m/<slug>` (route sans
  connexion, exception dans `proxy.ts`, données via `public.maquette_publique` appelée avec la clé publique).
  `DEMO_BASE_URL` = https://app.devanture-artisans.fr/m. Les `NEXT_PUBLIC_*` sont des variables de BUILD Cloudflare.
- Paiements (28/10) : Stripe (compte « entreprise individuelle », SEPA + carte, Radar Lite). Catalogue créé par le workflow
  manuel « Stripe — catalogue » (`agents/stripe-catalogue.ts`, mode test puis production ; secrets `STRIPE_SECRET_KEY_TEST`,
  `STRIPE_SECRET_KEY` = clé restreinte `rk_live_`). Liens de production recopiés dans `agents/lib/paiement.ts`
  (`OFFRE_LANCEMENT_OUVERTE` à passer à false après le 5e client) : carte « Liens de paiement » (`components/liens-paiement.tsx`,
  page Inès et boîte mail) et message système d'Inès (`liensPourInes`). Factures émises par Stripe jusqu'à la facture
  électronique obligatoire (sept. 2027 → Shine). Case CGV obligatoire (`consent_collection[terms_of_service]`, 29/10) sur tous
  les liens : ajoutée aux liens existants à chaque passage du workflow (le Shell Stripe est en lecture seule en mode réel et le
  tableau de bord ne modifie pas les liens créés par l'API) ; exige l'URL des CGV dans Stripe > Informations publiques.
- Clients (29/10) : procédure `docs/apres-signature.md` ; table `clients` (migration 20261029000000_clients.sql, une fiche
  par prospect, l'insertion passe le prospect en « client »), étapes et « à faire » dans `lib/clients.ts`, page `/clients`
  (actions `app/clients-actions.ts`). Règle : le domaine du client s'achète seulement après sa validation écrite du site.
  Formules et paiement (29/10, arrangement A) : contenu des formules dans le prompt d'Inès (`redaction-reponse.ts`) et sur le
  site vitrine ; « 0 € de départ » = lien d'abonnement envoyé à la COMMANDE (1er mois compté dans les 12, `quand: "signature"`) ;
  seuls les abonnements sans engagement (19 €/39 €) partent à la mise en ligne.
  Paiements et accueil (29/10, migration 20261029010000_accueil_et_paiements.sql) : `agents/paiements.ts` (étape du workflow
  agent-boite.yml, `continue-on-error`) relève les Checkout Sessions terminées (clé `STRIPE_SECRET_KEY`, lecture « Checkout
  Sessions »), les range dans `paiements_stripe`, crée la fiche client et le brouillon de bienvenue (`agents/lib/accueil.ts`) ;
  sinon « à rattacher » (page Clients). Page publique `/bienvenue/<jeton>` (exception dans `proxy.ts`, `clients.jeton`) :
  fonctions `accueil_client` / `accueil_enregistrer` (security definer) et dépôt DIRECT du navigateur vers le stockage
  Supabase, bucket privé `clients` (règle `clients_depot` via `depot_ouvert`) : jamais de fichiers à travers le Worker.
- Pedro (appelé Devi jusqu'au 5/11 ; /devi redirige vers /pedro ; workflow, tâche `site_production` et migrations inchangés), l'agent des sites définitifs (30/10, `docs/sites-clients.md`, page `/pedro`) : `agents/site.ts` (workflow `agent-site.yml`, chaque jour
  ouvré 8 h 47 UTC + boutons « Préparer le site » / « Mettre en ligne » de la fiche client, `lancerPedro`). Part de la maquette
  (style choisi, habillage), réécrit les textes avec le contenu du client (`redaction-site.ts`), prépare et légende les photos
  (`photos.ts` : sharp installé seulement dans le workflow, HEIC via heif-convert ; Haiku vision), pages Pro et mentions légales
  (`site-final.ts`), polices hébergées (`polices.ts`). Mode « vrai site » des deux modèles : champ `content.reel`
  (`site-reel.ts`, liens internes préfixés `{{R}}`, repères `<!--principal-->` / `<!--contact-->` à garder dans les modèles).
  Fichiers publiés dans le stockage Supabase, bucket PUBLIC `sites/<slug>/` (secret `SUPABASE_SECRET_KEY`), servis par le Worker
  `workers/sites` (« devanture-sites », workflow `sites-serveur.yml`, aucun secret, aucune route dans wrangler) :
  apercu.devanture-artisans.fr/<slug>/ et domaines clients (`sites/_hotes.json`, branchés par l'API Cloudflare, `cloudflare.ts`).
  `websites.kind = 'production'` (un par prospect, `template` = site-pro | site-chaleureux). Mise en ligne seulement après
  validation écrite (étapes valide / domaine_achete). Formulaire : `app/api/devis` → `devis_deposer` → `demandes_devis` →
  `agents/devis.ts` (étape du workflow d'Inès, Resend). Migration 20261030000000_sites_clients.sql.
- Coco, l'agente superviseuse (30/10, migration 20261030020000_coco.sql, page `/coco`, actions `app/coco-actions.ts`) :
  pilote automatique (`agent_settings` agent `coco`, `enabled`) de la relecture des e-mails « à valider » de Valérie.
  `agents/lib/coco.ts` (`relire`) : vérifications par le code d'abord (opposition, doublon d'adresse, maquette, statut du
  prospect, artisan qui a déjà écrit, lien/signature/mentions, prix, texte à remplir), puis Claude Haiku avec l'œil de Broise
  (premiers e-mails seulement ; les relances, texte fixe, n'ont que le code). Verdicts dans `emails.coco_verdict` / `coco_avis` /
  `coco_le` : ok → validé ; corrige → message corrigé (jamais la signature ni les mentions, garde-fous `correctionSure`) puis
  validé ; garde → reste « à valider » pour Broise. Un texte modifié par quelqu'un d'autre efface l'avis (trigger
  `emails_coco_relire`) et repasse en relecture. Depuis le 3/11 : appelée juste après la rédaction de Valérie
  (`relectureCoco` dans agents/emails.ts, après la rédaction et après `--reecrire` ; 80 au plus, 8 min max, reprend aussi les
  non-relus) ; l'envoi (envoi.ts) ne lui fait plus relire que les relances qu'il vient de préparer (`seulement: "relances"`,
  40 au plus, 8 min max ; en cas d'échec, l'envoi continue avec ce qui était validé). Bilan quotidien
  `agents/coco.ts` (workflow `agent-coco.yml`, 17 h 13 UTC tous les jours ; `--relire N` à la main ou bouton de la page ; `--revoir-gardes` remet ses e-mails gardés en relecture). Assouplie le 30/10 : faits vrais à ne pas mettre en doute (contenu de la maquette, argument « un chantier rembourse le site » de la version B, artisans qualifiés par Loïc / RGE) ; ne garde que ce que l’artisan verrait (mauvais nom, autre métier, pas un artisan) →
  table `coco_rapports` (chiffres + alertes urgent / attention / info). Coco ne touche jamais aux réponses d'Inès ni aux liens de paiement.
  Renvois (30/10, migration 20261030030000_coco_renvois.sql) : un e-mail gardé porte `coco_cause` (email → Valérie,
  maquette → Sid, artisan → écarter, autre) et `coco_metier` (libellé de metiers.ts). Boutons de /coco (`deciderEmailGarde`) :
  « Faire réécrire » ajoute « [Coco] remarque » aux notes du prospect (lue par Valérie : `remarque` dans `redigerEmail`) puis
  supprime l'e-mail ; « Refaire la maquette » archive la démo, remet le prospect « qualifié » (avec le bon métier) pour Sid ;
  « Écarter » passe le prospect « écarté ».
  Renvoi automatique (9/11, choix de Broise) : `renvoyer` dans lib/coco.ts fait seul « Faire réécrire » (cause email, ou
  correction écartée) et « Refaire la maquette » (cause maquette avec un libellé de métier valide) pour les PREMIERS e-mails ;
  note « [Coco] … » (lue par Valérie) ou « [Coco → Sid] … » (pas lue par Valérie). Au plus 2 renvois par artisan (lignes
  « [Coco » des notes), ensuite l'e-mail reste gardé pour Broise. « artisan » et « autre » restent toujours pour Broise.
  17/11 (demande de Broise : « qu'elle ne me garde rien ») : PLUS RIEN n'est gardé. `regler` dans lib/coco.ts règle tout :
  texte → Valérie ; maquette (métier connu, sinon celui de la fiche) → Sid ; pas une cible, adresse absente / en opposition /
  doublon, ou déjà 2 renvois → artisan « écarté » ; l'artisan a écrit ou son statut a changé → e-mail « annule » ; relance
  avec un problème → relance « annule ». Statut d'e-mail « annule » (migration 20261117000000, qui remet aussi en relecture
  les anciens gardés) : Valérie ne réécrit pas pour cet artisan, la relance n'est pas reproposée.
  19/11 (demande de Broise) : réécriture immédiate. Dans agents/emails.ts, quand Coco renvoie des e-mails à Valérie
  (`relectureCoco` renvoie `renvoyes_valerie`), Valérie réécrit tout de suite ces artisans (note « [Coco] » sans e-mail) et
  Coco les relit aussitôt, au plus 2 tours de plus (`TOURS_REECRITURE`) ; au 3e problème Coco écarte l'artisan (MAX_RENVOIS).
  Même jour : 4 métiers ajoutés (Isolation, Panneaux solaires, Façadier, Poêles et cheminées) dans metiers.ts, rge.ts
  (domaines RGE) et metier-artisan.ts (nom, NAF compatibles ; « Elec » dans le nom = Électricien) : les entreprises RGE
  correspondantes étaient rangées en plaquiste / électricien / maçon / plombier et Coco écartait leurs maquettes.
  corriger-metiers.ts relit les domaines RGE à l'ADEME par SIRET (`entreprisesRgeParSiret`) et remet en route les
  artisans écartés par Coco dont le métier change (note « [Métier corrigé] … 17/11) »). Appliqué le 17/11 (feu vert de
  Broise) : 97 artisans corrigés, e-mails non partis supprimés, maquettes à refaire par Sid. Next.js passé en 16.4.6 le
  même jour (faille de sécurité) ; alertes restantes de npm audit = outils de construction d'OpenNext, non exposés.
- Vue d'ensemble (2/11, erreur 1102 persistante) : lit `getVueEnsemble` (colonnes utiles, comptes par la base, erreurs des 14 j,
  chiffre + panneau « Maquettes ouvertes » : 6 dernières, taux sur les artisans contactés ; disposition : activité | prochaines tâches, puis erreurs | maquettes ouvertes)
  tâches : 8 dernières + échecs/réussites des 14 j + compte en cours ; coûts du mois avec `tasks(agent)` joint)
  et non plus `getData()` ; `getData()` ne lit plus `tasks.input` (jamais affiché). Règle : une page = les colonnes dont elle a besoin.
- Allègement du 3/11 (1102 malgré tout : le diagnostic `diag-worker.yml` montre 10-30 ms de CPU en médiane et 400-1000 ms au p99
  pour un plafond de 10 ms sur le plan gratuit) : liens internes SANS préchargement (`components/lien.tsx`, à utiliser à la
  place de `next/link`) ; `getData(...parties)` ne lit que les tables demandées (chaque page liste les siennes) ;
  menu : échecs des 14 j + dernière réussite par agent au lieu de 300 tâches ; AutoRefresh toutes les 60 s (30 s minimum),
  onglet visible seulement ; page Valérie : 25 éditeurs « à valider » au plus. Si ça ne suffit pas : plan Workers Paid.
- Cloud Run (5/11, `docs/cloud-run.md`) : le plan gratuit de Cloudflare (10 ms de CPU) ne suffit pas au tableau de bord,
  qui part sur Google Cloud Run (service `devanture-tableau`, europe-west1, gratuit) : `Dockerfile` (`SORTIE_AUTONOME=1`
  → `output: "standalone"`), workflow `tableau-cloud-run.yml`. Cloudflare garde les pages publiques ; avec la variable GitHub
  `TABLEAU_URL` (→ `NEXT_PUBLIC_TABLEAU_URL`), `proxy.ts` renvoie le reste de app.devanture-artisans.fr vers Cloud Run.
- Domaines alignés (9/11, test orca.eu classé indésirable par Microsoft 365 malgré SPF/DKIM/DMARC OK) : un e-mail parti
  d'une boîte de prospection ne cite plus devanture-artisans.fr. Réponse et List-Unsubscribe → la boîte elle-même avec
  l'étiquette du prospect (`a.leclerc+p-<id>@devanture-sites.fr`, gardée par `releverBoites` dans `to_email`) ; lien de la
  maquette, mentions et signature → `https://<domaine de la boîte>/…` (`alignerDomaine` dans envoi.ts) SEULEMENT si
  `domaineServi` voit la racine du domaine renvoyer vers le site vitrine (sinon liens laissés sur app.devanture-artisans.fr).
  Le domaine est relié au Worker devanture-app (domaine personnalisé dans Cloudflare) ; `proxy.ts` n'y sert que `/m/…`
  et renvoie tout le reste vers devanture-artisans.fr (`lib/domaines-prospection.ts` : ajouter le 2e domaine ici).
- Page « Sites web » (/sites) supprimée le 2/11 (plantait, inutilisée) : maquettes sur /sid, sites clients sur /pedro.
- Prochaines tâches (27/10, `lib/prochaines-taches.ts`, `components/prochaines-taches.tsx`) : vue d'ensemble (version courte)
  et page Tâches (complète). Horaires recopiés des `cron` des workflows : les changer ici aussi si un workflow change.
  4/11 : heure affichée = cron + retard habituel de GitHub par créneau (`retards`, médianes observées, 30 à 65 min) ;
  `getPassagesGithub` lit le dernier passage de chaque workflow (API GitHub, `GITHUB_ACTIONS_TOKEN`, 1 requête par workflow) :
  un créneau reste affiché (« En retard », puis « En cours ») tant que GitHub ne l'a pas lancé et fini ; « sautée » si le
  précédent n'a jamais eu lieu. Sans clé ou si GitHub ne répond pas : horaires seuls, 20 min de marge.
- Style des e-mails (Valérie, Inès) : `agents/lib/style.ts` — phrases courtes (15 mots environ) mais reliées (mais, donc…), pas d'énumération ;
  phrases trop longues réécrites une fois (Valérie) ou réponse mise à valider (Inès).
- Robustesse (13/11, échecs de Loïc) : tout appel à l'API Claude passe par `httpClaude` (agents/lib/http.ts : 4 essais,
  5/20/45 s, sur coupure, 429, 5xx, 529) ; les lignes de prospects passent par `sansNul` (agents/lib/db.ts) car PostgreSQL
  refuse le caractère nul que contiennent certains sites.
- Futurs agents : avant chaque tâche, lire `ai_budget_status` et s'arrêter si `depasse` ; avant chaque e-mail,
  vérifier `public.is_opposed(email)`. Enregistrer chaque dépense dans `costs` (catégorie `api`).
- Dépôt bientôt PUBLIC (18/11, décision de Broise : minutes GitHub Actions gratuites et illimitées). Règles : JAMAIS de
  secret, d'adresse e-mail personnelle, de numéro de téléphone ni de donnée d'artisan dans le code, les tests, les docs ou les
  messages de commit. Les adresses de test viennent du secret GitHub `ADRESSE_TEST` (fichiers tests/*.json avec une adresse vide).
  Journaux GitHub (publics) : `agents/lib/sortie-publique.ts` filtre toute la sortie des agents dans GitHub Actions (stdout,
  stderr, annotations) et le résumé (`ajouterResume`, jamais appendFileSync sur GITHUB_STEP_SUMMARY) : valeurs des colonnes
  « artisan » lues dans la base (enregistrées par `connecter()`, option transform), noms venus de RGE / Google (`masquer`),
  e-mails (sauf nos domaines), téléphones, SIRET, liens /m/<slug>. Tout script agents/*.ts importe db.ts ou ce module.
  bilan.ts : colonnes sensibles affichées « • ». Le détail complet reste dans la base (journal des tâches du tableau de bord).
  Anciens lancements (avec noms) supprimés le 18/11.
- À appeler (24/11, demande de Broise : 35 maquettes ouvertes, 0 réponse écrite) : page `/appeler` (menu après Prospects ; seulement les artisans DÉJÀ relancés par e-mail),
  `lib/a-appeler.ts` : artisans qui ont ouvert leur maquette (hors clients et liste d'opposition), « chauds » = ouverte 2 fois
  ou 45 s au total, avec leur téléphone (`prospects.phone`, liste RGE). Fiche `/appeler/<id prospect>` : script d'appel
  personnalisé (nom, métier, prestations et zone de la maquette, site actuel, offre de `paiement.ts`), objections, répondeur,
  résultat (`app/appel-actions.ts` : ligne « [Appel jj/mm hh:mm] … » dans les notes ; intéressé → `interesse`, pas intéressé →
  `refuse`, ce qui arrête la relance). Ne jamais dire à l'artisan qu'on a vu qu'il avait ouvert la maquette.
  25/11 (demande de Broise) : « Messagerie » et « À rappeler » restent à appeler (panneau « À rappeler ») ; un artisan qui rouvre
  sa maquette après le dernier appel (`rouvertApresAppel`, date lue dans la ligne « [Appel jj/mm hh:mm] », `dateAppel`) remonte en tête
  (panneau « Ont rouvert leur maquette après ton appel »). Seuls Intéressé, Pas intéressé et Mauvais numéro vont dans « Déjà appelés ».
  25/11 (demande de Broise) : le script tient compte des appels déjà notés (`contexteAppels`, page `/appeler/<id>`) :
  dernier appel « À rappeler » → « on s'est parlé le …, je vous rappelle comme prévu » ; « Messagerie » déjà noté → « je vous ai laissé un message le … »
  (jamais de 2e message) ; panneau « Avant d'appeler » prévenu aussi si l'artisan a rouvert sa maquette depuis (à ne pas lui dire).
- Données personnelles : respecter `docs/registre-rgpd.md` (B2B uniquement, sources publiques, 3 ans max,
  lien de désinscription dans chaque e-mail). Mettre le registre à jour à chaque nouvel outil.
- Vérifier avec `npm run typecheck` puis `npm run build` avant de dire que c'est fini.
