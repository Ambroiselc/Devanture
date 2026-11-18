-- 3/11 : contacts de CHAUFFE des boîtes de prospection (amis, proches à qui Broise écrit pour chauffer les boîtes).
-- Inès range leurs messages à part (catégorie « chauffe »), sans les lier à un prospect, sans IA et sans réponse.
-- Liste modifiable sur la page d'Inès (réglages).

alter table public.agent_settings add column if not exists contacts_chauffe text[] not null default '{}';

alter table public.mailbox_messages drop constraint if exists mailbox_messages_category_check;
alter table public.mailbox_messages add constraint mailbox_messages_category_check check (category is null or category in
  ('interesse', 'question', 'rendez_vous', 'pas_interesse', 'stop', 'automatique', 'client', 'spam', 'autre', 'chauffe'));

-- Colombe (fiche de test « Colombe Carrelage & Crédences » du 26/10) : premier contact de chauffe.
-- L'adresse est reprise de la fiche, pour ne pas l'écrire dans le code.
update public.agent_settings s
   set contacts_chauffe = (
     select coalesce(array_agg(distinct lower(p.email)), '{}') from public.prospects p
      where p.name = 'Colombe Carrelage & Crédences' and p.email is not null)
 where s.agent = 'boite' and s.contacts_chauffe = '{}';

-- Sa fiche n'est pas un vrai artisan : écartée, pour ne jamais être relancée ni comptée.
update public.prospects
   set status = 'ecarte',
       notes = concat_ws(E'\n', notes, 'Contact de chauffe de Broise (3/11), pas un artisan.')
 where name = 'Colombe Carrelage & Crédences' and status <> 'ecarte';

-- Ses messages déjà reçus : rangés « chauffe », sortis des « à traiter ».
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
