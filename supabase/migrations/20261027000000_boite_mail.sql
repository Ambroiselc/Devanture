-- =====================================================================
-- Devanture — boîte mail intégrée et agente des réponses (27/10)
-- À exécuter APRÈS 20261026020000_styles_et_nettoyage.sql, dans Supabase > SQL Editor.
--
-- Les e-mails reçus sur …@devanture-artisans.fr arrivent ici (Worker Cloudflare « boite-mail »).
-- L'agente des réponses les lit, les trie, rédige les réponses ; les réponses simples partent seules,
-- tout ce qui touche au prix, au contrat ou au paiement attend la validation de Broise sur /boite.
-- Ne contient aucun secret et ne supprime aucune donnée existante.
-- =====================================================================

-- 1. Nouvel agent « boite » dans les listes autorisées.
alter table public.tasks drop constraint if exists tasks_agent_check;
alter table public.tasks add constraint tasks_agent_check
  check (agent in ('orchestrateur', 'prospection', 'site_demo', 'email', 'site_production', 'boite'));
alter table public.agent_settings drop constraint if exists agent_settings_agent_check;
alter table public.agent_settings add constraint agent_settings_agent_check
  check (agent in ('orchestrateur', 'prospection', 'site_demo', 'email', 'site_production', 'boite'));

-- Réponses envoyées seules (sans validation) : interrupteur et plafond par jour.
alter table public.agent_settings
  add column if not exists auto_reply_enabled   boolean not null default true,
  add column if not exists auto_reply_max_per_day integer not null default 20
    check (auto_reply_max_per_day between 0 and 50);

insert into public.agent_settings (agent, display_name, default_limit, signature)
values ('boite', 'Inès', 50, E'Ambroise Le Clerc\nDevanture — sites web pour les artisans\nhttps://devanture-artisans.fr')
on conflict (agent) do nothing;

-- 2. Tous les messages de la boîte : reçus (« entrant ») et envoyés en réponse (« sortant »).
create table if not exists public.mailbox_messages (
  id              uuid primary key default gen_random_uuid(),
  direction       text not null check (direction in ('entrant', 'sortant')),
  -- Fil de discussion : identifiant du premier message du fil.
  thread_id       uuid,
  prospect_id     uuid references public.prospects (id) on delete cascade,
  -- E-mail de prospection (Valérie) auquel l'artisan répond, s'il est connu.
  email_id        uuid references public.emails (id) on delete set null,
  -- Pour une réponse : le message reçu auquel elle répond.
  reply_to_id     uuid references public.mailbox_messages (id) on delete set null,
  from_email      text,
  from_name       text,
  to_email        text,
  subject         text not null default '',
  body_text       text not null default '',
  body_html       text,
  message_id      text,             -- en-tête Message-ID (pour reconnaître les doublons et les fils)
  in_reply_to     text,
  references_ids  text,
  -- Pièces jointes : seulement leur nom, type et taille (le fichier reste dans la copie Gmail).
  attachments     jsonb not null default '[]'::jsonb,
  auto_submitted  boolean not null default false,   -- réponse automatique (absence, accusé…)
  -- Tri fait par l'agente.
  category        text check (category is null or category in
                  ('interesse', 'question', 'rendez_vous', 'pas_interesse', 'stop', 'automatique', 'client', 'spam', 'autre')),
  summary         text,
  -- Entrant : nouveau → traite (ou a_traiter = Broise doit regarder, ignore = spam / réponse automatique).
  -- Sortant : a_valider → valide → envoye (ou rejete, erreur).
  status          text not null check (status in
                  ('nouveau', 'traite', 'a_traiter', 'ignore', 'a_valider', 'valide', 'envoye', 'rejete', 'erreur')),
  review_reason   text,             -- pourquoi la réponse attend Broise
  sent_by         text check (sent_by is null or sent_by in ('agent', 'broise')),
  provider_id     text,             -- identifiant chez Resend
  received_at     timestamptz,
  sent_at         timestamptz,
  error_message   text,
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((direction = 'entrant' and status in ('nouveau', 'traite', 'a_traiter', 'ignore'))
      or (direction = 'sortant' and status in ('a_valider', 'valide', 'envoye', 'rejete', 'erreur')))
);

create unique index if not exists mailbox_message_id_unique
  on public.mailbox_messages (message_id) where direction = 'entrant' and message_id is not null;
create index if not exists mailbox_status_idx on public.mailbox_messages (direction, status);
create index if not exists mailbox_thread_idx on public.mailbox_messages (thread_id, created_at);
create index if not exists mailbox_prospect_idx on public.mailbox_messages (prospect_id);
create index if not exists mailbox_email_idx on public.mailbox_messages (email_id);
create index if not exists mailbox_reply_idx on public.mailbox_messages (reply_to_id);

drop trigger if exists trg_mailbox_updated on public.mailbox_messages;
create trigger trg_mailbox_updated before update on public.mailbox_messages
  for each row execute function public.set_updated_at();

-- Garde-fou : impossible de valider ou d'envoyer une réponse vers une adresse de la liste d'opposition.
create or replace function public.block_opposed_replies()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.direction = 'sortant' and new.status in ('valide', 'envoye') and public.is_opposed(new.to_email) then
    raise exception 'Adresse sur la liste d''opposition : réponse bloquée (%).', new.to_email
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mailbox_block_opposed on public.mailbox_messages;
create trigger trg_mailbox_block_opposed before insert or update of status on public.mailbox_messages
  for each row execute function public.block_opposed_replies();

alter table public.mailbox_messages enable row level security;
drop policy if exists "admins_mailbox_messages" on public.mailbox_messages;
create policy "admins_mailbox_messages" on public.mailbox_messages for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.mailbox_messages from anon;
grant select, insert, update, delete on public.mailbox_messages to authenticated;
-- Le Worker de réception utilise la clé secrète (rôle service_role) : il contourne la RLS, comme les agents.

-- 3. Nettoyage de la boîte (lancé chaque jour avec nettoyer_base) :
--    • messages des prospects opposés (depuis plus de 7 jours) : effacés, l'adresse reste dans la liste d'opposition ;
--    • spam et réponses automatiques de plus de 30 jours ;
--    • tout message de plus de 3 ans, sauf ceux des clients (gardés 5 ans, durée du registre RGPD).
create or replace function public.nettoyer_boite()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n_opposes int;
  n_ignores int;
  n_vieux int;
begin
  delete from public.mailbox_messages m using public.prospects p
  where m.prospect_id = p.id and p.status = 'refuse' and p.updated_at < now() - interval '7 days';
  get diagnostics n_opposes = row_count;

  delete from public.mailbox_messages
  where status = 'ignore' and created_at < now() - interval '30 days';
  get diagnostics n_ignores = row_count;

  delete from public.mailbox_messages m
  where m.created_at < now() - interval '3 years'
    and not exists (select 1 from public.prospects p where p.id = m.prospect_id and p.status = 'client'
                    and m.created_at > now() - interval '5 years');
  get diagnostics n_vieux = row_count;

  return jsonb_build_object('boite_opposes', n_opposes, 'boite_spam_auto', n_ignores, 'boite_plus_de_3_ans', n_vieux);
end;
$$;

revoke execute on function public.nettoyer_boite() from public, anon, authenticated;
