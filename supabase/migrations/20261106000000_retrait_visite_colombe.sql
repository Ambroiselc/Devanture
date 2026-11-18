-- 6/11 : retire la visite de la maquette d'Acti Chauff'59 du 2/11 à 14 h 32. Ce n'était pas l'artisan mais Colombe
-- (contact de chauffe), qui a ouvert la copie de chauffe envoyée par Broise à 10 h 53 depuis son iPhone (confirmé par
-- Broise le 3/11 et par les journaux Cloudflare). Les comptes de la vue d'ensemble, de la page Valérie, du bilan et
-- l'ordre de priorité des relances lisent tous websites.vues / premiere_vue / derniere_vue.
-- Sans danger si rejouée : ne touche la maquette que si sa seule visite est celle-là (une visite plus récente, donc
-- peut-être de l'artisan lui-même, la laisse intacte).
with m as (
  select w.id from public.websites w join public.prospects p on p.id = w.prospect_id
   where w.kind = 'demo' and p.name = 'Acti Chauff''59' and w.vues = 1
     and w.derniere_vue between timestamptz '2026-11-02 14:00:00+01' and timestamptz '2026-11-02 15:00:00+01')
update public.websites w set vues = 0, premiere_vue = null, derniere_vue = null from m where w.id = m.id;

delete from public.maquette_visites v using public.websites w, public.prospects p
 where v.website_id = w.id and p.id = w.prospect_id and w.kind = 'demo' and p.name = 'Acti Chauff''59'
   and v.debut between timestamptz '2026-11-02 14:00:00+01' and timestamptz '2026-11-02 15:00:00+01';
