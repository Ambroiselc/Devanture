// Relance (30/10) : UN seul rappel court, 6 jours après le premier e-mail, si l'artisan n'a ni répondu ni dit STOP.
// Préparée par l'agent d'envoi (agents/envoi.ts) au début de chaque vague, « à valider » sur la page Valérie
// comme tout e-mail ; envoyée en priorité, depuis la même boîte, dans le même fil (« Re: » + en-têtes de réponse).
// Texte fixe, sans IA : court, poli, avec une sortie facile (« non merci »).
import type { Sql } from "./db.ts";
import { assemblerEmail, LIEN_DEMO } from "./redaction-email.ts";

export const JOURS_AVANT_RELANCE = 6;
/** Au-delà, trop tard pour relancer : l'artisan a oublié le premier e-mail. */
export const JOURS_MAX_RELANCE = 30;

export function objetRelance(objet: string): string {
  return /^re\s*:/i.test(objet.trim()) ? objet.trim() : `Re: ${objet.trim()}`;
}

export function texteRelance(entreprise: string): string {
  return [
    "Bonjour,",
    "",
    `Je me permets de revenir vers vous au sujet de la maquette de site que j'ai préparée pour ${entreprise}.`,
    "",
    "Elle est toujours en ligne, ici :",
    "",
    LIEN_DEMO,
    "",
    "Si ce n'est pas le moment, aucun souci : répondez simplement « non merci » et je ne vous écrirai plus.",
  ].join("\n");
}

/**
 * Relance des artisans dont le premier e-mail est parti par Resend (26-28/10), depuis une autre adresse (2/11) :
 * e-mail NEUF (pas de « Re: », pas dans le fil) qui explique le changement d'adresse.
 */
export function texteRelanceNouvelleAdresse(entreprise: string): string {
  return [
    "Bonjour,",
    "",
    `Je vous avais écrit la semaine dernière depuis une autre adresse, au sujet de la maquette de site que j'ai préparée pour ${entreprise}.`,
    "",
    "Mon message s'est peut-être perdu, donc je vous la renvoie ici :",
    "",
    LIEN_DEMO,
    "",
    "Si ce n'est pas le moment, aucun souci : répondez simplement « non merci » et je ne vous écrirai plus.",
  ].join("\n");
}

/** Objet sans « Re: » (e-mail neuf). */
export function objetSansRe(objet: string): string {
  return objet.trim().replace(/^(re\s*:\s*)+/i, "");
}

interface ARelancer {
  sender: string | null;
  id: string;
  prospect_id: string;
  campaign_id: string | null;
  website_id: string | null;
  subject: string;
  name: string;
  email: string;
  email_source: string | null;
}

/**
 * Prépare les relances dues (statut « a_valider »). Renvoie leur nombre.
 * Conditions : premier e-mail envoyé il y a 6 à 30 jours, toujours « envoyé » (pas de réponse, pas de rebond),
 * prospect toujours « contacté », adresse pas en opposition, aucun message reçu de lui depuis (sauf réponse
 * automatique : un « absent du bureau » ne compte pas), et pas déjà de relance.
 */
export async function preparerRelances(sql: Sql, signature: string, simulation: boolean): Promise<number> {
  // 2/11 : un premier e-mail parti par Resend (26-28/10) est relancé depuis une boîte par un e-mail NEUF (sans « Re: »,
  // texte qui explique le changement d'adresse). On retire les anciennes relances « Re: » préparées pour eux et pas parties.
  await sql`delete from public.emails r using public.emails o
            where r.relance_de = o.id and coalesce(o.sender, 'resend') = 'resend'
              and r.status in ('brouillon', 'a_valider', 'valide') and r.sent_at is null
              and r.subject ~* '^re\\s*:'`;
  const dues = await sql<ARelancer[]>`
    select e.id, e.prospect_id, e.campaign_id, e.website_id, e.subject, e.sender, p.name, p.email, p.email_source
    from public.emails e
    join public.prospects p on p.id = e.prospect_id
    where e.relance_de is null and e.status = 'envoye' and e.sent_at is not null
      -- 10/11 : par JOUR (heure de Paris) et non à l'heure près : un 1er e-mail du mardi 14 h est relancé dès la 1re vague
      -- du lundi suivant (avant, la vague de 9 h 30 ne trouvait rien : il manquait quelques heures pour faire 6 × 24 h).
      and e.sent_at < ((date_trunc('day', now() at time zone 'Europe/Paris') - make_interval(days => ${JOURS_AVANT_RELANCE - 1})) at time zone 'Europe/Paris')
      and e.sent_at > now() - make_interval(days => ${JOURS_MAX_RELANCE})
      and coalesce(e.delivery_status, 'sent') not in ('bounced', 'complained', 'adresse_invalide')
      and p.status = 'contacte' and p.email is not null and e.is_demo = ${simulation}
      and not public.is_opposed(p.email)
      and not exists (select 1 from public.emails r where r.relance_de = e.id)
      and not exists (select 1 from public.mailbox_messages m
                      where m.prospect_id = p.id and m.direction = 'entrant' and m.created_at > e.sent_at
                        and coalesce(m.category, '') not in ('automatique', 'spam', 'chauffe'))
      -- 13/11 : pas de relance automatique à un artisan qui a cliqué « Ce site m'intéresse » (Broise le recontacte).
      and not exists (select 1 from public.maquette_interets i where i.prospect_id = p.id)
    order by e.sent_at limit 100`;
  let n = 0;
  for (const e of dues) {
    const parResend = !e.sender || e.sender === "resend";
    const corps = assemblerEmail(parResend ? texteRelanceNouvelleAdresse(e.name) : texteRelance(e.name), signature, e.email, e.email_source);
    const r = await sql`
      insert into public.emails (prospect_id, campaign_id, website_id, subject, body, status, relance_de, with_image, is_demo)
      values (${e.prospect_id}, ${e.campaign_id}, ${e.website_id}, ${parResend ? objetSansRe(e.subject) : objetRelance(e.subject)}, ${corps}, 'a_valider',
              ${e.id}, false, ${simulation})
      on conflict do nothing`;
    n += r.count;
  }
  return n;
}
