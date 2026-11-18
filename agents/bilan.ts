// Bilan complet du projet (30/10), EN LECTURE SEULE : prospects, e-mails, envois par jour et par boîte, rebonds,
// réponses, oppositions, clients, coûts d'IA. Lancé par le workflow bilan.yml (à la main, ou quand tests/bilan.txt change).
// Le résultat sort en « notice » GitHub (lisible par l'API) et dans le résumé du lancement. N'écrit rien dans la base.
import { connecter } from "./lib/db.ts";
import { ajouterResume, colonneSensible } from "./lib/sortie-publique.ts";

const sql = connecter();
const lignes: string[] = [];
const t = (titre: string, rows: Record<string, unknown>[]) => {
  lignes.push(`## ${titre}`);
  if (rows.length === 0) lignes.push("(rien)");
  // 18/11 (dépôt public) : les colonnes « artisan » (nom, ville, texte, objet…) ne sortent jamais dans le journal.
  for (const r of rows) lignes.push(Object.entries(r).map(([k, v]) => (colonneSensible(k) ? "•" : v instanceof Date ? v.toISOString() : String(v))).join(" | "));
};
try {
  t("Prospects par statut (hors fictifs)", await sql`
    select status, count(*)::int n, count(*) filter (where email is not null)::int avec_email
    from public.prospects where is_demo = false group by 1 order by 2 desc`);
  // 10/11 : production de Loïc → Sid → Valérie par jour, à comparer aux premiers e-mails envoyés.
  t("Production par jour (jour | prospects créés | avec e-mail | écartés | gardés | maquettes faites | 1ers e-mails rédigés | 1ers e-mails envoyés)", await sql`
    with j as (select generate_series((now() at time zone 'Europe/Paris')::date - 13, (now() at time zone 'Europe/Paris')::date, '1 day')::date d)
    select to_char(j.d, 'YYYY-MM-DD Dy') jour,
      (select count(*) from public.prospects p where p.is_demo = false and (p.created_at at time zone 'Europe/Paris')::date = j.d)::int crees,
      (select count(*) from public.prospects p where p.is_demo = false and p.email is not null and (p.created_at at time zone 'Europe/Paris')::date = j.d)::int avec_email,
      (select count(*) from public.prospects p where p.is_demo = false and p.status = 'ecarte' and (p.created_at at time zone 'Europe/Paris')::date = j.d)::int ecartes,
      (select count(*) from public.prospects p where p.is_demo = false and p.status <> 'ecarte' and p.email is not null and (p.created_at at time zone 'Europe/Paris')::date = j.d)::int gardes,
      (select count(*) from public.websites w where w.kind = 'demo' and (w.created_at at time zone 'Europe/Paris')::date = j.d)::int maquettes,
      (select count(*) from public.emails e where e.relance_de is null and (e.created_at at time zone 'Europe/Paris')::date = j.d)::int rediges,
      (select count(*) from public.emails e where e.relance_de is null and e.sent_at is not null and (e.sent_at at time zone 'Europe/Paris')::date = j.d)::int envoyes
    from j order by j.d`);
  t("Stock prêt à partir (premiers e-mails validés | à valider | maquettes prêtes sans e-mail | prospects gardés sans maquette)", await sql`
    select (select count(*) from public.emails where relance_de is null and status = 'valide' and sent_at is null)::int valides,
      (select count(*) from public.emails where relance_de is null and status = 'a_valider')::int a_valider,
      (select count(*) from public.prospects p where p.is_demo = false and p.status = 'demo_prete'
         and not exists (select 1 from public.emails e where e.prospect_id = p.id and e.relance_de is null))::int maquettes_sans_email,
      (select count(*) from public.prospects p where p.is_demo = false and p.status in ('nouveau', 'qualifie') and p.email is not null)::int sans_maquette`);
  t("Prospects : source, métier (top 12)", await sql`
    select coalesce(source, '?') source, coalesce(category, '?') metier, count(*)::int n
    from public.prospects where is_demo = false group by 1, 2 order by 3 desc limit 12`);
  t("Prospects : départements (top 10)", await sql`
    select left(coalesce(postal_code, '??'), 2) dep, count(*)::int n
    from public.prospects where is_demo = false group by 1 order by 2 desc limit 10`);
  t("Maquettes (sites de démo) par statut", await sql`
    select status, count(*)::int n from public.websites where kind = 'demo' and is_demo = false group by 1 order by 2 desc`);
  t("E-mails de prospection par statut", await sql`
    select status, count(*)::int n from public.emails where is_demo = false group by 1 order by 2 desc`);
  t("Envois par jour et par canal (heure de Paris)", await sql`
    select to_char(sent_at at time zone 'Europe/Paris', 'YYYY-MM-DD Dy') jour, coalesce(sender, 'resend') canal, count(*)::int n
    from public.emails where sent_at is not null and is_demo = false group by 1, 2 order by 1, 2`);
  t("Livraison (dernier état connu)", await sql`
    select coalesce(delivery_status, '(inconnu)') etat, count(*)::int n
    from public.emails where sent_at is not null and is_demo = false group by 1 order by 2 desc`);
  t("Envoyés : version A/B, avec ou sans image", await sql`
    select coalesce(variant, '?') version, coalesce(with_image::text, '?') image, count(*)::int n,
           count(*) filter (where status = 'repondu')::int repondus
    from public.emails where sent_at is not null and is_demo = false group by 1, 2 order by 1, 2`);
  t("Premier et dernier envoi", await sql`
    select min(sent_at) premier, max(sent_at) dernier, count(*)::int total,
           count(distinct prospect_id)::int artisans_contactes
    from public.emails where sent_at is not null and is_demo = false`);
  t("Boîte mail : messages reçus par catégorie", await sql`
    select coalesce(category, '(pas encore trié)') categorie, count(*)::int n,
           count(*) filter (where prospect_id is not null)::int lies_a_un_prospect
    from public.mailbox_messages where direction = 'entrant' and is_demo = false group by 1 order by 2 desc`);
  // 12/11 : prospects dont le 1er e-mail est parti par Resend (26-28/10) : relancés ou non, et pourquoi.
  t("Contactés par Resend : situation de la relance (situation | prospects)", await sql`
    with o as (
      select distinct on (e.prospect_id) e.id, e.prospect_id, e.sent_at
      from public.emails e
      where e.is_demo = false and e.relance_de is null and e.sent_at is not null and coalesce(e.sender, 'resend') = 'resend'
      order by e.prospect_id, e.sent_at)
    select case
        when exists (select 1 from public.emails r where r.relance_de = o.id and r.sent_at is not null) then '1. relance partie'
        when exists (select 1 from public.opposition_list ol join public.prospects p on p.id = o.prospect_id
                     where lower(ol.email) = lower(p.email)) then '2. pas relancé : désinscrit / adresse invalide'
        when exists (select 1 from public.mailbox_messages m where m.prospect_id = o.prospect_id and m.direction = 'entrant'
                     and coalesce(m.category, '') not in ('automatique', 'spam', 'chauffe')) then '3. pas relancé : a répondu'
        when (select p.status from public.prospects p where p.id = o.prospect_id) <> 'contacte'
          then '4. pas relancé : statut ' || (select p.status from public.prospects p where p.id = o.prospect_id)
        when exists (select 1 from public.emails r where r.relance_de = o.id and r.sent_at is null)
          then '5. relance prête, pas encore partie (' || (select string_agg(distinct r.status, '/') from public.emails r where r.relance_de = o.id and r.sent_at is null) || ')'
        else '6. aucune relance préparée'
      end situation, count(*)::int prospects
    from o group by 1 order by 1`);
  t("Contacté par Resend mais statut changé (artisan | statut | 1er e-mail | notes | e-mails : statut/envoyé)", await sql`
    select p.name, p.status, to_char(min(e.sent_at) at time zone 'Europe/Paris', 'DD/MM HH24:MI') premier,
           right(coalesce(p.notes, ''), 300) notes,
           (select string_agg(x.status || '/' || coalesce(to_char(x.sent_at at time zone 'Europe/Paris', 'DD/MM'), '-') || coalesce('/relance', case when x.relance_de is null then '' end), ', ' order by x.created_at)
              from public.emails x where x.prospect_id = p.id) emails,
           (select string_agg(w.status || ' ' || to_char(w.created_at at time zone 'Europe/Paris', 'DD/MM'), ', ') from public.websites w where w.prospect_id = p.id and w.kind = 'demo') maquettes
    from public.emails e join public.prospects p on p.id = e.prospect_id
    where e.is_demo = false and e.relance_de is null and e.sent_at is not null and coalesce(e.sender, 'resend') = 'resend'
      and p.status <> 'contacte'
    group by p.id, p.name, p.status, p.notes`);
  // 10/11 : derniers messages reçus encore dans « Reçus » (pas rangés automatique / spam / chauffe), pour repérer les robots.
  // 10/11 : détail des adresses invalides (rebonds et domaines sans messagerie), pour savoir lesquelles.
  t("Adresses invalides (date | entreprise | domaine | raison)", await sql`
    select to_char(created_at at time zone 'Europe/Paris', 'MM-DD HH24:MI') quand, coalesce(business_name, '?') entreprise,
           coalesce(split_part(email, '@', 2), domain) domaine, coalesce(notes, '') raison
    from public.opposition_list where reason = 'adresse_invalide' and is_demo = false order by created_at desc limit 10`);
  t("Boîte mail : 15 derniers reçus pas rangés (date | expéditeur | objet | catégorie | statut | lié à un prospect)", await sql`
    select to_char(coalesce(received_at, created_at) at time zone 'Europe/Paris', 'MM-DD HH24:MI') recu,
           case when prospect_id is null then from_email else '(artisan)' end de, left(coalesce(subject, ''), 70) objet,
           coalesce(category, '?') categorie, status, prospect_id is not null lie
    from public.mailbox_messages
    where direction = 'entrant' and is_demo = false and coalesce(category, '') not in ('automatique', 'spam', 'chauffe')
    order by coalesce(received_at, created_at) desc limit 15`);
  t("Boîte mail : reçus liés à un prospect contacté (détail, sans adresse)", await sql`
    select to_char(coalesce(m.received_at, m.created_at) at time zone 'Europe/Paris', 'YYYY-MM-DD HH24:MI') recu,
           coalesce(m.category, '?') categorie, left(coalesce(m.summary, m.subject), 90) resume
    from public.mailbox_messages m
    where m.direction = 'entrant' and m.is_demo = false and m.prospect_id is not null
      and coalesce(m.category, '') not in ('automatique', 'spam', 'chauffe')
    order by 1 desc limit 15`);
  t("Boîte mail : réponses envoyées", await sql`
    select status, coalesce(sent_by, '?') par, count(*)::int n
    from public.mailbox_messages where direction = 'sortant' and is_demo = false group by 1, 2 order by 3 desc`);
  t("Liste d'opposition par motif", await sql`
    select coalesce(reason, '?') motif, count(*)::int n from public.opposition_list group by 1 order by 2 desc`);
  t("Clients par étape", await sql`select etape, count(*)::int n from public.clients group by 1`.catch(() => []));
  t("Paiements Stripe relevés", await sql`select statut, count(*)::int n from public.paiements_stripe group by 1`.catch(() => []));
  t("Coûts enregistrés (depuis le début)", await sql`
    select category, round(sum(amount_eur)::numeric, 2)::text total from public.costs where is_demo = false group by 1`);
  // 3/11 : ouvertures de maquettes (compteur fiable depuis le 2/11 11 h 50 : visites de Broise exclues).
  const PROPRE = "2026-11-02 11:50:00+01";
  t("Ouvertures : e-mails partis depuis le 2/11 11 h 50 (type | envoyés | maquette ouverte après l'envoi)", await sql`
    select case when e.relance_de is null then 'premier' else 'relance' end type, count(*)::int envoyes,
           count(*) filter (where w.derniere_vue >= e.sent_at)::int ouverts
    from public.emails e left join public.websites w on w.id = e.website_id
    where e.sent_at >= ${PROPRE}::timestamptz and e.is_demo = false group by 1 order by 1`);
  t("Ouvertures : premiers e-mails depuis le 2/11 11 h 50 par version et image (version | image | envoyés | ouverts)", await sql`
    select coalesce(e.variant, '?') v, coalesce(e.with_image::text, '?') img, count(*)::int envoyes,
           count(*) filter (where w.derniere_vue >= e.sent_at)::int ouverts
    from public.emails e left join public.websites w on w.id = e.website_id
    where e.sent_at >= ${PROPRE}::timestamptz and e.relance_de is null and e.is_demo = false group by 1, 2 order by 1, 2`);
  t("Ouvertures : par jour d'envoi des premiers e-mails (jour | envoyés | ouverts un jour)", await sql`
    select to_char(e.sent_at at time zone 'Europe/Paris', 'YYYY-MM-DD') jour, count(*)::int envoyes,
           count(*) filter (where w.premiere_vue is not null)::int ouverts
    from public.emails e left join public.websites w on w.id = e.website_id
    where e.sent_at is not null and e.relance_de is null and e.is_demo = false group by 1 order by 1`);
  t("Ouvertures : détail (artisan | ville | version | visites | 1re vue | dernière vue | dernier e-mail | relance ?)", await sql`
    select p.name, coalesce(p.city, '?') ville, coalesce(max(e.variant), '?') v, w.vues,
           to_char(w.premiere_vue at time zone 'Europe/Paris', 'MM-DD HH24:MI') premiere,
           to_char(w.derniere_vue at time zone 'Europe/Paris', 'MM-DD HH24:MI') derniere,
           to_char(max(e.sent_at) at time zone 'Europe/Paris', 'MM-DD HH24:MI') dernier_envoi,
           bool_or(e.relance_de is not null and e.sent_at <= w.derniere_vue)::text apres_relance
    from public.websites w join public.prospects p on p.id = w.prospect_id
    join public.emails e on e.website_id = w.id and e.sent_at is not null
    where w.kind = 'demo' and w.vues > 0 and w.is_demo = false
    group by p.name, p.city, w.vues, w.premiere_vue, w.derniere_vue order by w.derniere_vue desc limit 40`);
  t("Ouvertures : délai entre l'envoi et l'ouverture (premiers e-mails depuis le 2/11 11 h 50, en heures)", await sql`
    select round(extract(epoch from (w.premiere_vue - e.sent_at)) / 3600, 1)::text heures
    from public.emails e join public.websites w on w.id = e.website_id
    where e.sent_at >= ${PROPRE}::timestamptz and e.relance_de is null and w.premiere_vue >= e.sent_at and e.is_demo = false
    order by 1`);
  t("Relances envoyées (total | depuis le 2/11 11 h 50)", await sql`
    select count(*)::int total, count(*) filter (where sent_at >= ${PROPRE}::timestamptz)::int recentes
    from public.emails where relance_de is not null and sent_at is not null and is_demo = false`);
  t("Site vitrine : visites par source depuis le 2/11", await sql`
    select source, sum(visites)::int n from public.site_visites where jour >= '2026-11-02' group by 1 order by 2 desc`.catch(() => []));
  // 3/11 : échanges complets avec les artisans qui ont écrit (hors réponses automatiques), sans leurs adresses.
  t("Échanges avec les artisans qui ont écrit (date | sens | boîte | image | objet | texte)", await sql`
    with qui as (
      select distinct prospect_id from public.mailbox_messages
      where direction = 'entrant' and is_demo = false and prospect_id is not null
        and coalesce(category, '') not in ('automatique', 'spam', 'chauffe'))
    select to_char(x.quand at time zone 'Europe/Paris', 'MM-DD HH24:MI') quand, x.sens, x.boite, x.image, x.objet,
           regexp_replace(left(x.texte, 1400), '[[:space:]]+', ' ', 'g') texte
    from (
      select e.prospect_id, e.sent_at quand, 'envoyé' sens, coalesce(e.sender, 'resend') boite,
             coalesce(e.with_image::text, '?') image, e.subject objet, e.body texte
      from public.emails e join qui using (prospect_id) where e.sent_at is not null
      union all
      select m.prospect_id, coalesce(m.received_at, m.created_at), case when m.direction = 'entrant' then 'reçu' else 'réponse' end,
             'artisan', coalesce(m.summary, ''), m.subject,
             coalesce(nullif(m.body_text, ''), regexp_replace(coalesce(m.body_html, ''), '<[^>]+>', ' ', 'g'))
      from public.mailbox_messages m join qui using (prospect_id) where m.is_demo = false
    ) x join public.prospects p on p.id = x.prospect_id
    order by p.name, x.quand`);
  t("Ouvertures depuis lundi 2/11 0 h (type | envoyés | ouverts après l'envoi)", await sql`
    select case when e.relance_de is null then 'premier' else 'relance' end type, count(*)::int envoyes,
           count(*) filter (where w.derniere_vue >= e.sent_at)::int ouverts
    from public.emails e left join public.websites w on w.id = e.website_id
    where e.sent_at >= '2026-11-02 00:00:00+01'::timestamptz and e.is_demo = false group by 1 order by 1`);
  t("Relances par statut et avis de Coco (statut | avis | nombre | 1er e-mail par)", await sql`
    select r.status, coalesce(r.coco_verdict, '-') avis, count(*)::int n, coalesce(o.sender, 'resend') premier_par
    from public.emails r join public.emails o on o.id = r.relance_de
    where r.is_demo = false group by 1, 2, 4 order by 1, 2`);
  t("Relances gardées par Coco (artisan | avis)", await sql`
    select p.name, left(coalesce(r.coco_avis, ''), 200) avis from public.emails r join public.prospects p on p.id = r.prospect_id
    where r.relance_de is not null and r.status = 'a_valider' and r.is_demo = false order by r.created_at limit 15`);
  t("Premiers e-mails envoyés par jour, et combien ont déjà leur relance (jour | envoyés | relance préparée | relance partie)", await sql`
    select to_char(o.sent_at at time zone 'Europe/Paris', 'YYYY-MM-DD') jour, count(*)::int envoyes,
           count(r.id)::int preparee, count(r.sent_at)::int partie
    from public.emails o left join public.emails r on r.relance_de = o.id
    where o.relance_de is null and o.sent_at is not null and o.is_demo = false group by 1 order by 1`);
  t("Journal des vagues d'envoi d'aujourd'hui (heure | niveau | message)", await sql`
    select to_char(ev.created_at at time zone 'Europe/Paris', 'HH24:MI') h, ev.level, regexp_replace(left(ev.message, 220), '^[^:]{1,80} : ', '… : ') m
    from public.task_events ev join public.tasks tk on tk.id = ev.task_id
    where tk.agent = 'email' and tk.title ilike '%envoi%' and ev.created_at >= date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'
      and (ev.message ilike '%relance%' or ev.message ilike '%coco%' or ev.message ilike '%quota%' or ev.level <> 'info')
    order by ev.created_at limit 40`);
  t("Messages reçus rangés automatique / spam, 3 derniers jours (heure | de | objet | catégorie | auto | texte | html | début)", await sql`
    select to_char(created_at at time zone 'Europe/Paris', 'DD/MM HH24:MI') h, from_email de, left(subject, 60) objet, category,
           auto_submitted auto, length(coalesce(body_text, ''))::int texte, (body_html is not null) html,
           left(regexp_replace(coalesce(body_text, ''), '[[:space:]]+', ' ', 'g'), 140) debut_texte
    from public.mailbox_messages
    where direction = 'entrant' and category in ('automatique', 'spam') and created_at > now() - interval '3 days'
    order by created_at desc limit 25`);
  // 6/11 : ouvertures comptées par artisan depuis que le compteur marche, selon le point de départ choisi.
  for (const [nom, depuis] of [["30/10 14 h 30 (compteur en place)", "2026-10-30 14:30:00+01"], ["2/11 0 h", "2026-11-02 00:00:00+01"], ["2/11 11 h 50 (tes visites exclues)", "2026-11-02 11:50:00+01"]] as const) {
    t(`Artisans contactés depuis le ${nom} (artisans | ouverts après un e-mail de la période | dont 1er e-mail dans la période | ouverts parmi eux | dont seulement une relance | ouverts parmi eux)`, await sql`
      with c as (
        select e.prospect_id, min(e.sent_at) premier_contact,
               bool_or(e.relance_de is null) a_premier
        from public.emails e where e.sent_at >= ${depuis}::timestamptz and e.is_demo = false group by 1)
      select count(*)::int artisans,
             count(*) filter (where w.derniere_vue >= c.premier_contact)::int ouverts,
             count(*) filter (where c.a_premier)::int premiers,
             count(*) filter (where c.a_premier and w.derniere_vue >= c.premier_contact)::int ouverts_premiers,
             count(*) filter (where not c.a_premier)::int relances_seules,
             count(*) filter (where not c.a_premier and w.derniere_vue >= c.premier_contact)::int ouverts_relances
      from c left join public.websites w on w.prospect_id = c.prospect_id and w.kind = 'demo'`);
  }
  t("Ouvertures par e-mail depuis le 30/10 14 h 30 (type | envoyés | ouverts avant le message suivant au même artisan)", await sql`
    with e as (
      select e.id, e.prospect_id, e.sent_at, e.relance_de,
             lead(e.sent_at) over (partition by e.prospect_id order by e.sent_at) suivant
      from public.emails e where e.sent_at is not null and e.is_demo = false)
    select case when e.relance_de is null then 'premier' else 'relance' end type, count(*)::int envoyes,
           count(*) filter (where (w.premiere_vue >= e.sent_at and w.premiere_vue < coalesce(e.suivant, now()))
                              or (w.derniere_vue >= e.sent_at and w.derniere_vue < coalesce(e.suivant, now())))::int ouverts
    from e left join public.websites w on w.prospect_id = e.prospect_id and w.kind = 'demo'
    where e.sent_at >= '2026-10-30 14:30:00+01'::timestamptz group by 1 order by 1`);
  t("Maquettes ouvertes, détail (artisan | visites | 1re vue | dernière vue | 1er e-mail | relance)", await sql`
    select p.name, w.vues, to_char(w.premiere_vue at time zone 'Europe/Paris', 'DD/MM HH24:MI') premiere,
           to_char(w.derniere_vue at time zone 'Europe/Paris', 'DD/MM HH24:MI') derniere,
           (select to_char(min(e.sent_at) at time zone 'Europe/Paris', 'DD/MM HH24:MI') from public.emails e where e.prospect_id = p.id and e.relance_de is null) premier,
           (select to_char(min(e.sent_at) at time zone 'Europe/Paris', 'DD/MM HH24:MI') from public.emails e where e.prospect_id = p.id and e.relance_de is not null) relance
    from public.websites w join public.prospects p on p.id = w.prospect_id
    where w.kind = 'demo' and w.vues > 0 and w.is_demo = false order by w.derniere_vue desc limit 40`);
  try {
    t("Visites avec durée (5/11) (artisan | début | durée s | appareil)", await sql`
      select p.name, to_char(v.debut at time zone 'Europe/Paris', 'DD/MM HH24:MI') debut, v.duree_s, v.appareil
      from public.maquette_visites v join public.websites w on w.id = v.website_id join public.prospects p on p.id = w.prospect_id
      order by v.debut desc limit 40`);
  } catch (e) { console.log("## Visites avec durée : table absente (migration pas encore appliquée)"); }
  t("Totaux (e-mails envoyés | dont relances | artisans contactés | réponses reçues hors auto/spam/chauffe | STOP en opposition)", await sql`
    select (select count(*) from public.emails where sent_at is not null and is_demo = false)::int envoyes,
           (select count(*) from public.emails where sent_at is not null and relance_de is not null and is_demo = false)::int relances,
           (select count(distinct prospect_id) from public.emails where sent_at is not null and is_demo = false)::int artisans,
           (select count(*) from public.mailbox_messages where direction = 'entrant' and prospect_id is not null
              and coalesce(category, '') not in ('automatique', 'spam', 'chauffe'))::int reponses,
           (select count(*) from public.opposition_list where is_demo = false)::int stop`);
  t("Réponses reçues d'artisans (date | artisan | catégorie | début)", await sql`
    select to_char(m.created_at at time zone 'Europe/Paris', 'DD/MM HH24:MI') quand, p.name, m.category,
           left(regexp_replace(coalesce(m.body_text, ''), '[[:space:]]+', ' ', 'g'), 120) debut_texte
    from public.mailbox_messages m join public.prospects p on p.id = m.prospect_id
    where m.direction = 'entrant' and coalesce(m.category, '') not in ('automatique', 'spam', 'chauffe')
    order by m.created_at desc limit 15`);
  // 6/11 : notes de Loïc des artisans qui ont ouvert leur maquette, comparées aux autres artisans contactés.
  t("Notes de Loïc : artisans qui ont ouvert (artisan | ville | métier | note | site actuel | raison)", await sql`
    select p.name, p.city, coalesce(p.category, '-') metier, p.score, coalesce(p.current_website, '-') site, left(regexp_replace(coalesce(p.score_reason, ''), '[[:space:]]+', ' ', 'g'), 400) raison
    from public.websites w join public.prospects p on p.id = w.prospect_id
    where w.kind = 'demo' and w.vues > 0 and w.is_demo = false order by p.score desc nulls last`);
  t("Notes de Loïc : comparaison (groupe | artisans | note moyenne | médiane | min | max)", await sql`
    with c as (select distinct e.prospect_id from public.emails e where e.sent_at is not null and e.is_demo = false)
    select case when w.vues > 0 then 'ont ouvert' else 'contactés sans ouverture' end groupe, count(*)::int n,
           round(avg(p.score)::numeric, 1) moyenne, percentile_cont(0.5) within group (order by p.score) mediane,
           min(p.score) mini, max(p.score) maxi
    from c join public.prospects p on p.id = c.prospect_id
    left join public.websites w on w.prospect_id = p.id and w.kind = 'demo' group by 1`);
  // 6/11 : pourquoi la durée des visites ne s'enregistre pas (essai dans une transaction annulée : rien n'est écrit).
  t("Durée des visites : lignes dans maquette_visites | fonction présente | anon peut l'appeler", await sql`
    select (select count(*) from public.maquette_visites)::int lignes,
           exists(select 1 from pg_proc where proname = 'maquette_visite') fonction,
           has_function_privilege('anon', 'public.maquette_visite(text, text, integer, text)', 'execute') anon`);
  t("Durée des visites : maquette de G.e.p.h.entreprise (slug | type | vues | dernière vue)", await sql`
    select w.slug, w.kind, w.vues, to_char(w.derniere_vue at time zone 'Europe/Paris', 'DD/MM HH24:MI') derniere
    from public.websites w join public.prospects p on p.id = w.prospect_id where p.name ilike 'G.e.p.h%'`);
  t("Durée des visites : lignes (maquette | début | fin | durée s | appareil)", await sql`
    select w.slug, to_char(v.debut at time zone 'Europe/Paris', 'DD/MM HH24:MI:SS') debut,
           to_char(v.fin at time zone 'Europe/Paris', 'DD/MM HH24:MI:SS') fin, v.duree_s, v.appareil
    from public.maquette_visites v join public.websites w on w.id = v.website_id order by v.debut desc limit 20`);
  // 6/11 : ouvertures par fournisseur de la boîte e-mail de l'artisan (délivrabilité : Outlook a classé une copie en
  // indésirable). Adresses grand public d'après leur domaine ; domaines d'entreprise d'après leur MX (qui héberge la boîte).
  {
    const lignes = await sql<{ domaine: string; ouvert: boolean; relance: boolean }[]>`
      with c as (select distinct e.prospect_id from public.emails e where e.sent_at is not null and e.is_demo = false)
      select split_part(lower(p.email), '@', 2) domaine, coalesce(w.vues, 0) > 0 ouvert,
             exists (select 1 from public.emails r where r.prospect_id = p.id and r.relance_de is not null and r.sent_at is not null) relance
      from c join public.prospects p on p.id = c.prospect_id left join public.websites w on w.prospect_id = p.id and w.kind = 'demo'`;
    const { resolveMx } = await import("node:dns/promises");
    const PUBLICS: [RegExp, string][] = [
      [/^(gmail|googlemail)\.com$/, "Gmail"], [/^(orange|wanadoo)\.fr$/, "Orange / Wanadoo"], [/^(free|aliceadsl)\.fr$/, "Free"],
      [/^(sfr|neuf)\.fr$|^cegetel\.net$|^club-internet\.fr$/, "SFR"], [/^bbox\.fr$/, "Bouygues"], [/^laposte\.net$/, "La Poste"],
      [/^(hotmail|outlook|live|msn)\./, "Outlook / Hotmail"], [/^(yahoo|ymail)\./, "Yahoo"], [/^(icloud|me|mac)\.com$/, "iCloud"],
    ];
    const MX: [RegExp, string][] = [
      [/google\.com$|googlemail\.com$/, "Google Workspace (domaine propre)"], [/outlook\.com$/, "Microsoft 365 (domaine propre)"],
      [/ovh\.net$/, "OVH (domaine propre)"], [/ionos\.|1and1\./, "Ionos (domaine propre)"], [/orange\.fr$/, "Orange (domaine propre)"],
      [/gandi\.net$/, "Gandi (domaine propre)"], [/o2switch\.net$/, "o2switch (domaine propre)"],
    ];
    const cache = new Map<string, string>();
    const fournisseur = async (d: string) => {
      for (const [re, nom] of PUBLICS) if (re.test(d)) return nom;
      if (!cache.has(d)) {
        let nom = "Autre hébergeur (domaine propre)";
        try {
          const mx = (await resolveMx(d)).sort((x, y) => x.priority - y.priority)[0]?.exchange.toLowerCase() ?? "";
          nom = MX.find(([re]) => re.test(mx))?.[1] ?? (mx ? `Autre hébergeur (domaine propre)` : "Domaine sans MX");
        } catch { nom = "Domaine sans MX"; }
        cache.set(d, nom);
      }
      return cache.get(d)!;
    };
    const parF = new Map<string, { n: number; o: number; r: number }>();
    for (const l of lignes) {
      const f = await fournisseur(l.domaine);
      const x = parF.get(f) ?? { n: 0, o: 0, r: 0 };
      x.n++; if (l.ouvert) x.o++; if (l.relance) x.r++;
      parF.set(f, x);
    }
    console.log("## Ouvertures par fournisseur de la boîte de l'artisan (fournisseur | artisans contactés | maquette ouverte | % | relancés)");
    for (const [f, x] of [...parF].sort((a, b) => b[1].n - a[1].n)) {
      console.log(`${f} | ${x.n} | ${x.o} | ${((100 * x.o) / x.n).toFixed(1)} % | ${x.r}`);
    }
  }
  // 5/11 : rythme de la semaine et file des relances.
  t("Semaine : envois par jour depuis lundi 2/11 (jour | premiers | relances | relances « nouvelle adresse » | boîtes)", await sql`
    select to_char(e.sent_at at time zone 'Europe/Paris', 'YYYY-MM-DD Dy') jour,
           count(*) filter (where e.relance_de is null)::int premiers,
           count(*) filter (where e.relance_de is not null)::int relances,
           count(*) filter (where e.relance_de is not null and coalesce(o.sender, 'resend') = 'resend')::int relances_nouvelle_adresse,
           string_agg(distinct coalesce(e.sender, 'resend'), ' + ') boites
    from public.emails e left join public.emails o on o.id = e.relance_de
    where e.sent_at >= '2026-11-02 00:00:00+01'::timestamptz and e.is_demo = false group by 1 order by 1`);
  t("Relances dues maintenant mais pas encore préparées (1er e-mail par | nombre | plus ancien 1er e-mail)", await sql`
    select coalesce(e.sender, 'resend') premier_par, count(*)::int n,
           to_char(min(e.sent_at) at time zone 'Europe/Paris', 'MM-DD HH24:MI') plus_ancien
    from public.emails e join public.prospects p on p.id = e.prospect_id
    where e.relance_de is null and e.status = 'envoye' and e.sent_at is not null
      and e.sent_at < now() - interval '6 days' and e.sent_at > now() - interval '30 days'
      and coalesce(e.delivery_status, 'sent') not in ('bounced', 'complained', 'adresse_invalide')
      and p.status = 'contacte' and p.email is not null and e.is_demo = false and not public.is_opposed(p.email)
      and not exists (select 1 from public.emails r where r.relance_de = e.id)
      and not exists (select 1 from public.mailbox_messages m where m.prospect_id = p.id and m.direction = 'entrant'
                      and m.created_at > e.sent_at and coalesce(m.category, '') not in ('automatique', 'spam', 'chauffe'))
    group by 1`);
  t("Relances préparées pas encore parties (statut | 1er e-mail par | nombre | préparée la plus ancienne | 1er e-mail le plus ancien)", await sql`
    select r.status, coalesce(o.sender, 'resend') premier_par, count(*)::int n,
           to_char(min(r.created_at) at time zone 'Europe/Paris', 'MM-DD HH24:MI') preparee,
           to_char(min(o.sent_at) at time zone 'Europe/Paris', 'MM-DD') premier_envoi
    from public.emails r join public.emails o on o.id = r.relance_de
    where r.sent_at is null and r.is_demo = false group by 1, 2 order by 1, 2`);
  t("Relances à venir : premiers e-mails des 6 derniers jours, par jour où leur relance sera due (jour dû | nombre)", await sql`
    select to_char((e.sent_at + interval '6 days') at time zone 'Europe/Paris', 'YYYY-MM-DD Dy') du, count(*)::int n
    from public.emails e
    where e.relance_de is null and e.status = 'envoye' and e.sent_at > now() - interval '6 days' and e.is_demo = false
    group by 1 order by 1`);
  t("Relances remises faute de place, par jour (jour | nombre)", await sql`
    select to_char(ev.created_at at time zone 'Europe/Paris', 'YYYY-MM-DD') jour, count(*)::int n
    from public.task_events ev
    where ev.message ilike '%relance remise%' and ev.created_at >= '2026-11-02 00:00:00+01'::timestamptz group by 1 order by 1`);
  t("Vagues d'envoi depuis lundi (heure | titre | statut)", await sql`
    select to_char(started_at at time zone 'Europe/Paris', 'MM-DD Dy HH24:MI') h, left(title, 120) titre, status
    from public.tasks where agent = 'email' and title ilike '%envoi%' and started_at >= '2026-11-02 00:00:00+01'::timestamptz
      and is_demo = false order by started_at`);
  t("Premiers e-mails validés en attente d'envoi (nombre | le plus ancien validé)", await sql`
    select count(*)::int n, to_char(min(updated_at) at time zone 'Europe/Paris', 'MM-DD') plus_ancien
    from public.emails where status = 'valide' and relance_de is null and sent_at is null and is_demo = false`);
  t("Nouveaux prospects par jour cette semaine (jour | créés | qualifiés depuis)", await sql`
    select to_char(created_at at time zone 'Europe/Paris', 'YYYY-MM-DD Dy') jour, count(*)::int crees,
           count(*) filter (where status not in ('nouveau', 'ecarte'))::int qualifies
    from public.prospects where created_at >= '2026-11-02 00:00:00+01'::timestamptz and is_demo = false group by 1 order by 1`);
  t("Tâches des 3 derniers jours (agent, statut)", await sql`
    select agent, status, count(*)::int n from public.tasks
    where started_at > now() - interval '3 days' and is_demo = false group by 1, 2 order by 1, 2`);

  console.log(lignes.join("\n"));
  // Une annotation par bloc (limite de taille de GitHub).
  const blocs: string[][] = [];
  for (const l of lignes) {
    if (l.startsWith("## ") || blocs.length === 0) blocs.push([]);
    blocs[blocs.length - 1].push(l);
  }
  // GitHub n'affiche que 10 annotations par étape : on regroupe les blocs par 3.
  for (let i = 0; i < blocs.length; i += 3) {
    const groupe = blocs.slice(i, i + 3).flat();
    console.log(`::notice title=Bilan ${i / 3 + 1}::${groupe.join("%0A").replace(/::/g, ": :")}`);
  }
  ajouterResume(lignes.join("\n") + "\n");
} catch (err) {
  console.error((err as Error).message);
  console.log(`::error title=Bilan::${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
