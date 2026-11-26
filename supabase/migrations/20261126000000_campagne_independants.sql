-- 26/11 (demande de Broise) : tout ce qui concerne la nouvelle cible (photographes et coachs) tient dans UNE seule
-- campagne « Photographes et coachs ». Les recherches déjà faites (un couple métier + commune) sont notées dans une
-- petite table à part, pour que Loïc ne refasse jamais deux fois la même.
-- Rejouable sans dégât.

create table if not exists public.recherches_independants (
  metier       text not null,
  departement  text not null,
  commune      text not null,
  recherches   integer not null default 0,   -- requêtes Google (pages de 20 fiches)
  fiches       integer not null default 0,   -- nouvelles fiches lues
  qualifies    integer not null default 0,
  fait_le      timestamptz not null default now(),
  primary key (metier, departement, commune)
);

alter table public.recherches_independants enable row level security;
revoke all on public.recherches_independants from anon;
grant select on public.recherches_independants to authenticated;
grant select, insert, update, delete on public.recherches_independants to service_role;
drop policy if exists recherches_independants_admin on public.recherches_independants;
create policy recherches_independants_admin on public.recherches_independants for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

do $$
declare
  unique_id uuid;
begin
  -- La campagne unique (créée une seule fois).
  select id into unique_id from public.campaigns where name = 'Photographes et coachs' limit 1;
  if unique_id is null then
    insert into public.campaigns (name, description, status, target_category, started_at)
    values ('Photographes et coachs',
            'Nouvelle cible depuis le 26/11 : photographes et coachs sportifs du Nord et du Pas-de-Calais (puis 80, 02, 60), recherche Google par lot.',
            'en_cours', 'Photographe, Coach sportif', '2026-11-26 08:47:00+00')
    returning id into unique_id;
  end if;

  -- Les recherches déjà faites, lues dans le nom des anciennes campagnes « Indépendants · métier · commune (dép.) ».
  insert into public.recherches_independants (metier, departement, commune, fait_le)
  select split_part(name, ' · ', 2),
         substring(name from '\(([0-9AB]+)\)$'),
         regexp_replace(split_part(name, ' · ', 3), ' \([0-9AB]+\)$', ''),
         coalesce(started_at, created_at)
  from public.campaigns
  where name like 'Indépendants · % · %'
  on conflict do nothing;

  -- Tout passe dans la campagne unique, puis les anciennes campagnes sont supprimées.
  update public.prospects set campaign_id = unique_id where campaign_id in (select id from public.campaigns where name like 'Indépendants · %');
  update public.emails    set campaign_id = unique_id where campaign_id in (select id from public.campaigns where name like 'Indépendants · %');
  update public.tasks     set campaign_id = unique_id where campaign_id in (select id from public.campaigns where name like 'Indépendants · %');
  update public.costs     set campaign_id = unique_id where campaign_id in (select id from public.campaigns where name like 'Indépendants · %');
  delete from public.campaigns where name like 'Indépendants · %';
end $$;
