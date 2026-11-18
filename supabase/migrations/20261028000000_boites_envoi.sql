-- =====================================================================
-- Devanture — boîtes d'envoi de la prospection (28/10)
-- Valérie envoie depuis de vraies boîtes mail (domaines réservés à la prospection) au lieu de Resend.
-- Appliquée par le workflow « Appliquer une migration » (ou à coller dans Supabase > SQL Editor).
-- Ne supprime aucune donnée. Aucune nouvelle table (donc pas de nouvelle politique RLS).
-- =====================================================================

-- Canal qui a envoyé chaque e-mail : l'adresse de la boîte, ou « resend ». Vide = ancien envoi par Resend.
alter table public.emails add column if not exists sender text;
create index if not exists emails_sender_idx on public.emails (sender, sent_at) where sent_at is not null;

-- Plafond par jour de la page « Valérie » : jusqu'à 300 (plusieurs boîtes), au lieu de 100 (limite gratuite de Resend).
alter table public.agent_settings drop constraint if exists agent_settings_send_max_per_day_check;
alter table public.agent_settings add constraint agent_settings_send_max_per_day_check
  check (send_max_per_day between 1 and 300);
