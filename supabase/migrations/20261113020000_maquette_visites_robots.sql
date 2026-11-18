-- 13/11 : ouvertures de maquettes retirées parce qu'elles venaient de robots (Microsoft 365 qui vérifie les liens des
-- e-mails, agents/retirer-robots-maquettes.ts). Rien n'est effacé pour de bon : les visites retirées et le nombre
-- d'ouvertures enlevé au compteur sont gardés ici, pour pouvoir les remettre si on s'est trompé.
create table if not exists public.maquette_visites_robots (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references public.websites(id) on delete cascade,
  retire_le timestamptz not null default now(),
  moment timestamptz not null,
  reseau text,
  vues_retirees integer not null default 0,
  visites jsonb not null default '[]'::jsonb
);
alter table public.maquette_visites_robots enable row level security;
revoke all on public.maquette_visites_robots from anon;
grant select, delete on public.maquette_visites_robots to authenticated;
grant select, insert, update, delete on public.maquette_visites_robots to service_role;
drop policy if exists maquette_visites_robots_admin on public.maquette_visites_robots;
create policy maquette_visites_robots_admin on public.maquette_visites_robots for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
