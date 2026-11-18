-- =====================================================================
-- Devanture — envoi des e-mails validés (montée progressive), par Valérie
-- À exécuter APRÈS 20261026000000_captures.sql, dans Supabase > SQL Editor.
-- L'envoi reste COUPÉ tant que tu ne l'actives pas sur la page « Valérie »
-- (et tant que le domaine et Resend ne sont pas branchés). Ne supprime aucune donnée.
-- =====================================================================

-- Suivi de chaque e-mail envoyé chez Resend.
alter table public.emails
  add column if not exists provider_id         text,         -- identifiant de l'e-mail chez Resend
  add column if not exists delivery_status     text,         -- dernier événement : delivered, bounced, complained…
  add column if not exists delivery_checked_at timestamptz;

create index if not exists emails_envoyes_idx on public.emails (sent_at) where status = 'envoye';

-- Interrupteur d'envoi (séparé de la rédaction) et plafond par jour.
alter table public.agent_settings
  add column if not exists send_enabled     boolean not null default false,
  add column if not exists send_max_per_day integer not null default 50
    check (send_max_per_day between 1 and 100);
