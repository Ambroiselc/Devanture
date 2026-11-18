-- =====================================================================
-- Devanture — Valérie, l'agente qui rédige les e-mails de prospection (phase 4)
-- À exécuter APRÈS 20261023000000_demos.sql, dans Supabase > SQL Editor.
-- Valérie prépare des BROUILLONS : rien n'est envoyé. Broise les relit et les valide.
-- Ne contient aucun secret et ne supprime aucune donnée.
-- =====================================================================

-- Version du message (A ou B) : on teste 2 approches sur les 100 premiers envois.
alter table public.emails add column if not exists variant text;
alter table public.emails drop constraint if exists emails_variant_check;
alter table public.emails add constraint emails_variant_check check (variant is null or variant in ('A', 'B'));

-- Un seul e-mail en cours (brouillon, à valider ou validé) par prospect.
create unique index if not exists emails_un_en_cours_par_prospect
  on public.emails (prospect_id) where status in ('brouillon', 'a_valider', 'valide');

-- Signature des e-mails (qui écrit : prénom, nom, Devanture, adresse…), réglable sur la page « Valérie ».
alter table public.agent_settings add column if not exists signature text
  check (signature is null or char_length(signature) <= 500);

insert into public.agent_settings (agent, display_name, default_limit, signature)
values ('email', 'Valérie', 10, E'Prénom Nom\nDevanture — sites web pour les artisans de la métropole lilloise')
on conflict (agent) do nothing;
