-- =====================================================================
-- Devanture — Coco, l'agente superviseuse (30/10)
-- Coco relit, d'un œil extérieur, les e-mails et relances de Valérie « à valider ».
-- Pilote automatique : ceux qui sont propres passent « validés » (ils partent ensuite dans le quota, comme
-- avant) ; ceux qui posent problème restent « à valider » avec son avis, pour Broise (page /coco).
-- Elle fait aussi un bilan quotidien avec des alertes. Elle ne touche jamais aux réponses d'Inès
-- ni aux liens de paiement.
-- Appliquée par le workflow « Appliquer une migration ». Ne supprime aucune donnée.
-- =====================================================================

-- 1. Coco est un agent : nouveau nom autorisé ---------------------------------------------------------
alter table public.tasks drop constraint if exists tasks_agent_check;
alter table public.tasks add constraint tasks_agent_check
  check (agent in ('orchestrateur', 'prospection', 'site_demo', 'email', 'site_production', 'boite', 'paiements', 'coco'));
alter table public.agent_settings drop constraint if exists agent_settings_agent_check;
alter table public.agent_settings add constraint agent_settings_agent_check
  check (agent in ('orchestrateur', 'prospection', 'site_demo', 'email', 'site_production', 'boite', 'paiements', 'coco'));

-- enabled = pilote automatique (Coco valide seule ce qui est propre). En pause : elle ne valide plus rien.
insert into public.agent_settings (agent, display_name, enabled)
values ('coco', 'Coco', true)
on conflict (agent) do nothing;

-- 2. Son avis sur chaque e-mail --------------------------------------------------------------------
--    ok = validé tel quel · corrige = corrigé puis validé · garde = laissé à Broise (raison dans coco_avis)
alter table public.emails add column if not exists coco_verdict text;
alter table public.emails drop constraint if exists emails_coco_verdict_check;
alter table public.emails add constraint emails_coco_verdict_check
  check (coco_verdict is null or coco_verdict in ('ok', 'corrige', 'garde'));
alter table public.emails add column if not exists coco_avis text check (coco_avis is null or char_length(coco_avis) <= 1000);
alter table public.emails add column if not exists coco_le timestamptz;
create index if not exists emails_coco_idx on public.emails (coco_verdict, coco_le) where status = 'a_valider';

-- Un e-mail dont le texte change (Valérie le réécrit, Broise le corrige) doit être relu de nouveau par Coco.
-- Sa propre correction met à jour coco_le en même temps : dans ce cas, son avis est gardé.
create or replace function public.coco_relire_si_modifie()
returns trigger language plpgsql set search_path = public as $$
begin
  if (new.subject is distinct from old.subject or new.body is distinct from old.body)
     and new.coco_le is not distinct from old.coco_le then
    new.coco_verdict := null;
    new.coco_avis := null;
    new.coco_le := null;
  end if;
  return new;
end $$;
drop trigger if exists emails_coco_relire on public.emails;
create trigger emails_coco_relire before update on public.emails
  for each row execute function public.coco_relire_si_modifie();

-- 3. Ses bilans quotidiens -------------------------------------------------------------------------
create table if not exists public.coco_rapports (
  id          uuid primary key default gen_random_uuid(),
  jour        date not null unique,
  chiffres    jsonb not null default '{}'::jsonb,
  -- [{ niveau: 'urgent' | 'attention' | 'info', texte, lien }]
  alertes     jsonb not null default '[]'::jsonb,
  resume      text,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.coco_rapports enable row level security;
drop policy if exists "admins_coco_rapports" on public.coco_rapports;
create policy "admins_coco_rapports" on public.coco_rapports for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.coco_rapports from anon;
grant select, insert, update, delete on public.coco_rapports to authenticated;
grant select, insert, update, delete on public.coco_rapports to service_role;
