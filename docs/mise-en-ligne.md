# Mise en ligne du tableau de bord et des maquettes (Cloudflare)

Une fois en ligne :
- **Tableau de bord** : `https://app.devanture-artisans.fr`, protégé par ta connexion (même compte qu'en local).
  Tu peux tout piloter depuis ton téléphone : valider les e-mails, répondre sur /boite, lancer les agents.
- **Maquettes publiques** : `https://app.devanture-artisans.fr/m/<slug>`, visibles sans connexion.
  C'est le lien que Valérie met dans les e-mails (`DEMO_BASE_URL`). Une maquette disparaît d'elle-même si
  l'artisan s'oppose, refuse ou est écarté (fonction SQL `public.maquette_publique`).

Comment ça marche : GitHub reconstruit et republie l'application sur Cloudflare à chaque envoi
(outil OpenNext : `open-next.config.ts`, `wrangler.jsonc`). Offre gratuite de Cloudflare Workers.

## 1. Supabase (2 minutes)
1. **SQL Editor** > colle `supabase/migrations/20261027020000_maquettes_publiques.sql` > **Run**.
2. **Authentication** > **URL Configuration** :
   - **Site URL** : `https://app.devanture-artisans.fr`
   - **Redirect URLs** > **Add URL** : `https://app.devanture-artisans.fr/**` (garde aussi `http://localhost:3000/**`).
   Sans ça, le lien « mot de passe oublié » renverrait vers ton PC.

## 2. Mise en ligne par GitHub (5 minutes)
La construction automatique de Cloudflare n'arrivait pas à récupérer le dépôt : c'est donc GitHub qui construit
et publie l'application (workflow `.github/workflows/mise-en-ligne.yml`, à chaque envoi sur GitHub).

1. **Clé Cloudflare** : Cloudflare > icône de profil > **Profile** > **API Tokens** > **Create Token** >
   modèle **« Edit Cloudflare Workers »** > **Use template**. Account Resources : ton compte ;
   Zone Resources : **All zones** > **Continue to summary** > **Create Token** > copie la clé (affichée une seule fois).
2. **Identifiant du compte** : Cloudflare > **Workers & Pages** > colonne de droite **Account ID** > copier.
3. **Secrets GitHub** (dépôt > Settings > Secrets and variables > Actions > New repository secret) :

| Nom | Valeur |
|---|---|
| `CLOUDFLARE_API_TOKEN` | la clé de l'étape 1 |
| `CLOUDFLARE_ACCOUNT_ID` | l'identifiant de l'étape 2 |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` (sans `/rest/v1/`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ta clé `sb_publishable_…` |

4. GitHub > **Actions** > **« Mise en ligne »** > **Run workflow** (3 à 5 minutes).
5. Si un projet `devanture-app` a été créé par « Import a repository » : Worker `devanture-app` > **Settings** >
   **Build** > **Git repository** > **Disconnect** (sinon Cloudflare retente sa construction et affiche des échecs).

## 3. Cloudflare : le secret de l'application (1 minute)
Worker `devanture-app` > **Settings** > **Variables and Secrets** > **Add** :

| Nom | Type | Valeur |
|---|---|---|
| `GITHUB_ACTIONS_TOKEN` | **Secret** | ta clé GitHub (celle de `.env.local`) : pour les boutons « Lancer » des agents |

## 4. Cloudflare : l'adresse app.devanture-artisans.fr (1 minute)
Worker `devanture-app` > **Settings** > **Domains & Routes** > **Add** > **Custom domain** >
`app.devanture-artisans.fr` > **Add domain**. Cloudflare crée l'enregistrement DNS et le certificat tout seul.

## 5. GitHub : le lien des maquettes (1 minute)
Dépôt Devanture > **Settings** > **Secrets and variables** > **Actions** > **New repository secret** :
- `DEMO_BASE_URL` = `https://app.devanture-artisans.fr/m`

## 6. Tester
1. Sur ton téléphone : `https://app.devanture-artisans.fr` → la page de connexion s'affiche → connecte-toi.
2. Ouvre une maquette publique : `https://app.devanture-artisans.fr/m/<slug>` (le slug d'une maquette de Sid ;
   en navigation privée pour vérifier qu'elle s'ouvre **sans** connexion).
3. En cas de souci : Worker `devanture-app` > **Deployments** (journal de construction) ou **Observability**.

## Sécurité
- Tout le tableau de bord exige la connexion (proxy) ; les données restent protégées par la RLS de Supabase.
- Seules les routes `/m/<slug>` sont publiques, et elles ne renvoient que les textes d'une maquette prête.
- Mot de passe d'au moins 12 caractères ; double authentification sur Supabase, GitHub et Cloudflare.

## Domaine de prospection relié aux maquettes (9/11)

Pour que les e-mails de Valérie ne mélangent pas deux domaines, devanture-sites.fr sert aussi les maquettes
(`https://devanture-sites.fr/m/<slug>`). À faire une fois dans Cloudflare : Workers & Pages → devanture-app →
Settings → Domains & Routes → Add → Custom domain → `devanture-sites.fr`. Les enregistrements MX de Google ne
bougent pas. Tant que ce n'est pas fait, l'envoi garde les liens sur app.devanture-artisans.fr (vérifié à chaque passage).
Même chose pour le 2e domaine de prospection (et l'ajouter dans `lib/domaines-prospection.ts`).
