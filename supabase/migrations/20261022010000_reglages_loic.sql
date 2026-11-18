-- =====================================================================
-- Devanture — réglages de Loïc, l'agent de prospection
-- À exécuter APRÈS 20261022000000_prospection.sql, dans Supabase > SQL Editor.
-- Une ligne par agent ; la page « Loïc » du tableau de bord la modifie,
-- l'agent la lit à chaque lancement. Ne contient aucun secret.
-- =====================================================================

create table if not exists public.agent_settings (
  agent            text primary key
                   check (agent in ('orchestrateur', 'prospection', 'site_demo', 'email', 'site_production')),
  display_name     text not null check (char_length(display_name) between 1 and 40),
  -- Interrupteur général : false = l'agent refuse de travailler, même lancé à la main.
  enabled          boolean not null default true,
  -- Lancement automatique (2 vagues par jour, 7 jours sur 7), avec les réglages ci-dessous.
  auto_enabled     boolean not null default false,
  -- Métiers prospectés en automatique (un par jour, à tour de rôle).
  metiers          text[] not null default array['plombier', 'electricien', 'couvreur'],
  default_limit    integer not null default 20 check (default_limit between 1 and 100),
  -- Plafonds Google : jamais au-dessus de 200 par jour et 900 par mois (limites dures dans le code).
  max_google_day   integer not null default 200 check (max_google_day between 0 and 200),
  max_google_month integer not null default 900 check (max_google_month between 0 and 900),
  -- Seuils de score : au-dessus = qualifié (si e-mail), en dessous = écarté.
  score_qualified  integer not null default 60 check (score_qualified between 0 and 100),
  score_discarded  integer not null default 40 check (score_discarded between 0 and 100),
  -- Consignes ajoutées à celles de Claude (ex. : « sois plus sévère avec les artisans sans avis »).
  instructions     text check (instructions is null or char_length(instructions) <= 1500),
  updated_at       timestamptz not null default now(),
  check (score_discarded <= score_qualified)
);

insert into public.agent_settings (agent, display_name)
values ('prospection', 'Loïc')
on conflict (agent) do nothing;

drop trigger if exists trg_agent_settings_updated on public.agent_settings;
create trigger trg_agent_settings_updated before update on public.agent_settings
  for each row execute function public.set_updated_at();

alter table public.agent_settings enable row level security;
drop policy if exists "admins_agent_settings_lecture" on public.agent_settings;
create policy "admins_agent_settings_lecture" on public.agent_settings for select to authenticated
  using ((select public.is_admin()));
drop policy if exists "admins_agent_settings_modif" on public.agent_settings;
create policy "admins_agent_settings_modif" on public.agent_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.agent_settings from anon;
grant select, update on public.agent_settings to authenticated;
