-- =====================================================================
-- Devanture — agent de prospection (phase 2)
-- À exécuter APRÈS les deux migrations précédentes, dans Supabase > SQL Editor.
-- Ajoute aux prospects ce que l'agent de prospection remplit.
-- Ne contient aucun secret.
-- =====================================================================

alter table public.prospects
  -- Numéro SIRET de l'établissement (annuaire officiel des entreprises) : évite les doublons.
  add column if not exists siret            text,
  -- Code d'activité NAF, ex : 43.22A pour la plomberie.
  add column if not exists naf_code         text,
  -- Identifiant Google du lieu. C'est la SEULE donnée Google qu'on a le droit de conserver.
  add column if not exists google_place_id  text,
  -- Qualité du site actuel, estimée par l'agent.
  add column if not exists website_quality  text,
  -- Page où l'adresse e-mail a été trouvée (pour pouvoir dire d'où elle vient).
  add column if not exists email_source     text,
  -- Pourquoi ce score (une phrase écrite par l'agent).
  add column if not exists score_reason     text,
  -- Dernière vérification par l'agent.
  add column if not exists last_checked_at  timestamptz;

alter table public.prospects drop constraint if exists prospects_website_quality_check;
alter table public.prospects add constraint prospects_website_quality_check
  check (website_quality is null
         or website_quality in ('aucun', 'reseau_social', 'date', 'correct', 'moderne'));

alter table public.prospects drop constraint if exists prospects_siret_check;
alter table public.prospects add constraint prospects_siret_check
  check (siret is null or siret ~ '^[0-9]{14}$');

-- Un même établissement ou une même fiche Google ne peut être enregistré qu'une fois.
create unique index if not exists prospects_siret_unique
  on public.prospects (siret) where siret is not null;
create unique index if not exists prospects_google_place_unique
  on public.prospects (google_place_id) where google_place_id is not null;

-- Les tâches de prospection sont recherchées par agent et par date (compteur de requêtes Google).
create index if not exists tasks_agent_started_idx on public.tasks (agent, started_at);
