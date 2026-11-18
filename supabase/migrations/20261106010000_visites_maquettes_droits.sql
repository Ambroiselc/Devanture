-- 6/11 : le tableau de bord (rôle « authenticated », avec la règle is_admin()) n'avait pas le droit de lire
-- maquette_visites : la migration du 5/11 avait oublié ce « grant », que ce projet donne table par table.
-- Résultat : les durées étaient bien enregistrées, mais le tableau de bord affichait « sans durée mesurée ».
grant select, delete on public.maquette_visites to authenticated;
grant select, insert, update, delete on public.maquette_visites to service_role;
