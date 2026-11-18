-- =====================================================================
-- Devanture — Loïc couvre toute la métropole lilloise et plus de métiers
-- À exécuter APRÈS 20261022010000_reglages_loic.sql, dans Supabase > SQL Editor.
-- Ne contient aucun secret et ne supprime aucune donnée.
-- =====================================================================

-- Communes prospectées en automatique (codes INSEE). Vide (null) = toutes les communes connues de Loïc.
alter table public.agent_settings add column if not exists communes text[];

-- Les 3 métiers du départ deviennent les 11 métiers (si tu ne les as pas déjà modifiés).
update public.agent_settings
   set metiers = array['plombier', 'electricien', 'couvreur', 'peintre', 'menuisier', 'serrurier',
                       'macon', 'carreleur', 'plaquiste', 'climatisation', 'paysagiste']
 where agent = 'prospection'
   and metiers = array['plombier', 'electricien', 'couvreur'];

-- La rotation automatique cherche le dernier passage de chaque métier dans chaque commune.
create index if not exists tasks_prospection_input_idx
  on public.tasks ((input->>'metier'), (input->>'commune'))
  where agent = 'prospection';
