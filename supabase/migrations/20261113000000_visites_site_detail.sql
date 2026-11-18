-- 13/11 : détail de chaque visite du site vitrine (devanture-artisans.fr), demandé par Broise pour comprendre
-- « qui » sont les visites : heure, durée, pages vues, provenance, type d'appareil, système et navigateur.
-- Toujours aucune adresse IP, aucun cookie, aucun identifiant gardé dans le navigateur : le petit script du site tire
-- un numéro de visite au hasard à chaque chargement (comme pour les maquettes depuis le 5/11).
-- Les compteurs par jour (site_visites) restent tenus à jour par la même fonction.

create table if not exists public.site_visites_detail (
  id uuid primary key default gen_random_uuid(),
  visite text not null unique,
  debut timestamptz not null default now(),
  fin timestamptz not null default now(),
  duree_s integer check (duree_s is null or duree_s between 0 and 7200),
  page text not null default '/',
  pages text[] not null default '{}',
  source text not null,
  appareil text check (appareil in ('telephone', 'tablette', 'ordinateur')),
  systeme text,
  navigateur text,
  retrouvee boolean not null default false
);
create index if not exists site_visites_detail_debut on public.site_visites_detail (debut desc);

alter table public.site_visites_detail enable row level security;
revoke all on public.site_visites_detail from anon;
grant select, delete on public.site_visites_detail to authenticated;
grant select, insert, update, delete on public.site_visites_detail to service_role;
drop policy if exists site_visites_detail_admin on public.site_visites_detail;
create policy site_visites_detail_admin on public.site_visites_detail for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Appelée sans connexion par /api/visite. 1er appel d'une visite (source connue) : crée la ligne et ajoute 1 au compteur
-- du jour. Appels suivants (toutes les 15 s, au changement de page, en quittant) : allongent la durée et ajoutent la page,
-- jamais plus de 3 h après le début. Une visite inconnue sans source (navigation interne) est ignorée.
create or replace function public.site_visite(p_visite text, p_page text, p_source text, p_duree integer,
  p_appareil text, p_systeme text, p_navigateur text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_page text := left(coalesce(nullif(regexp_replace(lower(coalesce(p_page, '/')), '[^a-z0-9/_-]', '', 'g'), ''), '/'), 80);
  v_source text := left(nullif(regexp_replace(lower(coalesce(p_source, '')), '[^[:alnum:] ._()-]', '', 'g'), ''), 60);
  v_duree integer := least(greatest(coalesce(p_duree, 0), 0), 7200);
  v_existe boolean;
begin
  if coalesce(p_visite, '') !~ '^[a-z0-9]{8,32}$' then return; end if;
  select true into v_existe from public.site_visites_detail where visite = p_visite;
  if coalesce(v_existe, false) then
    update public.site_visites_detail
       set duree_s = greatest(coalesce(duree_s, 0), v_duree), fin = now(),
           pages = case when v_page = any(pages) or cardinality(pages) >= 20 then pages else pages || v_page end
     where visite = p_visite and debut > now() - interval '3 hours';
    return;
  end if;
  if v_source is null then return; end if;
  insert into public.site_visites_detail (visite, duree_s, page, pages, source, appareil, systeme, navigateur)
  values (p_visite, v_duree, v_page, array[v_page], v_source,
          case when p_appareil in ('telephone', 'tablette', 'ordinateur') then p_appareil end,
          left(nullif(regexp_replace(coalesce(p_systeme, ''), '[^[:alnum:] ._-]', '', 'g'), ''), 30),
          left(nullif(regexp_replace(coalesce(p_navigateur, ''), '[^[:alnum:] ._-]', '', 'g'), ''), 30))
  on conflict (visite) do nothing;
  insert into public.site_visites as s (jour, page, source, visites)
  values ((now() at time zone 'Europe/Paris')::date, v_page, v_source, 1)
  on conflict (jour, page, source) do update set visites = s.visites + 1;
end $$;
revoke all on function public.site_visite(text, text, text, integer, text, text, text) from public;
grant execute on function public.site_visite(text, text, text, integer, text, text, text) to anon, authenticated;
