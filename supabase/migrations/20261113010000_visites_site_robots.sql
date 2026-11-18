-- 13/11 (après-midi) : diagnostic agents/diag-azure.ts : la plupart des « visites » du site vitrine venaient de
-- robots qui se font passer pour un navigateur, surtout Microsoft 365 qui ouvre les liens de chaque e-mail reçu pour
-- les vérifier (serveurs de Dublin, San José, Paris). On note maintenant le réseau d'où vient la visite (nom de
-- l'opérateur et pays, lus par Cloudflare ; jamais l'adresse IP). Une visite d'un réseau d'hébergeur est gardée dans
-- le détail, marquée robot, mais n'est PAS ajoutée aux compteurs par jour.
alter table public.site_visites_detail add column if not exists reseau text;
alter table public.site_visites_detail add column if not exists pays text;
alter table public.site_visites_detail add column if not exists robot boolean not null default false;

create or replace function public.site_visite(p_visite text, p_page text, p_source text, p_duree integer,
  p_appareil text, p_systeme text, p_navigateur text, p_reseau text, p_pays text, p_robot boolean)
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
  insert into public.site_visites_detail (visite, duree_s, page, pages, source, appareil, systeme, navigateur, reseau, pays, robot)
  values (p_visite, v_duree, v_page, array[v_page], v_source,
          case when p_appareil in ('telephone', 'tablette', 'ordinateur') then p_appareil end,
          left(nullif(regexp_replace(coalesce(p_systeme, ''), '[^[:alnum:] ._-]', '', 'g'), ''), 30),
          left(nullif(regexp_replace(coalesce(p_navigateur, ''), '[^[:alnum:] ._-]', '', 'g'), ''), 30),
          left(nullif(regexp_replace(coalesce(p_reseau, ''), '[^[:alnum:] ._,()&-]', '', 'g'), ''), 60),
          left(nullif(regexp_replace(upper(coalesce(p_pays, '')), '[^A-Z]', '', 'g'), ''), 2),
          coalesce(p_robot, false))
  on conflict (visite) do nothing;
  if coalesce(p_robot, false) then return; end if;
  insert into public.site_visites as s (jour, page, source, visites)
  values ((now() at time zone 'Europe/Paris')::date, v_page, v_source, 1)
  on conflict (jour, page, source) do update set visites = s.visites + 1;
end $$;
revoke all on function public.site_visite(text, text, text, integer, text, text, text, text, text, boolean) from public;
grant execute on function public.site_visite(text, text, text, integer, text, text, text, text, text, boolean) to anon, authenticated;
