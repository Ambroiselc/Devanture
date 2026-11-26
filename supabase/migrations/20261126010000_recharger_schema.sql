-- 26/11 : la table recherches_independants (migration 20261126000000) n'était pas encore visible pour le tableau de bord
-- (cache de l'API Supabase). Demande à l'API de relire le schéma. Rejouable sans dégât.
notify pgrst, 'reload schema';
