-- 2/11 : remet les deux VRAIES ouvertures de maquettes effacées par 20261102000000_vues_broise.sql
-- (ouvertes juste après leur e-mail du 2/11 : par les artisans, pas par Broise).
-- Sans danger si rejouée : ne touche une maquette que si sa première visite connue est postérieure à l'heure remise
-- (ou absente) ; une visite comptée depuis est gardée et s'ajoute.
with a_remettre(nom, le) as (values
  ('dv energie 59', timestamptz '2026-11-02 11:39:00+01'),
  ('les artisans de la lys', timestamptz '2026-11-02 11:37:00+01'))
update public.websites w
   set vues = w.vues + 1,
       premiere_vue = least(coalesce(w.premiere_vue, r.le), r.le),
       derniere_vue = greatest(coalesce(w.derniere_vue, r.le), r.le)
  from public.prospects p, a_remettre r
 where p.id = w.prospect_id and lower(trim(p.name)) = r.nom
   and w.kind = 'demo' and w.slug is not null
   and (w.premiere_vue is null or w.premiere_vue > r.le);
