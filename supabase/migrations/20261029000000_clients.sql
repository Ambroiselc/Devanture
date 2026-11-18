-- =====================================================================
-- Devanture — fiches clients (29/10)
-- Un prospect qui paie devient client : sa formule, son domaine et l'étape où il en est,
-- de la signature à l'abonnement (procédure : docs/apres-signature.md).
-- Appliquée par le workflow « Appliquer une migration ». Ne supprime aucune donnée.
-- =====================================================================

create table if not exists public.clients (
  id              uuid primary key default gen_random_uuid(),
  prospect_id     uuid not null unique references public.prospects (id) on delete restrict,
  formule         text not null check (formule in ('essentiel', 'pro')),
  paiement        text not null check (paiement in ('creation', 'sans_frais')),
  lancement       boolean not null default false,       -- offre de lancement (5 premiers clients)
  etape           text not null default 'paye'
                  check (etape in ('paye', 'contenu_demande', 'contenu_recu', 'site_en_preparation',
                                   'apercu_envoye', 'valide', 'domaine_achete', 'en_ligne', 'abonne',
                                   'abandonne', 'resilie')),
  domaine         text,                                 -- ex. hebert-couverture.fr, au nom du client
  signe_le        date not null default current_date,
  en_ligne_le     date,
  fin_engagement  date,                                 -- 12 mois après la commande (0 € de départ)
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists clients_etape_idx on public.clients (etape);

drop trigger if exists trg_clients_updated on public.clients;
create trigger trg_clients_updated before update on public.clients
  for each row execute function public.set_updated_at();

-- La fiche prospect suit : un client reste « client » (le nettoyage ne l'efface jamais, voir nettoyer_base).
create or replace function public.client_vers_prospect()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.prospects set status = 'client' where id = new.prospect_id and status <> 'client';
  return new;
end $$;
drop trigger if exists trg_clients_prospect on public.clients;
create trigger trg_clients_prospect after insert on public.clients
  for each row execute function public.client_vers_prospect();

alter table public.clients enable row level security;
drop policy if exists "admins_clients" on public.clients;
create policy "admins_clients" on public.clients for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.clients from anon;
grant select, insert, update, delete on public.clients to authenticated;
-- Les agents (clé secrète, rôle service_role) passent outre la RLS mais ont besoin de droits explicites.
grant select, insert, update, delete on public.clients to service_role;
