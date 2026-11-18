-- =====================================================================
-- Devanture — droits du Worker « boite-mail » (27/10)
-- À exécuter APRÈS 20261027000000_boite_mail.sql, dans Supabase > SQL Editor.
--
-- Le Worker écrit dans la base avec la clé secrète (rôle service_role) en passant par l'API de Supabase.
-- Ce rôle contourne la RLS, mais il lui faut quand même le droit d'écrire dans la table (sinon erreur 403 /
-- 42501 « permission denied »), et celui d'utiliser la fonction is_opposed (appelée par le garde-fou de la table).
-- =====================================================================

grant select, insert, update, delete on public.mailbox_messages to service_role;
grant execute on function public.is_opposed(text) to service_role;
