-- =====================================================================
-- Devanture — relances et visites des maquettes (30/10)
-- 1. Une seule relance par artisan, 6 jours après le premier e-mail s'il n'a pas répondu (agents/lib/relance.ts).
-- 2. Compteur de visites des maquettes publiques /m/<slug> : combien de fois, première et dernière visite.
--    Aucun cookie, aucune adresse IP, aucun suivi des personnes : un simple compteur par maquette.
-- Appliquée par le workflow « Appliquer une migration ». Ne supprime aucune donnée.
-- =====================================================================

-- 1. Relances --------------------------------------------------------------------------------
alter table public.emails add column if not exists relance_de uuid references public.emails (id) on delete cascade;
create unique index if not exists emails_relance_unique on public.emails (relance_de) where relance_de is not null;

-- 2. Visites des maquettes --------------------------------------------------------------------
alter table public.websites add column if not exists vues integer not null default 0;
alter table public.websites add column if not exists premiere_vue timestamptz;
alter table public.websites add column if not exists derniere_vue timestamptz;

-- Appelée par la page publique, quelques secondes après l'ouverture (les robots anti-virus des messageries, qui
-- ouvrent les liens sans les regarder, ne restent pas : ils ne sont pas comptés). Une visite toutes les 30 minutes
-- au plus par maquette (changer de style ou recharger ne compte pas deux fois).
create or replace function public.maquette_vue(p_slug text)
returns void language sql security definer set search_path = public as $$
  update public.websites w
     set vues = w.vues + case when w.derniere_vue is null or w.derniere_vue < now() - interval '30 minutes' then 1 else 0 end,
         premiere_vue = coalesce(w.premiere_vue, now()),
         derniere_vue = now()
   where w.slug = p_slug and w.kind = 'demo' and length(p_slug) between 3 and 120
$$;
revoke all on function public.maquette_vue(text) from public;
grant execute on function public.maquette_vue(text) to anon, authenticated;
