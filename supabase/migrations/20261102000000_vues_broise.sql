-- 2/11 : efface les visites de maquettes comptées avant que les aperçus de Broise soient exclus.
-- Les 3 maquettes ouvertes à ce moment (Dv Energie 59, Les Artisans de la Lys, A.d.h) l'avaient été par Broise.
-- Sans danger si rejouée : ne touche que les maquettes dont la dernière visite date d'avant le 2/11 à 11 h 50 (Paris),
-- donc jamais une visite comptée après la correction.
update public.websites
   set vues = 0, premiere_vue = null, derniere_vue = null
 where derniere_vue is not null
   and derniere_vue < timestamptz '2026-11-02 11:50:00+01';
