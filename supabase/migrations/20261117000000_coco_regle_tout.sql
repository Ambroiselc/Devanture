-- 17/11 (demande de Broise : « que Coco ne me garde rien, qu'elle corrige tout toute seule ») : Coco règle elle-même
-- chaque problème (réécriture par Valérie, maquette refaite par Sid, artisan écarté, e-mail ou relance annulé).
-- Nouveau statut d'e-mail « annule » : un e-mail ou une relance que Coco a décidé de ne pas envoyer. Il reste en base
-- (trace, et Valérie ne réécrit pas pour cet artisan ; la relance n'est pas reproposée).
alter table public.emails drop constraint if exists emails_status_check;
alter table public.emails add constraint emails_status_check
  check (status in ('brouillon', 'a_valider', 'valide', 'envoye', 'repondu', 'erreur', 'annule'));
alter table public.emails drop constraint if exists emails_coco_verdict_check;
alter table public.emails add constraint emails_coco_verdict_check
  check (coco_verdict is null or coco_verdict in ('ok', 'corrige', 'garde', 'annule'));
-- Les e-mails qu'elle avait gardés pour Broise repassent en relecture : elle les réglera elle-même au prochain passage.
update public.emails set coco_verdict = null, coco_avis = null, coco_le = null
 where status = 'a_valider' and coco_verdict = 'garde';
