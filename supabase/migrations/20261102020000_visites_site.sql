-- 2/11 : visites du site vitrine (devanture-artisans.fr), comptées par jour, page d'arrivée et provenance.
-- Aucune donnée sur le visiteur : ni adresse IP, ni cookie, ni identifiant. Seulement des compteurs.
-- Les visites de Broise (connecté au tableau de bord) ne sont jamais envoyées ici (route /api/visite).
create table if not exists public.site_visites (
  jour date not null,
  page text not null,
  source text not null,
  visites integer not null default 0,
  primary key (jour, page, source)
);
alter table public.site_visites enable row level security;
revoke all on public.site_visites from anon;
grant select, insert, update, delete on public.site_visites to authenticated, service_role;
drop policy if exists site_visites_admin on public.site_visites;
create policy site_visites_admin on public.site_visites for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Appelée par la route publique /api/visite (clé publique) : ajoute 1 au compteur du jour.
create or replace function public.site_vue(p_page text, p_source text)
returns void language plpgsql security definer set search_path = public as $$
declare
  page text := left(coalesce(nullif(regexp_replace(lower(coalesce(p_page, '/')), '[^a-z0-9/_-]', '', 'g'), ''), '/'), 80);
  source text := left(coalesce(nullif(regexp_replace(lower(coalesce(p_source, '')), '[^[:alnum:] ._()-]', '', 'g'), ''), 'direct ou e-mail'), 60);
begin
  insert into public.site_visites (jour, page, source, visites)
  values ((now() at time zone 'Europe/Paris')::date, page, source, 1)
  on conflict (jour, page, source) do update set visites = site_visites.visites + 1;
end $$;
revoke all on function public.site_vue(text, text) from public;
grant execute on function public.site_vue(text, text) to anon, authenticated;
