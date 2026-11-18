# Devanture

Tableau de bord pour piloter une petite agence web automatisée.
**Version 1** : l'interface et la base de données seulement. Aucun agent, aucune prospection réelle, aucun e-mail envoyé.
**Phase 1 (socle avant les agents)** : mot de passe oublié, liste d'opposition, budget IA avec alerte,
sauvegarde automatique, registre RGPD. Voir « Nouveautés de la phase 1 » plus bas.

---

## Comment c'est organisé

```
Devanture/
├── app/                    Les pages (une page = un dossier avec page.tsx)
│   ├── (dashboard)/        Les 5 pages du tableau de bord + leur mise en page commune
│   │   ├── page.tsx        Vue d'ensemble   →  http://localhost:3000/
│   │   ├── prospects/      Prospects        →  /prospects
│   │   ├── sites/          Sites web        →  /sites
│   │   ├── campagnes/      Campagnes        →  /campagnes
│   │   └── taches/         Tâches           →  /taches
│   │   └── opposition/     Liste d'opposition →  /opposition
│   ├── login/              Page de connexion
│   ├── mot-de-passe-oublie/  Demander un lien de réinitialisation
│   ├── nouveau-mot-de-passe/ Choisir un nouveau mot de passe
│   ├── auth/confirm/       Arrivée depuis un lien envoyé par Supabase
│   ├── actions.ts          Connexion, déconnexion, mot de passe (exécuté sur le serveur)
│   ├── admin-actions.ts    Ajouts à la liste d'opposition, budget IA
│   └── globals.css         Couleurs et styles
├── components/             Morceaux d'interface réutilisables (pastilles, panneaux, menu)
├── lib/
│   ├── data.ts             Lit les données : Supabase OU données fictives
│   ├── demo-data.ts        Les données fictives (toutes marquées « fictif »)
│   ├── types.ts            La forme des données (miroir des tables SQL)
│   ├── format.ts           Libellés français, formats de dates et d'euros
│   └── supabase/           Connexion à Supabase
├── proxy.ts                Garde à l'entrée : renvoie vers /login si on n'est pas connecté
├── supabase/
│   ├── migrations/         Le schéma de la base (tables, relations, sécurité RLS)
│   ├── seed.sql            Les données fictives, version SQL
│   └── remove-demo-data.sql  Pour effacer les données fictives plus tard
├── docs/                   Sauvegardes, registre RGPD, choix d'hébergement des agents
├── .github/workflows/      Sauvegarde automatique hebdomadaire de la base
├── .env.example            Liste des variables à remplir (sans valeurs)
└── package.json            Liste des dépendances et des commandes
```

**Deux modes :**
- **Mode démo** (par défaut) : pas de Supabase, pas de connexion, données fictives locales. Un bandeau jaune le rappelle.
- **Mode Supabase** : dès que `.env.local` est rempli, l'app lit ta vraie base et demande une connexion.

---

## Étape A — Lancer l'application sur ton PC (mode démo)

1. **Installer Node.js** (une seule fois) : va sur https://nodejs.org, télécharge la version **LTS**, installe-la avec les options par défaut.
2. **Ouvrir le dossier dans VS Code** : *Fichier > Ouvrir le dossier…* → `Bureau\Devanture`.
3. **Ouvrir un terminal** dans VS Code : menu *Terminal > Nouveau terminal*. Une zone de texte apparaît en bas.
4. Vérifier Node, taper puis Entrée :
   ```
   node -v
   ```
   Tu dois voir `v20…`, `v22…` ou plus. Sinon, ferme et rouvre VS Code après l'installation.
5. Installer les dépendances (1 à 2 minutes, une seule fois) :
   ```
   npm install
   ```
6. Démarrer :
   ```
   npm run dev
   ```
7. Ouvrir http://localhost:3000 dans ton navigateur. 🎉
8. Pour arrêter : clique dans le terminal et fais `Ctrl + C`.

> Sous Windows, si PowerShell affiche « l'exécution de scripts est désactivée », tape une fois
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` puis réponds `O`.

---

## Étape B — Brancher ta base Supabase

### B1. Créer les tables
1. Supabase → ton projet → **SQL Editor** → **New query**.
2. Ouvre `supabase/migrations/20261019000000_schema_initial.sql`, copie **tout**, colle, clique **Run**.
   Résultat attendu : « Success. No rows returned ».
3. **New query** à nouveau, et même chose avec `supabase/migrations/20261020000000_opposition_et_budget.sql`
   (liste d'opposition + budget IA). Toujours dans l'ordre des dates.
4. (Facultatif) Même chose avec `supabase/seed.sql` pour avoir les données fictives dans la base.

> ⚠️ Si tu as activé l'option qui déploie automatiquement les migrations depuis GitHub
> (Supabase > Integrations > GitHub), le fichier de migration s'exécutera tout seul après ton envoi sur GitHub :
> ne le lance pas aussi à la main.

### B2. Créer ton compte et devenir administrateur
1. Supabase → **Authentication** → **Users** → **Add user** → **Create new user**.
   Mets ton e-mail et un mot de passe solide, coche **Auto Confirm User**.
2. Retourne dans **SQL Editor** et exécute (remplace l'e-mail) :
   ```sql
   insert into public.app_admins (user_id)
   select id from auth.users where email = 'ton.email@exemple.fr';
   ```
3. Ferme la porte aux inconnus : **Authentication → Sign In / Providers** → désactive **Allow new users to sign up**.

### B3. Donner les clés à l'application
1. Dans VS Code, fais un clic droit sur `.env.example` → *Copier*, puis *Coller* : renomme la copie en **`.env.local`**.
2. Dans Supabase, clique sur **Connect** (en haut) ou va dans **Project Settings → API Keys**, et copie :
   - l'URL du projet → `NEXT_PUBLIC_SUPABASE_URL`
   - la clé **publishable** (`sb_publishable_…`) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
3. Enregistre, arrête le serveur (`Ctrl + C`) et relance `npm run dev`.
4. Tu arrives sur la page de connexion. Connecte-toi : le bandeau « Mode démo » a disparu.

**Ne mets jamais la clé secrète (`sb_secret_…` / `service_role`) dans `.env.local` pour l'instant.**
Elle ne servira qu'aux futurs agents, côté serveur.

---

### B4. Faire marcher « Mot de passe oublié »
Supabase doit savoir vers quelle adresse renvoyer les liens de ses e-mails.
1. Supabase → **Authentication** → **URL Configuration**.
2. **Site URL** : `http://localhost:3000` (tu la remplaceras par l'adresse en ligne plus tard).
3. **Redirect URLs** → **Add URL** : `http://localhost:3000/**` (et plus tard `https://ton-adresse-en-ligne/**`).
4. Teste : page de connexion → « Mot de passe oublié ? » → ton e-mail → clique le lien reçu → choisis un nouveau mot de passe.

> Les e-mails de Supabase en plan gratuit sont limités (quelques-uns par heure) et peuvent arriver dans les
> indésirables : c'est normal pour un outil interne.

---

## Étape C — Envoyer le code sur GitHub

Le plus simple pour débuter : **GitHub Desktop** (https://desktop.github.com).
1. *File > Add local repository…* → choisis `Bureau\Devanture` → *create a repository* → **Create repository**.
2. Vérifie dans la liste des fichiers que **`.env.local` n'apparaît pas** (il est ignoré exprès) et que `node_modules` non plus.
3. **Publish repository** → laisse **Keep this code private** coché.

---

## Comment la sécurité fonctionne

- **RLS (Row Level Security)** est activée sur toutes les tables : la base refuse toute lecture ou écriture,
  sauf pour un utilisateur connecté **et** présent dans `app_admins`.
- Un visiteur non connecté (rôle `anon`) n'a aucun droit sur les tables.
- `proxy.ts` renvoie vers `/login` toute personne non connectée.
- La clé *publishable* peut être vue dans le navigateur : c'est normal, la RLS protège les données.
- Les secrets restent dans `.env.local`, listé dans `.gitignore`.

## Les tables

| Table | Rôle | Liée à |
|---|---|---|
| `campaigns` | Campagnes de prospection (ville, type de commerce, budget) | — |
| `prospects` | Commerces repérés, score, statut du parcours | campagne |
| `websites` | Sites de démonstration ou définitifs | prospect |
| `emails` | Brouillons d'e-mails (jamais envoyés en V1) | prospect, campagne, site |
| `tasks` | Travail d'un agent : statut, tentatives, erreur, tokens | tâche parente, campagne, prospect, site |
| `task_events` | Journal d'une tâche (info / attention / erreur) | tâche |
| `costs` | Chaque dépense (API, hébergement, domaine…) | tâche, campagne |
| `opposition_list` | Adresses ou domaines à ne plus jamais contacter | — |
| `app_settings` | Réglages (une seule ligne) : budget IA mensuel, seuil d'alerte | — |
| `app_admins` | Comptes autorisés à utiliser le tableau de bord | utilisateur Supabase |

Statuts d'une tâche : `en_attente` → `en_cours` → `terminee` / `echouee` / `annulee`.
Une tâche peut être retentée jusqu'à `max_attempts` fois ; chaque essai et chaque erreur sont notés dans `task_events`.

## Commandes utiles

| Commande | Effet |
|---|---|
| `npm run dev` | Lance l'app en mode développement (se recharge à chaque modification) |
| `npm run typecheck` | Vérifie qu'il n'y a pas d'erreur de type TypeScript |
| `npm run build` | Construit la version finale (détecte les erreurs) |
| `npm start` | Lance la version construite |

---

## Nouveautés de la phase 1

**Mot de passe oublié.** Lien sous le formulaire de connexion. Supabase envoie un e-mail ; le lien ouvre
la page « Nouveau mot de passe » (12 caractères minimum). Réglage à faire une fois : étape B4.

**Liste d'opposition** (menu « Liste d'opposition »). Dès qu'un commerce répond « stop » ou « non merci »,
ajoute son adresse (ou son domaine entier). Ensuite :
- ses fiches prospects passent automatiquement en « refusé » ;
- **la base refuse** de créer un e-mail « à valider », « validé » ou « envoyé » vers lui, même si un futur agent se trompe ;
- les agents appelleront `select public.is_opposed('adresse@commerce.fr')` avant chaque envoi.

**Budget IA.** En bas de la vue d'ensemble : dépenses API du mois face au budget (20 € par défaut, modifiable).
Une alerte apparaît en haut de chaque page à 80 %, en rouge à 100 %. Les agents liront la vue
`ai_budget_status` (colonne `depasse`) et s'arrêteront. La vraie barrière reste la **limite de dépense dans la
console Anthropic** : règle-la au même montant.

**Sauvegarde automatique.** Chaque lundi, GitHub copie la base et garde l'archive 90 jours.
Mise en route (5 min : ajouter un secret) : [docs/sauvegardes.md](docs/sauvegardes.md).

**Registre RGPD.** [docs/registre-rgpd.md](docs/registre-rgpd.md) : quelles données, pourquoi, combien de temps,
chez quels prestataires. À compléter avec ton nom et ton adresse, et à relire une fois par an.

**Où faire tourner les agents.** Recommandation et point d'attention sur l'hébergement :
[docs/ou-faire-tourner-les-agents.md](docs/ou-faire-tourner-les-agents.md).

## Nouveautés de la phase 2 : l'agent de prospection

- `agents/prospection.ts` : trouve les artisans du bâtiment dans l'annuaire officiel des entreprises, retrouve leur
  fiche Google, visite leur site pour trouver leur e-mail, les fait noter par Claude Haiku et les range dans Prospects.
- Lancement : GitHub > Actions > **Agent de prospection** > Run workflow. Il utilise les secrets déjà en place.
- Avant le premier lancement : exécuter `supabase/migrations/20261022000000_prospection.sql` dans Supabase.
- La page Prospects affiche maintenant la qualité du site, l'e-mail trouvé, la raison du score et la part de
  prospects avec un e-mail.
- Tout est expliqué dans `docs/agent-prospection.md`.

### Loïc : la page de l'agent

L'agent de prospection s'appelle **Loïc** et a sa page dans le menu : statut en direct, bouton de lancement,
chiffres clés, historique et réglages (pause, lancement automatique en semaine, plafonds, seuils, consignes).
À faire une fois : exécuter `supabase/migrations/20261022010000_reglages_loic.sql` dans Supabase, et, pour le
bouton « Lancer », ajouter `GITHUB_ACTIONS_TOKEN` dans `.env.local` (voir `docs/agent-prospection.md`).

### Loïc couvre la métropole lilloise

11 métiers du bâtiment et du jardin, 45 communes (5 000 habitants et plus). À la main, on choisit le métier et la
commune ; en automatique, Loïc choisit lui-même (d'abord ce qu'il n'a jamais fait). À faire une fois : exécuter
`supabase/migrations/20261022020000_loic_communes.sql` dans Supabase.
