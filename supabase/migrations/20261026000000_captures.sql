-- =====================================================================
-- Devanture — captures des maquettes et test « avec / sans image » (26/10)
-- À exécuter APRÈS 20261023010000_valerie.sql, dans Supabase > SQL Editor.
-- Ne contient aucun secret et ne supprime aucune donnée.
-- =====================================================================

-- Capture de chaque maquette (vue téléphone, JPEG d'environ 100 Ko), faite par Sid.
-- Gardée dans la base pour l'instant (gratuit, sans nouvelle clé) ; à déplacer vers un stockage de fichiers
-- si le volume dépasse quelques milliers de maquettes.
create table if not exists public.website_captures (
  website_id  uuid primary key references public.websites (id) on delete cascade,
  image       bytea not null,
  mime        text not null default 'image/jpeg',
  width       integer not null,
  height      integer not null,
  created_at  timestamptz not null default now()
);

alter table public.website_captures enable row level security;
drop policy if exists "admins_website_captures" on public.website_captures;
create policy "admins_website_captures" on public.website_captures for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.website_captures from anon;
grant select, insert, update, delete on public.website_captures to authenticated;

-- E-mail envoyé avec l'image de la maquette, ou sans (test, en plus des versions A et B).
alter table public.emails add column if not exists with_image boolean;

-- Les e-mails déjà rédigés : une moitié de chaque version avec image, l'autre sans.
with r as (
  select id, row_number() over (partition by variant order by created_at, id) as n
  from public.emails where with_image is null and variant is not null
)
update public.emails e set with_image = (r.n % 2 = 1) from r where e.id = r.id;
