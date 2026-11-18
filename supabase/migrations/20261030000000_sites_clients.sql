-- =====================================================================
-- Devanture — sites définitifs des clients et demandes de devis (30/10, Devi)
-- 1. Un seul site définitif « vivant » par client (websites.kind = 'production').
-- 2. Les fichiers des sites (pages, photos réduites) sont rangés dans le stockage Supabase, dossier PUBLIC « sites »,
--    et servis par le Worker Cloudflare « devanture-sites » (aperçu et domaine du client).
-- 3. Le formulaire « Demander un devis » des sites clients dépose les demandes ici ; Inès les transmet à l'artisan.
-- Appliquée par le workflow « Appliquer une migration ». Ne supprime aucune donnée.
-- =====================================================================

-- 1. Un site définitif par prospect (les versions archivées ne comptent pas) ---------------------
create unique index if not exists websites_un_site_par_prospect
  on public.websites (prospect_id) where kind = 'production' and status <> 'archive';

-- 2. Demandes de devis reçues par les sites des clients ----------------------------------------
create table if not exists public.demandes_devis (
  id          uuid primary key default gen_random_uuid(),
  website_id  uuid not null references public.websites (id) on delete cascade,
  nom         text,
  telephone   text,
  email       text,
  commune     text,
  message     text not null,
  statut      text not null default 'a_transmettre'
              check (statut in ('a_transmettre', 'transmis', 'erreur', 'ignore')),
  transmis_le timestamptz,
  erreur      text,
  created_at  timestamptz not null default now()
);
create index if not exists demandes_devis_statut_idx on public.demandes_devis (statut, created_at);
create index if not exists demandes_devis_site_idx on public.demandes_devis (website_id, created_at);

alter table public.demandes_devis enable row level security;
drop policy if exists "admins_demandes_devis" on public.demandes_devis;
create policy "admins_demandes_devis" on public.demandes_devis for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.demandes_devis from anon;
grant select, insert, update, delete on public.demandes_devis to authenticated;
grant select, insert, update, delete on public.demandes_devis to service_role;

-- Dépôt d'une demande par le formulaire d'un site (appelé par /api/devis avec la clé publique).
-- Garde-fous : site définitif existant, champs bornés, 30 demandes par site et par jour au plus,
-- 3 par numéro (ou adresse) et par heure. Renvoie aussi s'il faut réveiller Inès (pas réveillée depuis 3 minutes).
create or replace function public.devis_deposer(p_site text, p_nom text, p_telephone text, p_email text,
                                                p_commune text, p_message text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  w_id uuid;
  dernier timestamptz;
begin
  if p_site is null or p_site !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_site) > 80 then
    return jsonb_build_object('ok', false, 'raison', 'site');
  end if;
  if coalesce(length(trim(p_message)), 0) < 3 and coalesce(length(trim(p_telephone)), 0) < 6 then
    return jsonb_build_object('ok', false, 'raison', 'vide');
  end if;
  select w.id into w_id from public.websites w
   where w.slug = p_site and w.kind = 'production' and w.status in ('pret', 'publie');
  if w_id is null then return jsonb_build_object('ok', false, 'raison', 'site'); end if;

  if (select count(*) from public.demandes_devis
       where website_id = w_id and created_at > now() - interval '1 day') >= 30
     or (select count(*) from public.demandes_devis
          where website_id = w_id and created_at > now() - interval '1 hour'
            and ((nullif(trim(p_telephone), '') is not null and telephone = trim(p_telephone))
                 or (nullif(trim(p_email), '') is not null and email = lower(trim(p_email))))) >= 3 then
    return jsonb_build_object('ok', false, 'raison', 'trop');
  end if;

  select max(created_at) into dernier from public.demandes_devis;
  insert into public.demandes_devis (website_id, nom, telephone, email, commune, message)
  values (w_id, left(nullif(trim(p_nom), ''), 120), left(nullif(trim(p_telephone), ''), 40),
          left(lower(nullif(trim(p_email), '')), 200), left(nullif(trim(p_commune), ''), 120),
          left(coalesce(nullif(trim(p_message), ''), '(pas de message, rappeler le numéro)'), 4000));
  return jsonb_build_object('ok', true, 'reveiller', dernier is null or dernier < now() - interval '3 minutes');
end $$;
revoke all on function public.devis_deposer(text, text, text, text, text, text) from public;
grant execute on function public.devis_deposer(text, text, text, text, text, text) to anon, authenticated;

-- Le nettoyage garde les demandes 3 ans au plus (registre RGPD) : fait par Inès (agents/devis.ts).

-- 3. Devi est un agent : son nom de tâche « site_production » existe déjà dans tasks_agent_check. ----------

-- 4. Stockage des sites (public : ce sont des pages web) -----------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    -- Types de fichiers : pas de liste (pages, styles, polices, photos) ; seule la clé secrète de Devi écrit ici.
    values ('sites', 'sites', true, 10485760, null)
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
                                   allowed_mime_types = excluded.allowed_mime_types;
    -- Écriture réservée aux administrateurs (Devi passe par la clé secrète, qui passe outre).
    execute 'drop policy if exists "sites_admin" on storage.objects';
    execute $p$create policy "sites_admin" on storage.objects for all to authenticated
      using (bucket_id = 'sites' and (select public.is_admin()))
      with check (bucket_id = 'sites' and (select public.is_admin()))$p$;
  end if;
end $$;
