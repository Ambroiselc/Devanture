# Loïc, l'agent de prospection (phase 2)

Il prépare une liste d'artisans du bâtiment et du jardin de la **métropole lilloise** à contacter.
**Il n'envoie rien à personne** : tu valides.

**Zone et métiers (depuis le 22/10)** : 11 métiers (plombier-chauffagiste, électricien, couvreur, peintre,
menuisier, serrurier, maçon, carreleur, plaquiste-plâtrier, climatisation et pompe à chaleur, paysagiste)
et, pour commencer, les 10 communes les plus peuplées de la métropole lilloise (Lille, Tourcoing,
Roubaix, Villeneuve-d'Ascq, Wattrelos, Marcq-en-Barœul, Lambersart, Armentières, Loos, La Madeleine) ;
les 35 autres communes de 5 000 habitants et plus attendent dans `COMMUNES_PLUS_TARD`. Les deux listes sont dans `agents/lib/metiers.ts` ; la zone et les codes postaux de
chaque commune sont lus à chaque lancement sur geo.api.gouv.fr.

## Sa page dans le tableau de bord (menu « Loïc »)

- **Statut** : prêt, au travail (la page se met à jour toute seule), en pause.
- **Lancer Loïc** : « Lancer sur ce métier » (un métier dans une commune) ou « Tournée de 5 métiers »
  (Loïc choisit lui-même 5 couples métier + commune). Le nombre de fiches est un multiple de 5 : en
  tournée il se partage entre les 5 métiers (20 = 4 chacun). Demande une clé GitHub
  dans `.env.local` (voir plus bas) ; sinon, le lancer depuis GitHub > Actions.
- **Chiffres clés** : prospects retenus, part avec e-mail, qualifiés, coût IA du mois.
- **Limites du moment** : fiches Google lues du jour et du mois (les recherches, gratuites, ne comptent pas).
- **Derniers lancements** : bilan de chacun, arrêts et erreurs.
- **Réglages**, appliqués dès le lancement suivant :
  nom, actif / en pause, lancement automatique (2 vagues par jour, 7 jours sur 7, vers 8 h et 14 h ; depuis le 27/10,
  chacune commence par la liste officielle RGE, puis, s'il manque des fiches, une tournée Google de 5 métiers :
  d'abord les couples métier + commune jamais faits, grandes communes en premier, puis les plus anciens ;
  un couple « épuisé » est mis de côté 30 jours), métiers et communes cochés (côté Google),
  nombre de fiches par lancement (multiple de 5), plafonds Google (200/jour et 900/mois au
  maximum), seuils de score « qualifié » et « écarté », consignes ajoutées à celles de Claude.

Les réglages vivent dans la table `agent_settings` (migrations `20261022010000_reglages_loic.sql` et
`20261022020000_loic_communes.sql`).

### Clé GitHub pour le bouton « Lancer »

GitHub > Settings > Developer settings > Personal access tokens > **Fine-grained tokens** >
Generate new token : dépôt **Devanture** uniquement, permission **Actions : Read and write**, expiration
au choix. La coller dans `.env.local` : `GITHUB_ACTIONS_TOKEN=…`, puis relancer l'application.
Cette clé ne peut que lancer et lire les workflows de ce dépôt.

## Comment il cherche (méthode « Google d'abord », depuis le 22/10)

La première méthode partait de l'annuaire : 58 entreprises examinées, 3 retenues, car la plupart des
entreprises de l'annuaire n'ont aucune présence sur Google (sous-traitants, entreprises en sommeil…).
Loïc part donc maintenant des artisans **visibles sur Google** :

1. **Recherches Google** par métier, limitées à la zone de la commune : « plombier Tourcoing »,
   « chauffagiste Tourcoing », « dépannage plomberie Tourcoing »… (2 ou 3 recherches par métier, voir
   `metiers.ts`). **Une requête = 20 fiches**, 3 pages au plus par recherche.
   - Les fiches déjà connues (même identifiant Google) sont sautées sans rien coûter de plus.
   - Les fiches hors de la commune (codes postaux de la commune) sont ignorées.
   - Les fiches fermées selon Google sont écartées sans être notées.
2. **Annuaire officiel des entreprises** (gratuit) : recherche par nom dans la commune, puis par nom
   raccourci (« Plomberie Dupont » → « Dupont », car un auto-entrepreneur est souvent enregistré à son nom).
   Seuls les établissements actifs du bâtiment (codes NAF 43.xx) ou du métier visé (ex. 81.30Z pour
   les paysagistes) sont proposés.
   Les entreprises « non diffusibles » (qui ont refusé la diffusion de leurs infos) sont écartées.
3. **Visite du site** (s'il existe) : accueil + au plus 2 pages (contact, mentions légales) pour juger
   son âge et trouver l'e-mail. Seules les adresses du domaine de l'artisan ou d'une messagerie grand
   public (Gmail, Orange…) sont gardées : l'adresse de l'agence qui a fait le site est ignorée.
4. **Claude Haiku 5.5** dit si c'est bien un artisan du métier (pas un magasin), quelle entreprise de
   l'annuaire c'est, juge le site et donne un score sur 100 avec une phrase. Environ 0,0001 € par fiche.
5. **Enregistrement** dans `prospects` (seul l'identifiant Google est gardé de Google ; nom commercial
   public, adresse et SIRET viennent de l'annuaire quand il est retrouvé) :
   - **Qualifié** : score ≥ seuil « qualifié » et e-mail trouvé → prêt pour une démo.
   - **Nouveau** : intéressant mais sans e-mail (ou score moyen).
   - **Écarté** : score sous le seuil « écarté », pas un artisan du métier, fermé ou non diffusible
     (l'e-mail n'est pas gardé).
   - **Refusé** : l'adresse est sur la liste d'opposition.
   Un artisan écarté par l'ancienne méthode et retrouvé sur Google est mis à jour.

Quand tous les artisans visibles d'un métier sont déjà connus, Loïc le dit (« Plus de nouveaux
artisans ») : il faudra alors élargir à d'autres communes.

## Garde-fous

| Garde-fou | Valeur |
|---|---|
| Pause | Décocher « Actif » sur la page Loïc : il refuse tout lancement |
| Budget IA du mois (`ai_budget_status`) | Arrêt dès qu'il est atteint |
| Fiches Google lues par jour | Réglable, 200 au maximum (décision du 22/10) |
| Fiches Google lues par mois | Réglable, 900 au maximum, sous les 1 000 gratuites de « Place Details Enterprise » (grille Google, à revérifier). Depuis le 26/10, les recherches ne demandent que les identifiants (gratuites, illimitées) : seule la fiche d'un artisan jamais vu est lue. |
| Entreprises par lancement | 100 au maximum |
| Un seul lancement à la fois | Le bouton est bloqué pendant qu'il travaille |
| Erreurs | Arrêt après 3 erreurs de suite |
| Liste d'opposition | Vérifiée pour chaque e-mail trouvé |

Chaque lancement crée une tâche (page **Tâches**) avec son bilan, ses tokens et son journal ; chaque note
de Claude est comptée dans `costs`.

## Lancer un test (phase 2)

1. **Une seule fois** : Supabase > SQL Editor > coller et lancer
   `supabase/migrations/20261022000000_prospection.sql`, puis `20261022010000_reglages_loic.sql`,
   puis `20261022020000_loic_communes.sql`.
2. Page **Loïc** du tableau de bord > **Lancer Loïc** (ou GitHub > Actions > **Loïc — agent de
   prospection** > Run workflow) : métier plombier, 20 entreprises (puis 50 quand tout va bien).
3. Lire le résumé sous l'exécution (part d'entreprises avec un e-mail), puis la page **Prospects**.
4. Comparer les scores à ton propre avis sur une vingtaine d'artisans. Si un score te paraît faux,
   note pourquoi : on ajustera les consignes données à Claude (`agents/lib/haiku.ts`).

## Tester sans Internet ni clés

```bash
DEVANTURE_SIMULATION=1 SUPABASE_DB_URL=postgres://… GOOGLE_PLACES_API_KEY=x ANTHROPIC_API_KEY=x \
  node agents/prospection.ts --metier plombier --limite 10
```

Les réponses viennent de `agents/lib/fake.ts` (entreprises fictives) et tout est enregistré avec
`is_demo = true`. **À ne faire que sur une base de test**, jamais sur la vraie base.

## Ajouter une commune ou un métier

`agents/lib/metiers.ts` : ajouter la commune (code INSEE + nom, dans `LISTE_COMMUNES`) ou le métier
(recherches Google + codes NAF). Le métier doit aussi être ajouté à la liste `options` du workflow
`.github/workflows/agent-prospection.yml` pour pouvoir le lancer depuis GitHub.
