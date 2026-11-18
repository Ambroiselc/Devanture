-- =====================================================================
-- Devanture — démos de sites (phase 3)
-- À exécuter APRÈS les migrations précédentes, dans Supabase > SQL Editor.
-- Ajoute aux sites web le contenu des démos rédigé par Claude Haiku.
-- La table « websites » a déjà la RLS (réservée aux administrateurs) : rien à changer de ce côté.
-- Ne contient aucun secret.
-- =====================================================================

alter table public.websites
  -- Textes de la démo (titre, prestations, zone…). La page est fabriquée à partir du modèle.
  add column if not exists content jsonb,
  -- Morceau d'adresse lisible pour la future mise en ligne, ex : plomberie-dupont-roubaix-7k2f.
  add column if not exists slug    text;

alter table public.websites drop constraint if exists websites_slug_check;
alter table public.websites add constraint websites_slug_check
  check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

create unique index if not exists websites_slug_unique
  on public.websites (slug) where slug is not null;

-- Une seule démo « vivante » par prospect (les démos archivées ne comptent pas).
create unique index if not exists websites_une_demo_par_prospect
  on public.websites (prospect_id) where kind = 'demo' and status <> 'archive';
