-- 12/11 : la fonction site_vue (compteur du site vitrine, 2/11) plantait à CHAQUE visite :
-- « column reference "page" is ambiguous » (variables PL/pgSQL nommées comme les colonnes de site_visites).
-- Aucune visite n'a donc jamais été enregistrée. Même fonction, variables renommées.
create or replace function public.site_vue(p_page text, p_source text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_page text := left(coalesce(nullif(regexp_replace(lower(coalesce(p_page, '/')), '[^a-z0-9/_-]', '', 'g'), ''), '/'), 80);
  v_source text := left(coalesce(nullif(regexp_replace(lower(coalesce(p_source, '')), '[^[:alnum:] ._()-]', '', 'g'), ''), 'direct ou e-mail'), 60);
begin
  insert into public.site_visites as s (jour, page, source, visites)
  values ((now() at time zone 'Europe/Paris')::date, v_page, v_source, 1)
  on conflict (jour, page, source) do update set visites = s.visites + 1;
end $$;
revoke all on function public.site_vue(text, text) from public;
grant execute on function public.site_vue(text, text) to anon, authenticated;
