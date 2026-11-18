-- 5/11 : ajoute les visites COURTES de maquettes (moins de 4 s) faites depuis le début du compteur (30/10),
-- retrouvées dans les journaux Cloudflare (workflow « Diagnostic du tableau de bord ») : la page a été ouverte
-- par un vrai navigateur, mais quittée avant 4 s, donc jamais comptée. Le compteur passe à 1,5 s à partir du 5/11.
-- Écartées : visites de Broise (connecté ou ?apercu=1), de Colombe (A-D-H Amélioration de l'Habitat, Acti Chauff'59),
-- et un robot (Kbane, 4/11 11 h 40, Linux, 2 min avant la vraie visite).
-- Sans danger si rejouée : une visite n'est ajoutée que si la maquette n'a pas déjà une visite à cette heure ou après.
with a_ajouter(slug, le) as (values
  ('fred-bati-renov-hoymille-f08f',     timestamptz '2026-11-02 16:39:54+01'),  -- 1re ouverture (Firefox, Windows)
  ('jordane-vasseur-tourcoing-8ixr',    timestamptz '2026-11-02 16:05:44+01'),  -- 2e visite, iPhone
  ('ab-clim-chauffage-tourcoing-oh28',  timestamptz '2026-11-03 14:56:14+01'))  -- 2e visite, iPhone
update public.websites w
   set vues = coalesce(w.vues, 0) + 1,
       premiere_vue = least(coalesce(w.premiere_vue, r.le), r.le),
       derniere_vue = greatest(coalesce(w.derniere_vue, r.le), r.le)
  from a_ajouter r
 where w.slug = r.slug and w.kind = 'demo'
   and (w.derniere_vue is null or w.derniere_vue < r.le);
