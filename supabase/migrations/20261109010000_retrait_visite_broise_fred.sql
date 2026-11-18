-- 9/11 : retire la visite de la maquette de Fred Bati Renov faite par Broise vers 11 h 08 (lien devanture-sites.fr/m/…
-- donné sans « ?apercu=1 » pendant la vérification du domaine aligné ; sur devanture-sites.fr, la connexion au tableau de
-- bord n'est pas reconnue). Sans danger si rejouée : ne fait rien si la dernière ouverture n'est pas dans ce créneau.
with m as (
  select w.id from public.websites w join public.prospects p on p.id = w.prospect_id
   where w.kind = 'demo' and p.name = 'Fred Bati Renov' and w.vues > 0
     and w.derniere_vue between timestamptz '2026-11-09 11:00:00+01' and timestamptz '2026-11-09 11:30:00+01'),
supprimees as (
  delete from public.maquette_visites v using m
   where v.website_id = m.id
     and v.debut between timestamptz '2026-11-09 11:00:00+01' and timestamptz '2026-11-09 11:30:00+01'
  returning v.website_id)
update public.websites w
   set vues = greatest(w.vues - 1, 0),
       derniere_vue = coalesce(
         (select max(v.debut) from public.maquette_visites v
           where v.website_id = w.id and v.debut < timestamptz '2026-11-09 11:00:00+01'),
         case when w.vues - 1 > 0 then w.premiere_vue end),
       premiere_vue = case when w.vues - 1 > 0 then w.premiere_vue end
  from m where w.id = m.id;
