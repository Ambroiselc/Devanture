-- 26/11 : la table recherches_independants (migration 20261126000000) n'était pas lisible par le tableau de bord :
-- il manquait les droits (comme pour maquette_interets). Rejouable sans dégât.
revoke all on public.recherches_independants from anon;
grant select on public.recherches_independants to authenticated;
grant select, insert, update, delete on public.recherches_independants to service_role;
notify pgrst, 'reload schema';
