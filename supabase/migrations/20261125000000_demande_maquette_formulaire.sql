-- 25/11 : formulaire « Recevoir ma maquette gratuite » du site vitrine (devanture-artisans.fr), à la place du lien
-- mailto (qui ne marchait pas sans application de messagerie). Le site envoie la demande à POST /api/demande-maquette
-- (app.devanture-artisans.fr), qui appelle cette fonction. La demande arrive dans la boîte mail du tableau de bord
-- comme un e-mail reçu de l'artisan (mailbox_messages, statut « nouveau ») : Inès la trie et prépare la réponse,
-- exactement comme pour un e-mail envoyé à contact@. Garde-fous : champs obligatoires, au plus 20 demandes par heure
-- en tout, une seule par adresse toutes les 10 minutes.

create or replace function public.demande_maquette(
  p_commerce text, p_metier text, p_ville text, p_email text, p_telephone text, p_message text, p_formule text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_commerce text := left(trim(coalesce(p_commerce, '')), 120);
  v_metier text := left(trim(coalesce(p_metier, '')), 80);
  v_ville text := left(trim(coalesce(p_ville, '')), 120);
  v_tel text := left(trim(coalesce(p_telephone, '')), 40);
  v_message text := left(trim(coalesce(p_message, '')), 3000);
  v_formule text := left(trim(coalesce(p_formule, '')), 20);
  v_corps text;
begin
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or v_commerce = '' or v_metier = '' or v_ville = '' then
    return jsonb_build_object('ok', false, 'raison', 'incomplet');
  end if;
  if (select count(*) from public.mailbox_messages
      where message_id like 'formulaire-%' and created_at > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('ok', false, 'raison', 'trop');
  end if;
  -- Double clic ou renvoi : déjà reçu, on répond « ok » sans l'enregistrer deux fois.
  if exists (select 1 from public.mailbox_messages
             where message_id like 'formulaire-%' and from_email = v_email and created_at > now() - interval '10 minutes') then
    return jsonb_build_object('ok', true, 'reveiller', false);
  end if;

  v_corps := 'Demande envoyée depuis le formulaire du site devanture-artisans.fr.' || E'\n\n'
    || 'Commerce : ' || v_commerce || E'\n'
    || 'Métier : ' || v_metier || E'\n'
    || 'Ville : ' || v_ville || E'\n'
    || 'E-mail : ' || v_email || E'\n'
    || 'Téléphone : ' || coalesce(nullif(v_tel, ''), '(non indiqué)') || E'\n'
    || case when v_formule <> '' then 'Formule regardée : ' || v_formule || E'\n' else '' end
    || E'\n' || coalesce(nullif(v_message, ''), 'J''aimerais voir à quoi pourrait ressembler le site de mon commerce.');

  insert into public.mailbox_messages
    (direction, status, from_email, from_name, to_email, subject, body_text, message_id, received_at)
  values
    ('entrant', 'nouveau', v_email, v_commerce, 'contact@devanture-artisans.fr',
     'Ma maquette gratuite' || case when v_formule <> '' then ' (formule ' || v_formule || ')' else '' end
       || ' : ' || v_commerce,
     v_corps, 'formulaire-' || gen_random_uuid()::text, now());

  return jsonb_build_object('ok', true, 'reveiller', true);
end;
$$;

revoke all on function public.demande_maquette(text, text, text, text, text, text, text) from public;
grant execute on function public.demande_maquette(text, text, text, text, text, text, text) to anon, authenticated;
