// =====================================================================
// Relève des paiements Stripe (29/10). Lancée avec Inès (workflow agent-boite.yml, toutes les 2 heures en journée).
// Pour chaque paiement terminé sur un lien Devanture :
//   • commande (création, ou 1er mois avec 0 € de départ) → fiche client créée (page Clients) et e-mail de bienvenue
//     préparé dans la boîte mail, « à valider » par Broise ; il contient le lien d'accueil du client ;
//   • abonnement sans engagement (payé à la mise en ligne) → la fiche passe « Abonné » ;
//   • paiement qu'on ne sait pas rattacher à un prospect (autre adresse e-mail…) → « à rattacher » sur la page Clients.
// Rien n'est jamais envoyé seul. Chaque paiement n'est traité qu'une fois (identifiant Stripe unique).
// Clé : STRIPE_SECRET_KEY (clé restreinte rk_live_), qui doit avoir la LECTURE sur « Checkout Sessions ».
// =====================================================================
import { connecter, type Sql } from "./lib/db.ts";
import { SIMULATION } from "./lib/http.ts";
import { infosLien } from "./lib/paiement.ts";
import { bienvenueComplete, OBJET_BIENVENUE } from "./lib/accueil.ts";

interface Session {
  id: string;
  created: number;
  status: string;
  metadata?: Record<string, string>;
  payment_link?: string | null;
  customer_details?: { email?: string | null } | null;
  custom_fields?: { key: string; text?: { value?: string | null } | null }[];
  amount_total?: number | null;
  total_details?: { amount_discount?: number | null } | null;
}

const bilan = { vus: 0, nouveaux_clients: 0, abonnements: 0, a_rattacher: 0, ignores: 0 };

async function journal(sql: Sql, taskId: string | null, level: "info" | "warning" | "error", message: string) {
  console.log(`[${level}] ${message}`);
  if (taskId) await sql`insert into public.task_events (task_id, level, message, is_demo) values (${taskId}, ${level}, ${message}, ${SIMULATION})`;
}

async function stripe<T>(cle: string, chemin: string): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1/${chemin}`, {
    headers: { Authorization: `Bearer ${cle}`, "Stripe-Version": "2024-06-20" },
  });
  const json = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok) {
    const message = json.error?.message ?? String(res.status);
    if (res.status === 403 || /permission/i.test(message)) {
      throw new Error(`La clé Stripe n'a pas le droit de lire les paiements (${message}). Dans Stripe : Développeurs > Clés API > `
        + "la clé restreinte « catalogue GitHub » > Modifier > « Checkout Sessions » en Lecture, puis Enregistrer.");
    }
    throw new Error(`Stripe (${chemin.split("?")[0]}) : ${message}`);
  }
  return json;
}

/** Paiements terminés depuis `depuis` (secondes), du plus ancien au plus récent. */
async function sessionsDepuis(cle: string, depuis: number): Promise<Session[]> {
  const toutes: Session[] = [];
  let apres: string | null = null;
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({ limit: "100", status: "complete", "created[gte]": String(depuis) });
    if (apres) q.set("starting_after", apres);
    const r = await stripe<{ data: Session[]; has_more: boolean }>(cle, `checkout/sessions?${q}`);
    toutes.push(...r.data);
    if (!r.has_more || r.data.length === 0) break;
    apres = r.data[r.data.length - 1].id;
  }
  return toutes.sort((a, b) => a.created - b.created);
}

/** Le prospect qui a payé : même e-mail, sinon le seul prospect qui porte exactement ce nom d'entreprise. */
async function retrouverProspect(sql: Sql, email: string | null, entreprise: string | null) {
  if (email) {
    const [p] = await sql<{ id: string; name: string }[]>`
      select id, name from public.prospects where lower(email) = ${email.toLowerCase()} order by updated_at desc limit 1`;
    if (p) return p;
  }
  if (entreprise && entreprise.trim().length >= 3) {
    const memes = await sql<{ id: string; name: string }[]>`
      select id, name from public.prospects where lower(name) = ${entreprise.trim().toLowerCase()} limit 2`;
    if (memes.length === 1) return memes[0];
  }
  return null;
}

/** Fiche client + brouillon de bienvenue (à valider). Renvoie l'identifiant du client. */
export async function creerClientEtBienvenue(sql: Sql, prospectId: string, email: string | null,
  formule: "essentiel" | "pro", paiement: "creation" | "sans_frais", lancement: boolean): Promise<{ id: string; nouveau: boolean }> {
  const [existant] = await sql<{ id: string }[]>`select id from public.clients where prospect_id = ${prospectId}`;
  if (existant) return { id: existant.id, nouveau: false };
  const [c] = await sql<{ id: string; jeton: string }[]>`
    insert into public.clients (prospect_id, formule, paiement, lancement, fin_engagement, notes)
    values (${prospectId}, ${formule}, ${paiement}, ${lancement},
            ${paiement === "sans_frais" ? sql`(current_date + interval '1 year')::date` : null},
            'Fiche créée automatiquement à la réception du paiement Stripe.')
    returning id, jeton`;
  const [p] = await sql<{ email: string | null }[]>`select email from public.prospects where id = ${prospectId}`;
  const destinataire = email ?? p?.email;
  if (destinataire) {
    const [{ signature } = { signature: null }] = await sql<{ signature: string | null }[]>`
      select signature from public.agent_settings where agent = 'boite'`;
    const [m] = await sql<{ id: string }[]>`
      insert into public.mailbox_messages (direction, prospect_id, to_email, subject, body_text, category, status,
                                           review_reason, sent_by, is_demo)
      values ('sortant', ${prospectId}, ${destinataire}, ${OBJET_BIENVENUE}, ${bienvenueComplete(c.jeton, signature)}, 'client',
              'a_valider', 'Bienvenue du nouveau client (paiement reçu) : vérifie puis valide.', 'agent', ${SIMULATION})
      returning id`;
    await sql`update public.mailbox_messages set thread_id = ${m.id} where id = ${m.id}`;
  }
  return { id: c.id, nouveau: true };
}

async function traiter(sql: Sql, taskId: string, cle: string) {
  // On relit large (2 jours avant le dernier paiement connu) : les doublons sont écartés par l'identifiant.
  const [{ dernier }] = await sql<{ dernier: Date | null }[]>`select max(paye_le) as dernier from public.paiements_stripe`;
  const depuis = Math.floor((dernier ? dernier.getTime() - 2 * 86_400_000 : Date.parse("2026-10-28T00:00:00Z")) / 1000);
  const sessions = await sessionsDepuis(cle, depuis);
  const liensVus = new Map<string, string | null>();

  for (const s of sessions) {
    const [deja] = await sql<{ id: string }[]>`select id from public.paiements_stripe where session_id = ${s.id}`;
    if (deja) continue;
    bilan.vus++;

    let cleLien = s.metadata?.cle ?? null;
    if (!cleLien && s.payment_link) {
      if (!liensVus.has(s.payment_link)) {
        const lien = await stripe<{ metadata?: Record<string, string> }>(cle, `payment_links/${s.payment_link}`);
        liensVus.set(s.payment_link, lien.metadata?.cle ?? null);
      }
      cleLien = liensVus.get(s.payment_link) ?? null;
    }
    const email = s.customer_details?.email?.trim().toLowerCase() || null;
    const entreprise = s.custom_fields?.find((f) => f.key === "entreprise")?.text?.value?.trim() || null;
    const remise = s.total_details?.amount_discount ?? 0;
    const infos = infosLien(cleLien);
    const ligne = {
      session_id: s.id, paye_le: new Date(s.created * 1000), cle: cleLien, email, entreprise,
      montant_cents: s.amount_total ?? 0, remise_cents: remise,
    };
    const qui = entreprise ?? email ?? s.id;

    if (!infos) {
      await sql`insert into public.paiements_stripe ${sql({ ...ligne, statut: "ignore" })}`;
      bilan.ignores++;
      await journal(sql, taskId, "warning", `${qui} : paiement hors des liens Devanture, ignoré.`);
      continue;
    }

    const p = await retrouverProspect(sql, email, entreprise);
    if (!p) {
      await sql`insert into public.paiements_stripe ${sql({ ...ligne, statut: "a_rattacher" })}`;
      bilan.a_rattacher++;
      await journal(sql, taskId, "warning", `${qui} : paiement reçu, mais aucun prospect avec cette adresse. À rattacher sur la page Clients.`);
      continue;
    }

    if (infos.type === "commande") {
      const c = await creerClientEtBienvenue(sql, p.id, email, infos.formule, infos.paiement, infos.lancement || remise > 0);
      await sql`insert into public.paiements_stripe ${sql({ ...ligne, client_id: c.id, statut: "rattache" })}`;
      if (c.nouveau) bilan.nouveaux_clients++;
      await journal(sql, taskId, "info", c.nouveau
        ? `${p.name} : nouveau client ! Fiche créée et e-mail de bienvenue à valider.`
        : `${p.name} : paiement rattaché à sa fiche client.`);
    } else {
      const [c] = await sql<{ id: string }[]>`select id from public.clients where prospect_id = ${p.id}`;
      if (!c) {
        await sql`insert into public.paiements_stripe ${sql({ ...ligne, statut: "a_rattacher" })}`;
        bilan.a_rattacher++;
        await journal(sql, taskId, "warning", `${p.name} : abonnement payé sans fiche client. À rattacher sur la page Clients.`);
        continue;
      }
      await sql`update public.clients set etape = 'abonne', en_ligne_le = coalesce(en_ligne_le, current_date)
                where id = ${c.id} and etape not in ('abandonne', 'resilie')`;
      await sql`insert into public.paiements_stripe ${sql({ ...ligne, client_id: c.id, statut: "rattache" })}`;
      bilan.abonnements++;
      await journal(sql, taskId, "info", `${p.name} : abonnement payé, fiche passée « Abonné ».`);
    }
  }
}

async function main() {
  const cle = process.env.STRIPE_SECRET_KEY?.trim();
  if (!cle) {
    console.log("Relève des paiements pas branchée (secret STRIPE_SECRET_KEY absent).");
    return;
  }
  const sql = connecter();
  let taskId: string | null = null;
  try {
    const [table] = await sql<{ ok: boolean }[]>`select to_regclass('public.paiements_stripe') is not null as ok`;
    if (!table.ok) {
      console.log("Table paiements_stripe absente : appliquer la migration 20261029010000_accueil_et_paiements.sql.");
      return;
    }
    const [t] = await sql<{ id: string }[]>`
      insert into public.tasks (agent, title, status, input, attempts, started_at, is_demo)
      values ('paiements', 'Relève des paiements Stripe', 'en_cours', '{}'::jsonb, 1, now(), ${SIMULATION}) returning id`;
    taskId = t.id;
    await traiter(sql, taskId, cle);
    // Une relève sans nouveauté ne garde pas de trace (elle tourne toutes les 2 heures).
    if (bilan.vus === 0) await sql`delete from public.tasks where id = ${taskId}`;
    else await sql`update public.tasks set status = 'terminee', finished_at = now(), output = ${sql.json(bilan as never)} where id = ${taskId}`;
    console.log(bilan);
  } catch (err) {
    const message = (err as Error).message;
    console.error(message);
    if (taskId) {
      await sql`update public.tasks set status = 'echouee', finished_at = now(), error_message = ${message},
                output = ${sql.json(bilan as never)} where id = ${taskId}`;
    }
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
