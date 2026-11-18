# Tableau de bord sur Google Cloud Run (5/11/2026)

## Pourquoi
Le plan gratuit de Cloudflare coupe une page dès qu'elle dépasse 10 ms de calcul (erreur 1102). Le tableau de bord
(Next.js) en demande 40 à 90 ms en médiane, jusqu'à 800 ms : l'allègement du 3/11 ne pouvait pas suffire.
Google Cloud Run n'a pas cette limite et son niveau gratuit (par compte de facturation, chaque mois : 180 000 vCPU-secondes,
360 000 Gio-secondes, 2 millions de requêtes) dépasse de loin l'usage du tableau de bord. Région : europe-west1 (Belgique).

## Qui sert quoi
- **Cloud Run** (`devanture-tableau`) : tout le tableau de bord. 0 instance au repos (gratuit) : la première page après
  une pause met 2 à 3 secondes, ensuite c'est rapide.
- **Cloudflare** (`devanture-app`, inchangé) : pages publiques `/m/` (maquettes), `/bienvenue/`, `/api/devis`, `/api/visite`.
  Quand la variable GitHub `TABLEAU_URL` est renseignée, `proxy.ts` renvoie tout le reste de app.devanture-artisans.fr
  vers Cloud Run.

## Fichiers
`Dockerfile` (construction autonome, `SORTIE_AUTONOME=1` → `output: "standalone"`), `.dockerignore`,
workflow `tableau-cloud-run.yml` (image dans Artifact Registry `devanture`, 2 dernières gardées, puis `gcloud run deploy`).

## Mise en place (à faire une fois par Broise, sur PC)
1. console.cloud.google.com, ton projet : activer **Cloud Run Admin API** et **Artifact Registry API**
   (barre de recherche en haut → l'API → « Activer »).
2. IAM et administration > Comptes de service > Créer : nom `github-deploy`, rôles **Administrateur Cloud Run**,
   **Administrateur Artifact Registry**, **Utilisateur du compte de service**. Puis sur le compte : Clés > Ajouter une clé >
   JSON (un fichier se télécharge).
3. GitHub > Devanture > Settings > Secrets and variables > Actions > New repository secret :
   - `GCP_SA_KEY` : tout le contenu du fichier JSON (puis supprimer le fichier de ton PC) ;
   - `GCP_PROJECT_ID` : l'ID du projet (en haut de la console Google Cloud) ;
   - `CLE_GITHUB_ACTIONS` : la même clé GitHub que `GITHUB_ACTIONS_TOKEN` (pour les boutons « Lancer » des agents).
4. Actions > « Tableau de bord — Cloud Run » > Run workflow. L'adresse s'affiche à la fin (…run.app).
5. Adresse (5/11) : https://devanture-tableau-4hyif2bz7a-ew.a.run.app, écrite dans les deux workflows (la variable GitHub `TABLEAU_URL` la remplace si elle existe).
   app.devanture-artisans.fr y renvoie tout sauf les pages publiques. Dans Supabase > Authentication > URL Configuration,
   ajouter l'adresse aux Redirect URLs (e-mail « mot de passe oublié »).

## Coûts
Gratuit tant que l'usage reste dans le niveau gratuit (largement). Le budget Google Cloud de 5 €/mois sert d'alarme.
