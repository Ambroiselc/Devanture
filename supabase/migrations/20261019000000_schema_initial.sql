-- =====================================================================
-- Devanture — schéma initial (V1)
-- À exécuter UNE fois dans Supabase : Dashboard > SQL Editor > New query
-- Ce fichier crée les tables, les relations, la sécurité (RLS) et les vues.
-- Il ne contient AUCUN secret.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Fonction utilitaire : met à jour automatiquement "updated_at"
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. Administrateurs : qui a le droit d'utiliser le tableau de bord
-- ---------------------------------------------------------------------
create table public.app_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Renvoie true si l'utilisateur connecté est administrateur.
-- "security definer" lui permet de lire app_admins sans boucle RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_admins where user_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------
-- 2. Campagnes de prospection
-- ---------------------------------------------------------------------
create table public.campaigns (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  description     text,
  status          text not null default 'brouillon'
                  check (status in ('brouillon', 'planifiee', 'en_cours', 'en_pause', 'terminee', 'annulee')),
  target_city     text,
  target_category text,
  budget_eur      numeric(10, 2) check (budget_eur is null or budget_eur >= 0),
  started_at      timestamptz,
  ended_at        timestamptz,
  is_demo         boolean not null default false,  -- true = donnée fictive de test
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Prospects (commerces repérés)
-- ---------------------------------------------------------------------
create table public.prospects (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid references public.campaigns (id) on delete set null,
  name              text not null,
  category          text,                -- ex : boulangerie, coiffeur…
  address           text,
  city              text,
  postal_code       text,
  phone             text,
  email             text,
  current_website   text,                -- site existant éventuel
  has_website       boolean not null default false,
  source            text,                -- d'où vient le prospect (manuel, Google Maps…)
  score             integer check (score between 0 and 100),  -- intérêt estimé
  status            text not null default 'nouveau'
                    check (status in ('nouveau', 'qualifie', 'demo_prete', 'contacte',
                                      'interesse', 'client', 'refuse', 'ecarte')),
  notes             text,
  is_demo           boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. Sites web (démonstration ou définitif), toujours liés à un prospect
-- ---------------------------------------------------------------------
create table public.websites (
  id            uuid primary key default gen_random_uuid(),
  prospect_id   uuid not null references public.prospects (id) on delete cascade,
  kind          text not null check (kind in ('demo', 'production')),
  status        text not null default 'brouillon'
                check (status in ('brouillon', 'en_generation', 'pret', 'publie', 'archive', 'erreur')),
  template      text,
  url           text,
  published_at  timestamptz,
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. E-mails commerciaux (brouillons uniquement en V1 : rien n'est envoyé)
-- ---------------------------------------------------------------------
create table public.emails (
  id           uuid primary key default gen_random_uuid(),
  prospect_id  uuid not null references public.prospects (id) on delete cascade,
  campaign_id  uuid references public.campaigns (id) on delete set null,
  website_id   uuid references public.websites (id) on delete set null,
  subject      text not null,
  body         text not null,
  status       text not null default 'brouillon'
               check (status in ('brouillon', 'a_valider', 'valide', 'envoye', 'repondu', 'erreur')),
  sent_at      timestamptz,
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. Tâches : chaque travail confié à un agent
-- ---------------------------------------------------------------------
create table public.tasks (
  id              uuid primary key default gen_random_uuid(),
  agent           text not null
                  check (agent in ('orchestrateur', 'prospection', 'site_demo', 'email', 'site_production')),
  title           text not null,
  status          text not null default 'en_attente'
                  check (status in ('en_attente', 'en_cours', 'terminee', 'echouee', 'annulee')),
  priority        integer not null default 5 check (priority between 1 and 10),
  parent_task_id  uuid references public.tasks (id) on delete set null,  -- tâche créée par l'orchestrateur
  campaign_id     uuid references public.campaigns (id) on delete set null,
  prospect_id     uuid references public.prospects (id) on delete set null,
  website_id      uuid references public.websites (id) on delete set null,
  input           jsonb not null default '{}'::jsonb,   -- ce que l'agent reçoit
  output          jsonb,                                 -- ce que l'agent produit
  attempts        integer not null default 0 check (attempts >= 0),
  max_attempts    integer not null default 3 check (max_attempts >= 1),
  error_message   text,                                  -- dernière erreur
  tokens_input    integer not null default 0 check (tokens_input >= 0),
  tokens_output   integer not null default 0 check (tokens_output >= 0),
  scheduled_at    timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz,
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (finished_at is null or started_at is null or finished_at >= started_at)
);

-- ---------------------------------------------------------------------
-- 7. Journal des tâches (infos, avertissements, erreurs)
-- ---------------------------------------------------------------------
create table public.task_events (
  id          bigint generated always as identity primary key,
  task_id     uuid not null references public.tasks (id) on delete cascade,
  level       text not null default 'info' check (level in ('info', 'warning', 'error')),
  message     text not null,
  details     jsonb,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 8. Coûts : chaque dépense (API Claude, recherche, hébergement, domaine…)
-- ---------------------------------------------------------------------
create table public.costs (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid references public.tasks (id) on delete set null,
  campaign_id  uuid references public.campaigns (id) on delete set null,
  provider     text not null,         -- ex : anthropic, supabase, vercel
  category     text not null default 'api'
               check (category in ('api', 'hebergement', 'domaine', 'email', 'autre')),
  amount_eur   numeric(10, 4) not null check (amount_eur >= 0),
  description  text,
  incurred_at  timestamptz not null default now(),
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 9. Index (accélèrent les recherches et les jointures)
-- ---------------------------------------------------------------------
create index on public.prospects (status);
create index on public.prospects (campaign_id);
create index on public.websites (prospect_id);
create index on public.emails (prospect_id);
create index on public.emails (campaign_id);
create index on public.emails (website_id);
create index on public.tasks (status, scheduled_at);
create index on public.tasks (parent_task_id);
create index on public.tasks (campaign_id);
create index on public.tasks (prospect_id);
create index on public.tasks (website_id);
create index on public.task_events (task_id, created_at);
create index on public.costs (task_id);
create index on public.costs (campaign_id);
create index on public.costs (incurred_at);

-- ---------------------------------------------------------------------
-- 10. Déclencheurs updated_at
-- ---------------------------------------------------------------------
create trigger trg_campaigns_updated before update on public.campaigns
  for each row execute function public.set_updated_at();
create trigger trg_prospects_updated before update on public.prospects
  for each row execute function public.set_updated_at();
create trigger trg_websites_updated before update on public.websites
  for each row execute function public.set_updated_at();
create trigger trg_emails_updated before update on public.emails
  for each row execute function public.set_updated_at();
create trigger trg_tasks_updated before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 11. Sécurité : Row Level Security (RLS)
--   • RLS activée partout → par défaut, personne ne voit rien.
--   • Seuls les administrateurs connectés (is_admin) ont accès.
--   • Le rôle "anon" (visiteur non connecté) n'a aucun droit.
--   • Les futurs agents utiliseront la clé secrète côté serveur
--     (elle contourne la RLS) : elle ne doit JAMAIS aller dans le navigateur.
-- ---------------------------------------------------------------------
alter table public.app_admins  enable row level security;
alter table public.campaigns   enable row level security;
alter table public.prospects   enable row level security;
alter table public.websites    enable row level security;
alter table public.emails      enable row level security;
alter table public.tasks       enable row level security;
alter table public.task_events enable row level security;
alter table public.costs       enable row level security;

-- app_admins : un utilisateur peut seulement vérifier sa propre ligne.
-- (On ajoute des admins depuis le SQL Editor, jamais depuis l'app.)
create policy "admins_lisent_leur_ligne" on public.app_admins
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Tables métier : accès complet pour les admins, rien pour les autres.
create policy "admins_campaigns"   on public.campaigns   for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins_prospects"   on public.prospects   for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins_websites"    on public.websites    for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins_emails"      on public.emails      for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins_tasks"       on public.tasks       for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins_task_events" on public.task_events for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins_costs"       on public.costs       for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Droits explicites : rien pour anon, le nécessaire pour authenticated.
revoke all on public.app_admins, public.campaigns, public.prospects, public.websites,
              public.emails, public.tasks, public.task_events, public.costs
  from anon;
grant select on public.app_admins to authenticated;
grant select, insert, update, delete on public.campaigns, public.prospects, public.websites,
      public.emails, public.tasks, public.task_events, public.costs
  to authenticated;
grant usage on all sequences in schema public to authenticated;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------
-- 12. Vue : coûts par jour (security_invoker → respecte la RLS)
-- ---------------------------------------------------------------------
create view public.daily_costs
with (security_invoker = true) as
select
  date_trunc('day', incurred_at)::date as day,
  sum(amount_eur)                      as total_eur,
  count(*)                             as entries
from public.costs
group by 1;

revoke all on public.daily_costs from anon;
grant select on public.daily_costs to authenticated;
