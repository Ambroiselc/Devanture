# Sauvegardes de la base Supabase

Le plan gratuit de Supabase ne garde **aucune sauvegarde téléchargeable**. Si la base est effacée par erreur
(ou si le projet est mis en pause trop longtemps), tout est perdu. D'où une sauvegarde automatique,
gratuite, chaque semaine, faite par GitHub.

**Comment ça marche** : le fichier `.github/workflows/sauvegarde-supabase.yml` (déjà en place) demande à GitHub, chaque lundi
vers 4 h, de copier la base (structure + données) et d'en faire une archive. L'archive reste 90 jours dans
GitHub puis s'efface seule. Rien n'est ajouté au code.

---

## À faire une seule fois (5 minutes)

> Prérequis : le code est sur GitHub, dans un dépôt **privé** (README, étape C).
> Les sauvegardes contiennent les coordonnées des prospects : un dépôt public serait une fuite de données.

1. **Récupérer l'adresse de la base**
   Supabase → ton projet → bouton **Connect** (en haut) → onglet **Connection string** →
   choisis **Session pooler** (pas « Direct connection » : GitHub ne sait pas la joindre).
   Copie l'adresse : elle ressemble à
   `postgresql://postgres.abcdefghijkl:[YOUR-PASSWORD]@aws-0-eu-west-3.pooler.supabase.com:5432/postgres`
2. Remplace `[YOUR-PASSWORD]` par le **mot de passe de la base** (celui choisi à la création du projet ;
   oublié ? Project Settings → Database → **Reset database password**).
3. **Donner l'adresse à GitHub, en secret**
   GitHub → ton dépôt → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
   - Name : `SUPABASE_DB_URL`
   - Secret : l'adresse complète de l'étape 2
   - **Add secret**
4. **Tester tout de suite**
   GitHub → onglet **Actions** → « Sauvegarde Supabase » (à gauche) → **Run workflow** → **Run workflow**.
   Au bout de 1 à 2 minutes, une coche verte ✅ apparaît. Clique dessus : en bas, dans **Artifacts**,
   il y a l'archive `supabase-…`.

Si c'est une croix rouge ❌ : clique dessus pour lire l'erreur. Les deux causes habituelles :
- « secret SUPABASE_DB_URL manque » → étape 3 ;
- « password authentication failed » ou « could not connect » → mauvais mot de passe, ou adresse
  « Direct connection » au lieu de « Session pooler ».

## Contrôle mensuel (2 minutes)

Une fois par mois, regarde l'onglet **Actions** : les 4 dernières exécutions doivent être vertes.
GitHub t'envoie aussi un e-mail quand une exécution échoue.

## Restaurer une sauvegarde (en cas de pépin)

1. Télécharge l'archive dans **Actions** → l'exécution voulue → **Artifacts**, puis décompresse-la :
   tu obtiens `roles.sql.gz`, `schema.sql.gz`, `data.sql.gz` (à décompresser aussi, avec 7-Zip par exemple).
2. Le plus sûr : créer un **nouveau projet Supabase** vide, puis lui appliquer les fichiers dans l'ordre
   `roles.sql`, `schema.sql`, `data.sql` avec l'outil `psql`
   (`psql "ADRESSE_DU_NOUVEAU_PROJET" -f roles.sql`, et ainsi de suite).
3. Change ensuite les clés dans `.env.local` (et sur l'hébergeur) pour pointer vers le nouveau projet.

Restaurer n'arrive presque jamais : si ça arrive, demande de l'aide à Claude avec le message d'erreur exact.
