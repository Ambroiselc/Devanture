-- 5/11 : durée de chaque ouverture d'une maquette (/m/<slug>), demandée par Broise.
-- Le petit script de la maquette tire un identifiant de visite au hasard (aucun cookie, rien de gardé dans le navigateur),
-- compte le temps passé onglet visible, et l'envoie après 1,5 s, puis toutes les 15 s et quand l'artisan quitte la page.
-- Aucune adresse IP : seulement le type d'appareil (téléphone ou ordinateur), la date et la durée.
-- Les visites d'avant le 5/11 n'ont pas de durée (seul le compteur websites.vues existait).

create table if not exists public.maquette_visites (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references public.websites(id) on delete cascade,
  visite text not null,
  debut timestamptz not null default now(),
  fin timestamptz not null default now(),
  duree_s integer not null default 0 check (duree_s between 0 and 7200),
  appareil text check (appareil in ('telephone', 'ordinateur')),
  unique (website_id, visite)
);
create index if not exists maquette_visites_site_debut on public.maquette_visites (website_id, debut desc);

alter table public.maquette_visites enable row level security;
-- (6/11 : les droits de lecture du tableau de bord sont donnés par 20261106010000_visites_maquettes_droits.sql)
drop policy if exists maquette_visites_admin on public.maquette_visites;
create policy maquette_visites_admin on public.maquette_visites
  for all using (public.is_admin()) with check (public.is_admin());

-- Appelée sans connexion par la maquette publique : crée la visite ou allonge sa durée (jamais plus de 3 h après son début).
create or replace function public.maquette_visite(p_slug text, p_visite text, p_duree integer, p_appareil text)
returns void language sql security definer set search_path = public as $$
  insert into public.maquette_visites (website_id, visite, duree_s, appareil)
  select w.id, p_visite, least(greatest(coalesce(p_duree, 0), 0), 7200),
         case when p_appareil in ('telephone', 'ordinateur') then p_appareil end
    from public.websites w
   where w.slug = p_slug and w.kind = 'demo' and length(p_slug) between 3 and 120
     and p_visite ~ '^[a-z0-9]{8,32}$'
  on conflict (website_id, visite) do update
     set duree_s = greatest(public.maquette_visites.duree_s, excluded.duree_s), fin = now()
   where public.maquette_visites.debut > now() - interval '3 hours'
$$;
revoke all on function public.maquette_visite(text, text, integer, text) from public;
grant execute on function public.maquette_visite(text, text, integer, text) to anon, authenticated;
