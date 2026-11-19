-- 19/11 (demande de Broise) : pour chaque ouverture de maquette, les mêmes indices que pour le site vitrine :
-- système et navigateur (familles seulement, lus dans le User-Agent), opérateur réseau, pays et ville approximative
-- (lus par Cloudflare au moment de la visite). JAMAIS l'adresse IP, aucun cookie.
alter table public.maquette_visites add column if not exists systeme text;
alter table public.maquette_visites add column if not exists navigateur text;
alter table public.maquette_visites add column if not exists reseau text;
alter table public.maquette_visites add column if not exists pays text;
alter table public.maquette_visites add column if not exists ville text;

create or replace function public.maquette_visite(p_slug text, p_visite text, p_duree integer, p_appareil text,
  p_systeme text, p_navigateur text, p_reseau text, p_pays text, p_ville text)
returns void language sql security definer set search_path = public as $$
  insert into public.maquette_visites (website_id, visite, duree_s, appareil, systeme, navigateur, reseau, pays, ville)
  select w.id, p_visite, least(greatest(coalesce(p_duree, 0), 0), 7200),
         case when p_appareil in ('telephone', 'ordinateur') then p_appareil end,
         left(nullif(regexp_replace(coalesce(p_systeme, ''), '[^[:alnum:] ._-]', '', 'g'), ''), 30),
         left(nullif(regexp_replace(coalesce(p_navigateur, ''), '[^[:alnum:] ._-]', '', 'g'), ''), 30),
         left(nullif(regexp_replace(coalesce(p_reseau, ''), '[^[:alnum:] ._,()&''-]', '', 'g'), ''), 60),
         left(nullif(regexp_replace(upper(coalesce(p_pays, '')), '[^A-Z]', '', 'g'), ''), 2),
         left(nullif(regexp_replace(coalesce(p_ville, ''), '[^[:alnum:] ._''-]', '', 'g'), ''), 60)
    from public.websites w
   where w.slug = p_slug and w.kind = 'demo' and length(p_slug) between 3 and 120
     and p_visite ~ '^[a-z0-9]{8,32}$'
  on conflict (website_id, visite) do update
     set duree_s = greatest(public.maquette_visites.duree_s, excluded.duree_s), fin = now(),
         systeme = coalesce(public.maquette_visites.systeme, excluded.systeme),
         navigateur = coalesce(public.maquette_visites.navigateur, excluded.navigateur),
         reseau = coalesce(public.maquette_visites.reseau, excluded.reseau),
         pays = coalesce(public.maquette_visites.pays, excluded.pays),
         ville = coalesce(public.maquette_visites.ville, excluded.ville)
   where public.maquette_visites.debut > now() - interval '3 hours'
$$;
revoke all on function public.maquette_visite(text, text, integer, text, text, text, text, text, text) from public;
grant execute on function public.maquette_visite(text, text, integer, text, text, text, text, text, text) to anon, authenticated;
