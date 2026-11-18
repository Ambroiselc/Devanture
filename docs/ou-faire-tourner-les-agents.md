# Où faire tourner les agents (et le reste) — recommandation

Décision à prendre avant la phase 2. Résumé : **pas de serveur à louer**.

## Ce que les agents vont faire

| Agent | Quand | Durée d'un passage |
|---|---|---|
| Prospection (Google Places → prospects) | 1 fois par jour | 1 à 3 min |
| Maquette (Claude écrit la démo) | après la prospection | 1 à 2 min **par commerce** |
| Rédaction des e-mails (brouillons à valider) | après les maquettes | quelques secondes par e-mail |
| Lien de désinscription, réponses, paiements | à tout moment (un clic, un webhook) | moins d'1 seconde |

Deux familles donc : des **travaux par lots**, longs mais pas urgents, et de **petites réactions immédiates**.

## Recommandation

**1. Travaux par lots → GitHub Actions (planifié)**
Même mécanisme que la sauvegarde : un fichier `.github/workflows/agents.yml` lance un script chaque matin.
- Gratuit : 2 000 minutes par mois sur un dépôt privé. Avec ~10 à 50 commerces par jour, on reste vers 300 à 900 min/mois.
- Pas de limite de durée gênante (jusqu'à 6 h par exécution), alors qu'une maquette peut prendre 1 à 2 min.
- Les clés (Claude, Google, Supabase secrète) vont dans les secrets GitHub, jamais dans le code.
- Les journaux de chaque exécution sont lisibles dans l'onglet Actions ; les résultats vont dans les tables `tasks`, `task_events` et `costs` déjà prêtes.
- Limite : l'heure de lancement peut glisser de quelques minutes, sans conséquence ici.

**2. Petites réactions immédiates → des routes de l'application elle-même**
Lien « ne plus recevoir d'e-mails », retour de Resend (réponse, rebond), paiement Stripe : ce sont des
« route handlers » Next.js (comme `/auth/confirm`), hébergés avec le tableau de bord. Rien de plus à gérer.

**Pourquoi pas les alternatives**
- *Supabase Edge Functions* : limitées à 150 secondes en plan gratuit — trop juste pour générer plusieurs maquettes d'affilée. Utiles plus tard pour de petites tâches.
- *Un petit serveur (VPS)* : 4 à 6 €/mois, mais il faut le mettre à jour, le sécuriser, le surveiller. Inutile à ce volume.

## Hébergement : Cloudflare (décidé le 21/10/2026)

Le plan gratuit de **Vercel (Hobby) est réservé à un usage personnel, non commercial** (conditions de Vercel),
alors que Devanture est une activité commerciale. On passe donc sur **Cloudflare, plan gratuit**, où l'usage
commercial est autorisé.

| Quoi | Où | Comment |
|---|---|---|
| Site vitrine devanture.fr | Cloudflare Pages | Export statique, prêt depuis le 21/10 (README de `devanture-site`) |
| Sites des clients et démos | Cloudflare Pages | Pages statiques, un projet par client (phases 3 et 6) |
| Tableau de bord (cette appli) | Cloudflare Workers, plus tard | Reste sur ton PC pour l'instant ; mise en ligne en phase 7 avec l'adaptateur officiel « OpenNext » |
| Agents | GitHub Actions | Voir plus haut |

Le nom de domaine `.fr` s'achète chez un registrar français (Cloudflare ne vend pas les `.fr`), puis ses DNS
sont confiés à Cloudflare (gratuit).

## Ce qu'il te faudra (phase 2)

- Clé API Claude (console.anthropic.com) **avec une limite de dépense** (ex. 20 €/mois) — c'est la vraie barrière.
- Clé API Google Places avec un **quota journalier** plafonné dans Google Cloud.
- Ces clés ajoutées dans GitHub → Settings → Secrets and variables → Actions.

## Sources
- Vercel, [Hobby Plan](https://vercel.com/docs/plans/hobby) et [Fair use guidelines](https://vercel.com/docs/limits/fair-use-guidelines)
- Supabase, [Edge Functions limits](https://supabase.com/docs/guides/functions/limits)
- GitHub, [Billing for GitHub Actions](https://docs.github.com/billing/managing-billing-for-github-actions/about-billing-for-github-actions)
