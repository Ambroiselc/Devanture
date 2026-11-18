-- =====================================================================
-- Devanture — liste d'opposition + budget IA (phase 1)
-- À exécuter APRÈS le schéma initial, dans Supabase > SQL Editor.
-- Ne contient aucun secret.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Liste d'opposition : les personnes qui ne veulent plus d'e-mails.
--    Obligatoire en prospection B2B (RGPD + CNIL) : chaque e-mail doit
--    proposer de se désinscrire, et la demande doit être respectée pour toujours.
--    On peut bloquer une adresse précise OU tout un nom de domaine.
-- ---------------------------------------------------------------------
create table public.opposition_list (
  id             uuid primary key default gen_random_uuid(),
  email          text,                  -- ex : contact@boulangerie.fr (toujours en minuscules)
  domain         text,                  -- ex : boulangerie.fr (bloque toutes les adresses du domaine)
  business_name  text,                  -- pour s'y retrouver
  reason         text not null default 'desinscription'
                 check (reason in ('desinscription', 'refus', 'plainte', 'adresse_invalide', 'manuel')),
  notes          text,
  is_demo        boolean not null default false,
  created_at     timestamptz not null default now(),
  check (email is not null or domain is not null),
  check (email is null or email = lower(btrim(email))),
  check (domain is null or domain = lower(btrim(domain)))
);

create unique index opposition_email_unique  on public.opposition_list (email)  where email is not null;
create unique index opposition_domain_unique on public.opposition_list (domain) where domain is not null;

-- Met automatiquement l'adresse et le domaine en minuscules, sans espaces.
create or replace function public.normalize_opposition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email  = nullif(lower(btrim(new.email)), '');
  new.domain = nullif(lower(btrim(btrim(new.domain), '@')), '');
  return new;
end;
$$;

create trigger trg_opposition_normalize before insert or update on public.opposition_list
  for each row execute function public.normalize_opposition();

-- Renvoie true si cette adresse ne doit JAMAIS être contactée.
-- Les agents l'appelleront avant chaque e-mail.
create or replace function public.is_opposed(p_email text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_email is not null and exists (
    select 1 from public.opposition_list o
    where o.email = lower(btrim(p_email))
       or o.domain = split_part(lower(btrim(p_email)), '@', 2)
  );
$$;

-- Garde-fou dans la base : impossible de préparer, valider ou envoyer
-- un e-mail à un prospect qui s'est opposé, même si un agent se trompe.
create or replace function public.block_opposed_emails()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_email text;
begin
  if new.status in ('a_valider', 'valide', 'envoye') then
    select p.email into v_email from public.prospects p where p.id = new.prospect_id;
    if public.is_opposed(v_email) then
      raise exception 'Prospect sur la liste d''opposition : e-mail bloqué (%).', v_email
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_emails_block_opposed before insert or update of status on public.emails
  for each row execute function public.block_opposed_emails();

-- Quand quelqu'un s'oppose, ses prospects passent en « refusé ».
create or replace function public.mark_opposed_prospects()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.prospects p
     set status = 'refuse'
   where p.status not in ('client', 'refuse')
     and p.email is not null
     and (lower(p.email) = new.email or split_part(lower(p.email), '@', 2) = new.domain);
  return new;
end;
$$;

create trigger trg_opposition_mark_prospects after insert on public.opposition_list
  for each row execute function public.mark_opposed_prospects();

alter table public.opposition_list enable row level security;
create policy "admins_opposition_list" on public.opposition_list for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.opposition_list from anon;
grant select, insert, update, delete on public.opposition_list to authenticated;

revoke execute on function public.is_opposed(text) from public, anon;
grant execute on function public.is_opposed(text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Réglages (une seule ligne) : le budget mensuel des agents IA.
-- ---------------------------------------------------------------------
create table public.app_settings (
  id                     boolean primary key default true check (id),  -- force une seule ligne
  ai_monthly_budget_eur  numeric(10, 2) not null default 20 check (ai_monthly_budget_eur >= 0),
  ai_alert_ratio         numeric(3, 2)  not null default 0.80 check (ai_alert_ratio > 0 and ai_alert_ratio <= 1),
  updated_at             timestamptz not null default now()
);
insert into public.app_settings (id) values (true);

create trigger trg_app_settings_updated before update on public.app_settings
  for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;
create policy "admins_app_settings_lecture" on public.app_settings for select to authenticated
  using ((select public.is_admin()));
create policy "admins_app_settings_modif" on public.app_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.app_settings from anon;
grant select, update on public.app_settings to authenticated;

-- Dépenses IA du mois en cours face au budget.
-- Les agents l'appelleront avant chaque tâche : si "depasse" est vrai, ils s'arrêtent.
create or replace view public.ai_budget_status
with (security_invoker = true) as
select
  s.ai_monthly_budget_eur                                   as budget_eur,
  coalesce(sum(c.amount_eur), 0)                            as spent_eur,
  s.ai_alert_ratio                                          as alert_ratio,
  coalesce(sum(c.amount_eur), 0) >= s.ai_monthly_budget_eur as depasse
from public.app_settings s
left join public.costs c
  on c.category = 'api'
 and c.is_demo = false
 and c.incurred_at >= date_trunc('month', now())
group by s.ai_monthly_budget_eur, s.ai_alert_ratio;

revoke all on public.ai_budget_status from anon;
grant select on public.ai_budget_status to authenticated;
