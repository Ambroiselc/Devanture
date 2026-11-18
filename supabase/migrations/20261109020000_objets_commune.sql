-- 9/11 : objets du type « 2R Energies, une maquette de site pour Bermerain » : la commune y passait pour le destinataire.
-- Premiers e-mails PAS ENCORE PARTIS seulement (« à valider » ou « validé ») : « pour <commune> » → « pour vous à <commune> ».
-- Les e-mails déjà envoyés et leurs relances (« Re: » + même objet, pour rester dans le fil) ne changent pas.
-- Changement d'objet seulement : les déclencheurs sont coupés pour ne pas faire repasser ces e-mails chez Coco.
set local session_replication_role = replica;
do $$
declare n int;
begin
  update public.emails e
     set subject = regexp_replace(e.subject, '(^|[^[:alnum:]])pour\s+(la\s+commune\s+de\s+)?(' || regexp_replace(p.city, '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || ')([^[:alnum:]]|$)',
                                  '\1pour vous à \3\4', 'i')
    from public.prospects p
   where p.id = e.prospect_id and e.relance_de is null and e.sent_at is null and e.status in ('a_valider', 'valide')
     and coalesce(p.city, '') <> ''
     and e.subject ~* ('(^|[^[:alnum:]])pour\s+(la\s+commune\s+de\s+)?' || regexp_replace(p.city, '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '([^[:alnum:]]|$)');
  get diagnostics n = row_count;
  raise notice 'Objets corrigés : %', n;
end $$;
