-- =====================================================================
-- Devanture — accueil des clients et paiements Stripe (29/10)
-- 1. Chaque client a un lien d'accueil personnel (/bienvenue/<jeton>) pour envoyer ses infos, son logo et ses photos.
-- 2. Les paiements Stripe sont relevés par l'agent « paiements » (agents/paiements.ts) et rangés ici.
-- 3. Les fichiers déposés vont dans le stockage Supabase (dossier privé « clients/<jeton>/… »).
-- Appliquée par le workflow « Appliquer une migration ». Ne supprime aucune donnée.
-- =====================================================================

-- 1. Lien d'accueil et contenu envoyé par le client ------------------------------------------
-- Jeton : 64 caractères aléatoires (deux UUID v4 sans tirets), impossible à deviner.
alter table public.clients add column if not exists jeton text not null
  default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
create unique index if not exists clients_jeton_idx on public.clients (jeton);
alter table public.clients add column if not exists contenu jsonb not null default '{}'::jsonb;
alter table public.clients add column if not exists fichiers jsonb not null default '[]'::jsonb;
alter table public.clients add column if not exists contenu_recu_le timestamptz;

-- Ce que la page d'accueil a le droit de lire (rien d'autre : ni e-mail, ni notes, ni paiement).
create or replace function public.accueil_client(p_jeton text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'entreprise', p.name, 'metier', p.category, 'commune', p.city, 'formule', c.formule,
    'etape', c.etape, 'contenu', c.contenu, 'nb_fichiers', jsonb_array_length(c.fichiers),
    'ouvert', c.etape in ('paye', 'contenu_demande', 'contenu_recu', 'site_en_preparation'))
  from public.clients c join public.prospects p on p.id = c.prospect_id
  where length(p_jeton) = 64 and c.jeton = p_jeton
$$;

-- Le client envoie ses infos (et la liste des fichiers qu'il vient de déposer).
create or replace function public.accueil_enregistrer(p_jeton text, p_contenu jsonb, p_fichiers jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if length(p_jeton) <> 64 or jsonb_typeof(p_contenu) <> 'object' or jsonb_typeof(p_fichiers) <> 'array'
     or length(p_contenu::text) > 20000 or jsonb_array_length(p_fichiers) > 40 then
    return false;
  end if;
  update public.clients
     set contenu = contenu || p_contenu,
         fichiers = (select coalesce(jsonb_agg(distinct f), '[]'::jsonb) from (
                       select jsonb_array_elements(fichiers) as f union
                       select jsonb_array_elements(p_fichiers)) x),
         contenu_recu_le = now(),
         etape = case when etape in ('paye', 'contenu_demande') then 'contenu_recu' else etape end
   where jeton = p_jeton and etape in ('paye', 'contenu_demande', 'contenu_recu', 'site_en_preparation');
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- Pour le dépôt de fichiers : ce jeton peut-il encore déposer ? (la règle du stockage tourne avec les droits du
-- visiteur, qui ne peut pas lire la table clients : d'où cette fonction).
create or replace function public.depot_ouvert(p_jeton text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clients c
                 where length(p_jeton) = 64 and c.jeton = p_jeton
                   and c.etape in ('paye', 'contenu_demande', 'contenu_recu', 'site_en_preparation'))
$$;
revoke all on function public.depot_ouvert(text) from public;
grant execute on function public.depot_ouvert(text) to anon, authenticated;

revoke all on function public.accueil_client(text) from public;
revoke all on function public.accueil_enregistrer(text, jsonb, jsonb) from public;
grant execute on function public.accueil_client(text) to anon, authenticated;
grant execute on function public.accueil_enregistrer(text, jsonb, jsonb) to anon, authenticated;

-- 2. Paiements Stripe relevés --------------------------------------------------------------
create table if not exists public.paiements_stripe (
  id            uuid primary key default gen_random_uuid(),
  session_id    text not null unique,          -- identifiant Stripe du paiement (cs_…)
  paye_le       timestamptz not null,
  cle           text,                           -- quel lien de paiement (agents/lib/paiement.ts)
  email         text,
  entreprise    text,                           -- champ « Nom de l'entreprise » du lien de paiement
  montant_cents integer not null default 0,
  remise_cents  integer not null default 0,     -- code LANCEMENT utilisé
  client_id     uuid references public.clients (id) on delete set null,
  statut        text not null default 'a_rattacher' check (statut in ('rattache', 'a_rattacher', 'ignore')),
  created_at    timestamptz not null default now()
);
create index if not exists paiements_stripe_statut_idx on public.paiements_stripe (statut);
alter table public.paiements_stripe enable row level security;
drop policy if exists "admins_paiements_stripe" on public.paiements_stripe;
create policy "admins_paiements_stripe" on public.paiements_stripe for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.paiements_stripe from anon;
grant select, insert, update, delete on public.paiements_stripe to authenticated;
grant select, insert, update, delete on public.paiements_stripe to service_role;

-- L'agent des paiements ajoute des tâches : nouveau nom d'agent autorisé.
alter table public.tasks drop constraint if exists tasks_agent_check;
alter table public.tasks add constraint tasks_agent_check
  check (agent in ('orchestrateur', 'prospection', 'site_demo', 'email', 'site_production', 'boite', 'paiements'));

-- 3. Stockage des fichiers des clients (seulement si le stockage Supabase est là) -----------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('clients', 'clients', false, 15728640,
            array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif', 'image/svg+xml', 'application/pdf'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                                   allowed_mime_types = excluded.allowed_mime_types;

    -- Dépôt : n'importe qui AVEC un jeton valide, seulement dans son dossier, seulement pendant la préparation du site.
    -- Aucune lecture possible sans être administrateur.
    execute 'drop policy if exists "clients_depot" on storage.objects';
    execute $p$create policy "clients_depot" on storage.objects for insert to anon, authenticated
      with check (bucket_id = 'clients' and public.depot_ouvert((storage.foldername(name))[1]))$p$;
    execute 'drop policy if exists "clients_admin" on storage.objects';
    execute $p$create policy "clients_admin" on storage.objects for all to authenticated
      using (bucket_id = 'clients' and (select public.is_admin()))
      with check (bucket_id = 'clients' and (select public.is_admin()))$p$;
  end if;
end $$;
