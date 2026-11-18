-- Supprime TOUTES les données fictives (is_demo = true), sans toucher aux vraies.
-- À exécuter dans Supabase > SQL Editor quand tu n'en as plus besoin.
-- Boîte mail (si la migration 20261027000000_boite_mail.sql a été lancée).
do $$ begin
  if to_regclass('public.mailbox_messages') is not null then delete from public.mailbox_messages where is_demo; end if;
end $$;
delete from public.opposition_list where is_demo;
delete from public.costs       where is_demo;
delete from public.task_events where is_demo;
delete from public.tasks       where is_demo;
delete from public.emails      where is_demo;
delete from public.websites    where is_demo;
delete from public.prospects   where is_demo;
delete from public.campaigns   where is_demo;
