-- 13/11, décisions de Broise après le bilan sans les robots (0 maquette ouverte sur 105 premiers e-mails avec photo ;
-- version A 9 sur 66 sans photo, version B 1 sur 54) :
-- 1. plus aucune photo dans les e-mails pas encore partis ;
-- 2. nouvelle version C (très courte), la B n'est plus écrite (ses e-mails en attente sont réécrits en C) ;
-- 3. bouton « Ce site m'intéresse » en haut des maquettes : l'artisan se manifeste en un clic (numéro facultatif).

-- 1. Photos
update public.emails set with_image = false
 where sent_at is null and status in ('a_valider', 'valide') and coalesce(with_image, false);

-- 2. Version C
alter table public.emails drop constraint if exists emails_variant_check;
alter table public.emails add constraint emails_variant_check check (variant is null or variant in ('A', 'B', 'C'));

-- 3. Intérêts déclarés depuis une maquette
create table if not exists public.maquette_interets (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references public.websites(id) on delete cascade,
  prospect_id uuid references public.prospects(id) on delete cascade,
  cree_le timestamptz not null default now(),
  telephone text check (telephone is null or length(telephone) <= 30),
  message text check (message is null or length(message) <= 1000),
  style text,
  appareil text,
  notifie_le timestamptz,
  traite_le timestamptz
);
create index if not exists maquette_interets_cree on public.maquette_interets (cree_le desc);
alter table public.maquette_interets enable row level security;
revoke all on public.maquette_interets from anon;
grant select, update, delete on public.maquette_interets to authenticated;
grant select, insert, update, delete on public.maquette_interets to service_role;
drop policy if exists maquette_interets_admin on public.maquette_interets;
create policy maquette_interets_admin on public.maquette_interets for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Appelée sans connexion par /m/<slug>/interet. Au plus 5 par maquette et par jour. Renvoie vrai si c'est enregistré.
create or replace function public.maquette_interet(p_slug text, p_telephone text, p_message text, p_style text, p_appareil text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_site uuid; v_prospect uuid; v_n integer;
begin
  select w.id, w.prospect_id into v_site, v_prospect from public.websites w
   where w.slug = p_slug and w.kind = 'demo' and length(p_slug) between 3 and 120;
  if v_site is null then return false; end if;
  select count(*) into v_n from public.maquette_interets where website_id = v_site and cree_le > now() - interval '1 day';
  if v_n >= 5 then return false; end if;
  insert into public.maquette_interets (website_id, prospect_id, telephone, message, style, appareil)
  values (v_site, v_prospect,
          nullif(left(regexp_replace(coalesce(p_telephone, ''), '[^0-9+ .()-]', '', 'g'), 30), ''),
          nullif(left(trim(coalesce(p_message, '')), 1000), ''),
          case when p_style in ('pro', 'chaleureux') then p_style end,
          case when p_appareil in ('telephone', 'ordinateur') then p_appareil end);
  return true;
end $$;
revoke all on function public.maquette_interet(text, text, text, text, text) from public;
grant execute on function public.maquette_interet(text, text, text, text, text) to anon, authenticated;
