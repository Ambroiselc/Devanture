-- =====================================================================
-- Devanture — Coco renvoie chaque problème au bon agent (30/10)
-- Quand Coco garde un e-mail, elle dit d'où vient le problème :
--   email    → le texte est à revoir : Valérie le réécrit (avec la remarque de Coco) ;
--   maquette → la maquette ne correspond pas à l'artisan (mauvais métier…) : Sid la refait ;
--   artisan  → ce n'est pas une cible (pas un artisan, enseigne, fermé…) : on l'écarte ;
--   autre    → à Broise de voir (doublon, artisan qui a déjà écrit…).
-- Broise choisit l'action sur la page /coco. Appliquée par le workflow « Appliquer une migration ».
-- Ne supprime aucune donnée.
-- =====================================================================
alter table public.emails add column if not exists coco_cause text;
alter table public.emails drop constraint if exists emails_coco_cause_check;
alter table public.emails add constraint emails_coco_cause_check
  check (coco_cause is null or coco_cause in ('email', 'maquette', 'artisan', 'autre'));
-- Le métier que Coco pense être le bon (libellé de agents/lib/metiers.ts), quand la maquette s'est trompée de métier.
alter table public.emails add column if not exists coco_metier text check (coco_metier is null or char_length(coco_metier) <= 60);

-- Un texte modifié par quelqu'un d'autre doit être relu de nouveau : on efface aussi la cause.
create or replace function public.coco_relire_si_modifie()
returns trigger language plpgsql set search_path = public as $$
begin
  if (new.subject is distinct from old.subject or new.body is distinct from old.body)
     and new.coco_le is not distinct from old.coco_le then
    new.coco_verdict := null;
    new.coco_avis := null;
    new.coco_le := null;
    new.coco_cause := null;
    new.coco_metier := null;
  end if;
  return new;
end $$;
