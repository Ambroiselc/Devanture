# Boîte mail de Devanture — installation et fonctionnement

La boîte mail est **intégrée à l'application** : les e-mails reçus sur `ambroise@devanture-artisans.fr`
arrivent dans Supabase, Inès (l'agente de la boîte) les trie et y répond, et tu suis tout sur la page
**Boîte mail** du tableau de bord. Une copie de chaque e-mail arrive aussi dans ton Gmail.

```
Artisan répond ──► Cloudflare Email Routing ──► Worker « boite-mail » ──┬──► copie dans Gmail
                                                                        ├──► Supabase (mailbox_messages)
                                                                        └──► réveille Inès (GitHub Actions)
Inès : trie, met les STOP sur la liste d'opposition, répond seule aux messages simples,
       prépare les autres réponses ──► tu valides sur /ines ──► Resend envoie (8 h – 20 h)

Deux pages dans le tableau de bord (27/10) :
- /boite : la boîte mail, comme une messagerie (Reçus, Envoyés — prospection de Valérie comprise —,
  Brouillons d'Inès, Spam et absences ; e-mail ouvert avec toute la conversation et « Répondre ») ;
- /ines : la page d'Inès (réponses à valider, messages à regarder, passages, réglages).
```

## Ce qu'Inès fait seule, et ce qu'elle te laisse

| Message reçu | Ce qui se passe |
|---|---|
| Absence, réponse automatique, robot | Rangé, sans réponse (aucune dépense d'IA). |
| « STOP », « ne plus me contacter » | Liste d'opposition tout de suite, sans réponse (détecté par le code, sans IA). |
| « Pas intéressé » | Courte réponse de prise en compte, envoyée seule, puis liste d'opposition (raison « refus »). |
| Question simple sur la maquette | Réponse envoyée seule. |
| Artisan intéressé, prix, contrat, paiement, appel, rendez-vous, plainte, pièce jointe, expéditeur inconnu | Réponse **préparée**, elle attend ta validation sur /ines. |

Garde-fous codés en dur (l'IA ne peut pas les contourner) : mots sensibles (prix, €, contrat, paiement,
appel…), au plus 2 réponses seules par conversation, plafond par jour (20 par défaut, réglable), liste
d'opposition vérifiée par le code **et** par la base, budget IA du mois, arrêt après 3 erreurs de suite.
L'interrupteur « Répondre seule aux messages simples » (page /ines) fait tout passer par toi.

Chaque e-mail de Valérie part maintenant avec une adresse de réponse propre au prospect
(`ambroise+p-<identifiant>@devanture-artisans.fr`) : quand l'artisan répond, Inès sait exactement de qui il s'agit.

## Installation (une seule fois, environ 20 minutes)

### 1. La base (Supabase)
Supabase > **SQL Editor** > colle le contenu de `supabase/migrations/20261027000000_boite_mail.sql` > **Run**,
puis fais de même avec `20261027010000_boite_mail_droits.sql` (droits du Worker ; sans elle, erreur 403 dans ses journaux).

### 2. L'adresse Gmail de copie (Cloudflare)
Cloudflare > `devanture-artisans.fr` > **Email** > **Email Routing**.
1. Si ce n'est pas fait : **Get started / Enable**, et accepte l'ajout automatique des enregistrements MX et SPF.
2. Onglet **Destination addresses** > ajoute ton adresse Gmail et clique le lien de vérification reçu dans Gmail.

### 3. Le Worker « boite-mail » (Cloudflare)
1. Cloudflare > **Workers & Pages** > **Create** > **Import a repository** > GitHub > dépôt **Devanture**.
2. Réglages du projet :
   - Nom : `boite-mail`
   - **Root directory** (dossier racine) : `workers/boite-mail`
   - Deploy command : `npx wrangler deploy` (proposé par défaut)
3. **Deploy**. Chaque envoi sur GitHub redéploiera le Worker tout seul.
4. Worker `boite-mail` > **Settings** > **Variables and Secrets** > **Add** :

| Nom | Type | Valeur |
|---|---|---|
| `SUPABASE_URL` | Text | l'adresse du projet Supabase (Project Settings > API), ex. `https://abcd.supabase.co` |
| `SUPABASE_SECRET_KEY` | **Secret** | Supabase > Project Settings > **API Keys** > clé **secret** (`sb_secret_…`) |
| `FORWARD_TO` | Text | ton adresse Gmail (doit être vérifiée à l'étape 2) |
| `GITHUB_TOKEN` | **Secret** | facultatif mais conseillé : la même clé GitHub que `GITHUB_ACTIONS_TOKEN` (droit « Actions : Read and write » sur Devanture). Sans elle, Inès passe seulement toutes les 2 heures. |

### 4. Brancher l'adresse sur le Worker (Cloudflare)
Email Routing > **Routing rules** :
1. **Create address** : `ambroise` > Action **Send to a Worker** > `boite-mail`. (Si une règle `ambroise` → Gmail existe déjà, modifie-la.)
2. **Catch-all address** : **Edit** > **Send to a Worker** > `boite-mail` > active-la. Elle reçoit les adresses
   `ambroise+p-…` et toute autre adresse du domaine (contact@, etc.).

### 5. Les secrets GitHub (dépôt Devanture > Settings > Secrets and variables > Actions)
- `EMAIL_REPLY_TO` = `ambroise@devanture-artisans.fr`
- `RESEND_API_KEY` et `EMAIL_FROM` : déjà mis pour Valérie. Rien d'autre.

### 6. Tester
1. Depuis ton téléphone (une autre adresse que Gmail), écris à `ambroise@devanture-artisans.fr` : « Bonjour, je n'arrive pas à ouvrir la maquette ».
2. La copie arrive dans Gmail tout de suite ; dans la minute, le message apparaît sur la page **Boîte mail**, trié.
3. Comme tu n'es pas un prospect connu, la réponse t'attend dans « Réponses à valider » : valide-la pour voir partir un envoi.
4. En cas de souci : Cloudflare > Workers > `boite-mail` > **Logs** ; GitHub > Actions > « Inès — boîte mail ».

## Fichiers
- `workers/boite-mail/` : le Worker de réception (Cloudflare).
- `agents/boite.ts` : Inès (tri, décision, envoi) ; `agents/lib/boite.ts` : garde-fous ; `agents/lib/redaction-reponse.ts` : consignes données à Claude.
- `.github/workflows/agent-boite.yml` : lancement (à l'arrivée d'un e-mail, depuis /boite, et toutes les 2 heures de 8 h à 20 h).
- `app/(dashboard)/boite/page.tsx` : la boîte mail ; `app/(dashboard)/ines/page.tsx` : la page d'Inès ;
  `app/boite-actions.ts` : leurs boutons ; `lib/mail.ts` : petits outils communs.
- `supabase/migrations/20261027000000_boite_mail.sql` : table `mailbox_messages`, réglages, nettoyage (`public.nettoyer_boite()`).
