-- =====================================================================
-- Devanture — maquettes visibles par les artisans, sans connexion (27/10)
-- À exécuter APRÈS 20261027010000_boite_mail_droits.sql, dans Supabase > SQL Editor.
--
-- La page publique /m/<slug> appelle cette fonction avec la clé publique (rôle anon).
-- La table « websites » reste fermée au public (RLS) : la fonction ne renvoie QUE les textes
-- d'une maquette prête, et rien si le prospect a refusé, a été écarté ou est sur la liste d'opposition.
-- =====================================================================

create or replace function public.maquette_publique(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select w.content
  from public.websites w
  join public.prospects p on p.id = w.prospect_id
  where w.slug = lower(btrim(p_slug))
    and w.kind = 'demo'
    and w.status in ('pret', 'publie')
    and w.content is not null
    and p.status not in ('refuse', 'ecarte')
    and not public.is_opposed(p.email)
  limit 1;
$$;

revoke all on function public.maquette_publique(text) from public;
grant execute on function public.maquette_publique(text) to anon, authenticated, service_role;
