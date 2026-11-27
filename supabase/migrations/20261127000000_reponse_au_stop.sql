-- =====================================================================
-- Devanture — confirmer une demande d'arrêt (27/11, demande de Broise)
-- Une personne a demandé de supprimer sa maquette ; son adresse est passée en liste d'opposition et la base refusait
-- ensuite la réponse de Broise pour lui confirmer que c'était fait.
-- Exception unique au garde-fou : UNE réponse écrite à la main par Broise (sent_by = 'broise') au message de demande
-- d'arrêt lui-même (catégorie « stop »), dans les 7 jours qui suivent. Tout le reste reste bloqué (Inès, Valérie, relances).
-- =====================================================================

create or replace function public.block_opposed_replies()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.direction = 'sortant' and new.status in ('valide', 'envoye') and public.is_opposed(new.to_email) then
    if new.sent_by = 'broise' and new.reply_to_id is not null and exists (
         select 1 from public.mailbox_messages r
         where r.id = new.reply_to_id and r.direction = 'entrant' and r.category = 'stop'
           and lower(r.from_email) = lower(new.to_email) and r.created_at > now() - interval '7 days')
       and not exists (
         select 1 from public.mailbox_messages s
         where s.reply_to_id = new.reply_to_id and s.direction = 'sortant' and s.id <> new.id
           and s.status in ('valide', 'envoye')) then
      return new;
    end if;
    raise exception 'Adresse sur la liste d''opposition : réponse bloquée (%).', new.to_email
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
