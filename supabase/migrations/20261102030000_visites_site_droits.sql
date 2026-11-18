-- 2/11 : droits oubliés sur site_visites (« permission denied for table site_visites » sur la vue d'ensemble).
-- Le tableau de bord (connecté) lit la table, protégée par la règle is_admin() ; les visiteurs n'y ont jamais accès
-- directement : ils passent par public.site_vue (security definer). Sans danger si rejouée.
revoke all on public.site_visites from anon;
grant select, insert, update, delete on public.site_visites to authenticated;
grant select, insert, update, delete on public.site_visites to service_role;
