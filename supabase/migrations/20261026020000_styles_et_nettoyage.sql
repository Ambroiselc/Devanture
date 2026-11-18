-- =====================================================================
-- Devanture — deux styles de maquette, et nettoyage automatique de la base (26/10)
-- À exécuter APRÈS 20261026010000_envoi.sql, dans Supabase > SQL Editor.
-- =====================================================================

-- 1. Une capture par style : « pro », « chaleureux », et « duo » (les deux côte à côte, pour l'e-mail).
alter table public.website_captures add column if not exists style text not null default 'pro';
alter table public.website_captures drop constraint if exists website_captures_style_check;
alter table public.website_captures add constraint website_captures_style_check check (style in ('pro', 'chaleureux', 'duo'));
alter table public.website_captures drop constraint if exists website_captures_pkey;
alter table public.website_captures add primary key (website_id, style);

-- 2. Nettoyage : supprime ce qui ne sert plus, sans jamais toucher à la liste d'opposition.
--    Renvoie ce qui a été supprimé. Lancé chaque jour par l'agent de prospection.
create or replace function public.nettoyer_base()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n_captures_sans_suite int;
  n_captures_archivees int;
  n_prospects_opposes int;
  n_prospects_vieux int;
  n_journaux int;
begin
  -- a) Photos des maquettes dont l'e-mail est parti il y a plus de 30 jours sans réponse,
  --    ou dont le prospect a refusé / s'est opposé. (La maquette elle-même reste consultable : elle est
  --    fabriquée à la demande à partir de ses textes, qui pèsent quelques Ko ; les photos se refont si besoin.)
  delete from public.website_captures c
  using public.websites w, public.prospects p
  where c.website_id = w.id and p.id = w.prospect_id
    and (p.status in ('refuse', 'ecarte')
         or (p.status = 'contacte' and exists (
               select 1 from public.emails e where e.prospect_id = p.id and e.status = 'envoye'
                 and e.sent_at < now() - interval '30 days')));
  get diagnostics n_captures_sans_suite = row_count;

  -- b) Photos des maquettes archivées (remplacées par une nouvelle version).
  delete from public.website_captures c using public.websites w
  where c.website_id = w.id and w.status = 'archive';
  get diagnostics n_captures_archivees = row_count;

  -- c) Prospects opposés ou dont l'adresse n'existe pas (depuis plus de 7 jours) : on efface leurs maquettes,
  --    leurs e-mails et leurs coordonnées. On garde seulement le nom, le SIRET et l'identifiant Google, pour que
  --    Loïc ne les « redécouvre » pas ; leur adresse e-mail RESTE dans la liste d'opposition.
  delete from public.websites w using public.prospects p
  where w.prospect_id = p.id and p.status = 'refuse' and p.updated_at < now() - interval '7 days';
  delete from public.emails e using public.prospects p
  where e.prospect_id = p.id and p.status = 'refuse' and p.updated_at < now() - interval '7 days';
  update public.prospects p
     set email = null, email_source = null, address = null, phone = null, current_website = null,
         notes = 'Coordonnées effacées (opposition ou adresse invalide).'
   where p.status = 'refuse' and p.updated_at < now() - interval '7 days'
     and (p.email is not null or p.address is not null or p.phone is not null or p.current_website is not null);
  get diagnostics n_prospects_opposes = row_count;

  -- d) Durée de conservation (registre RGPD) : 3 ans après le dernier contact ou la dernière vérification.
  delete from public.prospects p
  where p.status not in ('client', 'interesse')
    and greatest(p.updated_at, coalesce(p.last_checked_at, p.created_at)) < now() - interval '3 years';
  get diagnostics n_prospects_vieux = row_count;

  -- e) Journaux détaillés des agents de plus de 90 jours (les bilans des tâches restent).
  delete from public.task_events where created_at < now() - interval '90 days';
  get diagnostics n_journaux = row_count;

  return jsonb_build_object(
    'captures_sans_suite', n_captures_sans_suite, 'captures_archivees', n_captures_archivees,
    'prospects_opposes_effaces', n_prospects_opposes, 'prospects_plus_de_3_ans', n_prospects_vieux,
    'journaux', n_journaux);
end;
$$;

revoke execute on function public.nettoyer_base() from public, anon, authenticated;

-- 3. Pour suivre la place utilisée (500 Mo dans l'offre gratuite de Supabase).
create or replace function public.taille_base()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'total', pg_size_pretty(pg_database_size(current_database())),
    'total_octets', pg_database_size(current_database()),
    'captures', pg_size_pretty(pg_total_relation_size('public.website_captures')),
    'prospects', pg_size_pretty(pg_total_relation_size('public.prospects')),
    'emails', pg_size_pretty(pg_total_relation_size('public.emails')),
    'maquettes', pg_size_pretty(pg_total_relation_size('public.websites')),
    'journaux', pg_size_pretty(pg_total_relation_size('public.task_events')));
$$;
revoke execute on function public.taille_base() from public, anon;
grant execute on function public.taille_base() to authenticated;
