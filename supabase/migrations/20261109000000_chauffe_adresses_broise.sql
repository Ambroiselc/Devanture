-- 18/11 : adresses personnelles retirées (dépôt rendu public). Migration déjà appliquée le 9/11 : NE PAS la relancer.
-- 9/11 : les adresses de test de Broise (copies de chauffe / tests de délivrabilité) deviennent des contacts de chauffe.
-- Leurs messages sont rangés « chauffe » (ignorés par Inès, sans prospect, sans IA, sans réponse), comme Colombe le 3/11.
update public.agent_settings s
   set contacts_chauffe = (
     select coalesce(array_agg(distinct a), '{}')
       from unnest(s.contacts_chauffe || array['adresse-retiree-1@exemple.invalid', 'adresse-retiree-2@exemple.invalid']) a)
 where s.agent = 'boite';

-- Messages déjà reçus de ces adresses : rangés « chauffe », sortis des « à traiter ».
update public.mailbox_messages m
   set category = 'chauffe', status = 'ignore', summary = 'Contact de chauffe : ignoré par Inès.', prospect_id = null
  from public.agent_settings s
 where s.agent = 'boite' and m.direction = 'entrant' and lower(m.from_email) = any (s.contacts_chauffe);

-- Brouillons de réponse à ces messages jamais envoyés : rejetés.
update public.mailbox_messages r
   set status = 'rejete'
  from public.mailbox_messages m, public.agent_settings s
 where s.agent = 'boite' and r.reply_to_id = m.id and r.direction = 'sortant' and r.status in ('a_valider', 'erreur')
   and lower(m.from_email) = any (s.contacts_chauffe);
