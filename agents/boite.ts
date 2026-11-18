// =====================================================================
// Inès, l'agente de la boîte mail (prénom réglable sur la page /boite).
//
// À chaque passage (réveillée par le Worker Cloudflare dès qu'un e-mail arrive, par la page /boite,
// et quelques fois par jour par sécurité) :
//   1. TRI des e-mails reçus (« nouveau ») :
//      • rattache chaque e-mail au bon prospect (adresse de réponse personnalisée, puis adresse, puis domaine) ;
//      • réponses automatiques (absence…) et robots : rangés, sans réponse ;
//      • « STOP » et demandes de désinscription : liste d'opposition, sans réponse (détection codée en dur) ;
//      • le reste : Claude Haiku le trie (intéressé, question, pas intéressé…) et rédige une réponse.
//   2. DÉCISION : la réponse part seule seulement si elle est simple (accusé de réception, « pas intéressé »,
//      question sur la maquette) ET qu'aucun garde-fou ne bloque : prix, contrat, paiement, appel, plainte,
//      pièce jointe, expéditeur inconnu, plafond du jour… Sinon elle attend Broise sur la page /boite.
//   3. ENVOI des réponses validées (par Broise ou par l'agente), via Resend, entre 8 h et 20 h.
//
// Garde-fous : budget IA du mois, liste d'opposition (vérifiée dans le code ET par la base), 3 erreurs de suite.
// Test sans Internet ni clés : DEVANTURE_SIMULATION=1 sur une base locale.
// =====================================================================
import { appendFileSync } from "node:fs";
import { connecter, type Sql } from "./lib/db.ts";
import { http, sleep, SIMULATION } from "./lib/http.ts";
import {
  adresseReponse, demandeStop, expediteurMachine, objetReponse, prospectDepuisAdresse, sansCitation, sujetsSensibles,
} from "./lib/boite.ts";
import { assemblerReponse, MODELE, traiterMessage, type Categorie } from "./lib/redaction-reponse.ts";
import { phrasesTropLongues } from "./lib/style.ts";
import { lireBoites, releverBoites } from "./lib/boites-envoi.ts";

const RESEND = "https://api.resend.com/emails";
const MAX_TRI = 40; // e-mails triés au plus par passage
const MAX_ENVOIS = 30;
const MAX_ERREURS_DE_SUITE = 3;
const MAX_AUTO_PAR_FIL = 2; // au-delà, Broise reprend la main sur la conversation
/** Seules ces catégories peuvent recevoir une réponse sans relecture. */
const AUTONOMES: Categorie[] = ["question", "pas_interesse"];
/** Messagerie grand public : un même domaine ne désigne pas une entreprise. */
const DOMAINES_PUBLICS = /^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|aol|orange|wanadoo|free|sfr|neuf|laposte|bbox|numericable|gmx|protonmail|proton)\./i;

interface Reglages {
  display_name: string;
  enabled: boolean;
  instructions: string | null;
  signature: string | null;
  auto_reply_enabled: boolean;
  auto_reply_max_per_day: number;
  /** 3/11 : adresses des contacts de chauffe (amis de Broise), en minuscules. */
  contacts_chauffe: string[];
}

interface Recu {
  id: string;
  from_email: string | null;
  from_name: string | null;
  to_email: string | null;
  subject: string;
  body_text: string;
  message_id: string | null;
  in_reply_to: string | null;
  attachments: { nom: string }[];
  auto_submitted: boolean;
  received_at: Date | null;
  created_at: Date;
}

interface Prospect {
  id: string;
  name: string;
  category: string | null;
  city: string | null;
  status: string;
  campaign_id: string | null;
}

const bilan = {
  tries: 0, auto_envoyees: 0, a_valider: 0, a_traiter: 0, stop: 0, ignores: 0, envoyes: 0, erreurs: 0,
  cout_ia_eur: 0, arret: undefined as string | undefined,
};

async function journal(sql: Sql, taskId: string | null, level: "info" | "warning" | "error", message: string) {
  console.log(`[${level}] ${message}`);
  if (taskId) await sql`insert into public.task_events (task_id, level, message, is_demo) values (${taskId}, ${level}, ${message}, ${SIMULATION})`;
}

/** Heure décimale à Paris (ex. 14.5 pour 14 h 30). */
function heureParis(d = new Date()): number {
  const p = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  return Number(p.find((x) => x.type === "hour")?.value ?? 0) + Number(p.find((x) => x.type === "minute")?.value ?? 0) / 60;
}

/** Retrouve le prospect qui écrit : adresse de réponse personnalisée, puis même adresse, puis même domaine (une seule entreprise). */
async function retrouverProspect(sql: Sql, m: Recu): Promise<Prospect | null> {
  const champs = sql`id, name, category, city, status, campaign_id`;
  const id = prospectDepuisAdresse(m.to_email);
  if (id) {
    const [p] = await sql<Prospect[]>`select ${champs} from public.prospects where id = ${id}`;
    if (p) return p;
  }
  if (!m.from_email) return null;
  const [p] = await sql<Prospect[]>`select ${champs} from public.prospects where lower(email) = ${m.from_email}
                                    order by updated_at desc limit 1`;
  if (p) return p;
  const domaine = m.from_email.split("@")[1] ?? "";
  if (!domaine || DOMAINES_PUBLICS.test(domaine)) return null;
  const parDomaine = await sql<Prospect[]>`select ${champs} from public.prospects
                                           where split_part(lower(email), '@', 2) = ${domaine} limit 2`;
  return parDomaine.length === 1 ? parDomaine[0] : null;
}

/**
 * Rattrapage (5/11) : un STOP rangé par erreur comme « automatique » ou « spam » (60 derniers jours) passe sur la liste
 * d'opposition et dans la bonne catégorie. Sans IA, à chaque passage d'Inès.
 */
async function rattraperStop(sql: Sql, taskId: string | null): Promise<number> {
  const ranges = await sql<{ id: string; from_email: string | null; subject: string; body_text: string; prospect_id: string | null }[]>`
    select id, from_email, subject, body_text, prospect_id from public.mailbox_messages
    where direction = 'entrant' and category in ('automatique', 'spam') and created_at > now() - interval '60 days'
    order by created_at desc limit 300`;
  let n = 0;
  for (const m of ranges) {
    if (!demandeStop(m.subject ?? "", m.body_text ?? "")) continue;
    const [p] = m.prospect_id ? await sql<{ name: string }[]>`select name from public.prospects where id = ${m.prospect_id}` : [];
    if (m.from_email) {
      await sql`insert into public.opposition_list (email, business_name, reason, notes, is_demo)
                values (${m.from_email}, ${p?.name ?? null}, 'desinscription', 'Demande reçue par e-mail (rattrapée : rangée comme automatique).', ${SIMULATION})
                on conflict do nothing`;
    }
    if (m.prospect_id) {
      await sql`update public.emails set status = 'repondu' where prospect_id = ${m.prospect_id} and status = 'envoye'`;
    }
    await sql`update public.mailbox_messages set status = 'traite', category = 'stop',
              summary = 'Demande à ne plus être contacté : ajouté à la liste d''opposition.' where id = ${m.id}`;
    const texte = `${p?.name ?? m.from_email ?? "inconnu"} : STOP rangé par erreur comme automatique, rattrapé et ajouté à la liste d'opposition.`;
    if (taskId) await journal(sql, taskId, "warning", texte); else console.log(texte);
    n++;
  }
  return n;
}

async function trier(sql: Sql, taskId: string, r: Reglages): Promise<void> {
  const recus = await sql<Recu[]>`
    select id, from_email, from_name, to_email, subject, body_text, message_id, in_reply_to, attachments,
           auto_submitted, received_at, created_at
    from public.mailbox_messages where direction = 'entrant' and status = 'nouveau'
    order by created_at limit ${MAX_TRI}`;
  if (recus.length === 0) return;

  const signature = r.signature?.trim() || "Ambroise Le Clerc\nDevanture";
  const baseDemo = process.env.DEMO_BASE_URL?.replace(/\/+$/, "") || null;
  let erreursDeSuite = 0;

  for (const m of recus) {
    const de = m.from_name ? `${m.from_name} <${m.from_email}>` : m.from_email ?? "inconnu";
    try {
      // 0) Alerte interne de Devanture (13/11, agents/interets.ts : « artisan intéressé ») : pas un artisan.
      if (m.from_email && /^alertes@/i.test(m.from_email) && /devanture-artisans\.fr$/i.test(m.from_email)) {
        await sql`update public.mailbox_messages set status = 'ignore', category = 'automatique', prospect_id = null,
                  summary = 'Alerte interne de Devanture (artisan intéressé).' where id = ${m.id}`;
        bilan.ignores++;
        continue;
      }
      // 0 bis) Contact de chauffe (3/11) : un ami de Broise, pas un artisan. Rangé à part, sans prospect, sans IA, sans réponse.
      if (m.from_email && r.contacts_chauffe.includes(m.from_email.toLowerCase())) {
        await sql`update public.mailbox_messages set status = 'ignore', category = 'chauffe', prospect_id = null,
                  summary = 'Contact de chauffe : ignoré par Inès.' where id = ${m.id}`;
        bilan.ignores++;
        continue;
      }
      const p = await retrouverProspect(sql, m);
      const nomAffiche = p?.name ?? de;

      // Fil de discussion : le dernier fil de ce prospect (ou de cette adresse) depuis moins de 60 jours.
      const [fil] = await sql<{ thread_id: string }[]>`
        select coalesce(thread_id, id) as thread_id from public.mailbox_messages
        where id <> ${m.id} and created_at > now() - interval '60 days'
          and (${p?.id ?? null}::uuid is not null and prospect_id = ${p?.id ?? null}::uuid
               or (from_email = ${m.from_email} or to_email = ${m.from_email}))
        order by created_at desc limit 1`;
      const threadId = fil?.thread_id ?? m.id;
      const [envoi] = p
        ? await sql<{ id: string; body: string; status: string }[]>`
            select id, body, status from public.emails where prospect_id = ${p.id} and status in ('envoye', 'repondu')
            order by sent_at desc nulls last limit 1`
        : [];
      await sql`update public.mailbox_messages set prospect_id = ${p?.id ?? null}, email_id = ${envoi?.id ?? null},
                thread_id = ${threadId} where id = ${m.id}`;

      // a) STOP : liste d'opposition tout de suite, sans réponse. AVANT le tri des réponses automatiques (5/11 :
      //    un vrai STOP d'artisan, avec un en-tête technique de robot, avait été rangé comme « automatique »).
      if (demandeStop(m.subject, m.body_text)) {
        if (m.from_email) {
          await sql`insert into public.opposition_list (email, business_name, reason, notes, is_demo)
                    values (${m.from_email}, ${p?.name ?? null}, 'desinscription', 'Demande reçue par e-mail (boîte mail).', ${SIMULATION})
                    on conflict do nothing`;
        }
        if (envoi && envoi.status === "envoye") await sql`update public.emails set status = 'repondu' where id = ${envoi.id}`;
        await sql`update public.mailbox_messages set status = 'traite', category = 'stop',
                  summary = 'Demande à ne plus être contacté : ajouté à la liste d''opposition.' where id = ${m.id}`;
        bilan.stop++;
        await journal(sql, taskId, "info", `${nomAffiche} : STOP, ajouté à la liste d'opposition.`);
        continue;
      }

      // b) Réponses automatiques et robots : rangés sans réponse, sans dépense d'IA.
      if (m.auto_submitted || (m.from_email && expediteurMachine(m.from_email))) {
        await sql`update public.mailbox_messages set status = 'ignore', category = 'automatique',
                  summary = 'Réponse automatique ou message de robot.' where id = ${m.id}`;
        bilan.ignores++;
        continue;
      }

      // c) Le reste : tri et réponse par Claude Haiku (si le budget du mois le permet).
      const [budget] = await sql<{ depasse: boolean }[]>`select depasse from public.ai_budget_status`;
      if (budget?.depasse) {
        bilan.arret = "Budget IA du mois atteint : les e-mails restants attendent (ils sont aussi dans Gmail).";
        await journal(sql, taskId, "warning", bilan.arret);
        break;
      }

      const historique = await sql<{ direction: string; body_text: string }[]>`
        select direction, body_text from public.mailbox_messages
        where (thread_id = ${threadId} or id = ${threadId}) and id <> ${m.id} and status <> 'rejete'
        order by created_at desc limit 6`;
      const [demo] = p
        ? await sql<{ slug: string | null }[]>`select slug from public.websites where prospect_id = ${p.id} and kind = 'demo'
                                               and status in ('pret', 'publie') order by created_at desc limit 1`
        : [];
      const message = sansCitation(m.body_text);
      const t = await traiterMessage({
        entreprise: p?.name ?? null,
        metier: p?.category ?? null,
        commune: p?.city ?? null,
        statut: p ? p.status : "expéditeur inconnu (pas dans nos prospects)",
        lienMaquette: baseDemo && demo?.slug ? `${baseDemo}/${demo.slug}` : null,
        expediteur: de,
        objet: m.subject,
        message,
        historique: [
          ...(envoi && historique.length === 0 ? [{ de: "devanture" as const, texte: envoi.body }] : []),
          ...historique.reverse().map((h) => ({ de: h.direction === "sortant" ? "devanture" as const : "artisan" as const, texte: sansCitation(h.body_text) })),
        ],
        piecesJointes: (m.attachments ?? []).map((a) => a.nom),
      }, r.instructions);
      bilan.tries++;
      bilan.cout_ia_eur = Math.round((bilan.cout_ia_eur + t.coutEur) * 1e6) / 1e6;
      await sql`insert into public.costs (task_id, campaign_id, provider, category, amount_eur, description, is_demo)
                values (${taskId}, ${p?.campaign_id ?? null}, 'anthropic', 'api', ${t.coutEur},
                        ${`Boîte mail (${MODELE}) : ${nomAffiche}`}, ${SIMULATION})`;

      // Effets sur le prospect.
      const humain = !["automatique", "spam"].includes(t.categorie);
      if (envoi && humain && envoi.status === "envoye") await sql`update public.emails set status = 'repondu' where id = ${envoi.id}`;
      if (p && ["interesse", "rendez_vous"].includes(t.categorie) && !["client", "refuse"].includes(p.status)) {
        await sql`update public.prospects set status = 'interesse' where id = ${p.id}`;
      }
      if (t.categorie === "stop" && m.from_email) {
        await sql`insert into public.opposition_list (email, business_name, reason, notes, is_demo)
                  values (${m.from_email}, ${p?.name ?? null}, 'desinscription', 'Demande reçue par e-mail (tri de l''agente).', ${SIMULATION})
                  on conflict do nothing`;
        bilan.stop++;
      }

      const oppose = m.from_email
        ? (await sql<{ o: boolean }[]>`select public.is_opposed(${m.from_email}) as o`)[0].o
        : true;

      if (!t.repondre || oppose || !m.from_email) {
        // Pas de réponse : « pas intéressé » sans réponse → liste d'opposition (refus) tout de suite.
        if (t.categorie === "pas_interesse" && m.from_email && !oppose) await opposerRefus(sql, m.from_email, p?.name ?? null);
        const aRegarder = ["interesse", "rendez_vous", "question", "client", "autre"].includes(t.categorie) || Boolean(t.aSignaler);
        const statut = ["spam", "automatique"].includes(t.categorie) ? "ignore" : aRegarder ? "a_traiter" : "traite";
        await sql`update public.mailbox_messages set status = ${statut}, category = ${t.categorie}, summary = ${t.resume},
                  review_reason = ${t.aSignaler} where id = ${m.id}`;
        if (statut === "ignore") bilan.ignores++;
        else if (statut === "a_traiter") bilan.a_traiter++;
        continue;
      }

      // d) Décision : part seule, ou attend Broise ?
      const raisons: string[] = [];
      if (!r.auto_reply_enabled) raisons.push("réponses automatiques coupées");
      if (!AUTONOMES.includes(t.categorie)) raisons.push(t.categorie === "interesse" ? "artisan intéressé : à toi de conclure" : `catégorie « ${t.categorie.replace("_", " ")} »`);
      if (!t.simple) raisons.push("l'agente préfère ta relecture");
      const sensibles = sujetsSensibles(m.subject, message, t.reponse);
      if (sensibles.length) raisons.push(`sujet sensible : ${sensibles.join(", ")}`);
      if (phrasesTropLongues(t.reponse).length) raisons.push("phrases trop longues à reprendre");
      if (t.reponse.includes("[LIEN DE LA MAQUETTE]")) raisons.push("lien de la maquette à coller à la place de [LIEN DE LA MAQUETTE]");
      if (/\bAmbroise\b/.test(t.reponse.split("Bien cordialement")[0])) raisons.push("parle d'Ambroise à la troisième personne");
      if (!p) raisons.push("expéditeur inconnu");
      if ((m.attachments ?? []).length) raisons.push("pièce jointe");
      if (t.aSignaler) raisons.push(t.aSignaler);
      const [{ aujourdhui }] = await sql<{ aujourdhui: number }[]>`
        select count(*)::int as aujourdhui from public.mailbox_messages
        where direction = 'sortant' and sent_by = 'agent' and status in ('valide', 'envoye')
          and created_at >= (date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')`;
      if (aujourdhui >= r.auto_reply_max_per_day) raisons.push("plafond du jour des réponses automatiques atteint");
      const [{ dansLeFil }] = await sql<{ dansLeFil: number }[]>`
        select count(*)::int as "dansLeFil" from public.mailbox_messages
        where direction = 'sortant' and sent_by = 'agent' and thread_id = ${threadId} and status in ('valide', 'envoye')`;
      if (dansLeFil >= MAX_AUTO_PAR_FIL) raisons.push("déjà 2 réponses automatiques dans cette conversation");

      const seule = raisons.length === 0;
      await sql.begin(async (tx) => {
        await tx`insert into public.mailbox_messages
                   (direction, thread_id, prospect_id, email_id, reply_to_id, to_email, subject, body_text,
                    status, review_reason, sent_by, category, is_demo)
                 values ('sortant', ${threadId}, ${p?.id ?? null}, ${envoi?.id ?? null}, ${m.id}, ${m.from_email},
                         ${objetReponse(m.subject)}, ${assemblerReponse(t.reponse, signature)},
                         ${seule ? "valide" : "a_valider"}, ${seule ? null : raisons.join(" · ")},
                         ${seule ? "agent" : null}, ${t.categorie}, ${SIMULATION})`;
        await tx`update public.mailbox_messages set status = 'traite', category = ${t.categorie}, summary = ${t.resume},
                 review_reason = ${t.aSignaler} where id = ${m.id}`;
      });
      if (seule) bilan.auto_envoyees++;
      else bilan.a_valider++;
      erreursDeSuite = 0;
      await journal(sql, taskId, "info", `${nomAffiche} : ${t.categorie.replace("_", " ")}, réponse ${seule ? "envoyée seule" : `à valider (${raisons.join(" · ")})`}.`);
    } catch (err) {
      bilan.erreurs++;
      erreursDeSuite++;
      await journal(sql, taskId, "error", `${de} : ${(err as Error).message}`);
      if (erreursDeSuite >= MAX_ERREURS_DE_SUITE) throw new Error(`${MAX_ERREURS_DE_SUITE} erreurs de suite : arrêt par sécurité.`);
    }
    await sql`update public.tasks set output = ${sql.json(bilan as never)} where id = ${taskId}`;
  }
}

async function opposerRefus(sql: Sql, email: string, nom: string | null) {
  await sql`insert into public.opposition_list (email, business_name, reason, notes, is_demo)
            values (${email}, ${nom}, 'refus', 'A répondu ne pas être intéressé (boîte mail).', ${SIMULATION})
            on conflict do nothing`;
}

const echapper = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const versHtml = (texte: string) =>
  `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#222">${
    texte.split(/\n{2,}/).map((b) => b.startsWith("> ")
      ? `<blockquote style="margin:0 0 0 8px;padding-left:10px;border-left:2px solid #ccc;color:#666">${echapper(b.replace(/^> ?/gm, "")).replace(/\n/g, "<br>")}</blockquote>`
      : `<p>${echapper(b).replace(/\n/g, "<br>")}</p>`).join("\n")}</div>`;

async function envoyer(sql: Sql, taskId: string): Promise<void> {
  const cle = process.env.RESEND_API_KEY;
  const expediteur = process.env.EMAIL_FROM;
  const repondreA = process.env.EMAIL_REPLY_TO || null;
  if (!cle || !expediteur) {
    console.log("Envoi des réponses pas encore branché (secrets RESEND_API_KEY / EMAIL_FROM).");
    return;
  }
  const heure = heureParis();
  if (!SIMULATION && (heure < 8 || heure >= 20)) {
    console.log("En dehors de 8 h – 20 h : les réponses validées partiront au prochain passage de la journée.");
    return;
  }

  const aEnvoyer = await sql<{ id: string; prospect_id: string | null; to_email: string; subject: string; body_text: string;
    category: string | null; name: string | null; recu_texte: string | null; recu_de: string | null; recu_date: Date | null;
    recu_message_id: string | null; recu_references: string | null }[]>`
    select s.id, s.prospect_id, s.to_email, s.subject, s.body_text, s.category, p.name,
           r.body_text as recu_texte, r.from_email as recu_de, coalesce(r.received_at, r.created_at) as recu_date,
           r.message_id as recu_message_id, r.references_ids as recu_references
    from public.mailbox_messages s
    left join public.prospects p on p.id = s.prospect_id
    left join public.mailbox_messages r on r.id = s.reply_to_id
    where s.direction = 'sortant' and s.status = 'valide'
    order by s.updated_at limit ${MAX_ENVOIS}`;

  let erreursDeSuite = 0;
  for (const [i, m] of aEnvoyer.entries()) {
    if (i > 0) await sleep(3_000);
    const qui = m.name ?? m.to_email;
    try {
      const [{ oppose }] = await sql<{ oppose: boolean }[]>`select public.is_opposed(${m.to_email}) as oppose`;
      if (oppose) {
        await sql`update public.mailbox_messages set status = 'erreur', error_message = 'Adresse sur la liste d''opposition.' where id = ${m.id}`;
        continue;
      }
      // La réponse cite le message reçu, comme une messagerie classique.
      let texte = m.body_text;
      if (m.recu_texte) {
        const date = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "short" }).format(new Date(m.recu_date ?? Date.now()));
        const cite = sansCitation(m.recu_texte).slice(0, 2000).split("\n").map((l) => `> ${l}`).join("\n");
        texte = `${texte}\n\nLe ${date}, ${m.recu_de} a écrit :\n\n${cite}`;
      }
      const enTetes: Record<string, string> = {};
      if (m.recu_message_id) {
        enTetes["In-Reply-To"] = m.recu_message_id;
        enTetes.References = [m.recu_references, m.recu_message_id].filter(Boolean).join(" ");
      }
      const res = await http(RESEND, {
        method: "POST",
        headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: expediteur,
          to: [m.to_email],
          ...(repondreA ? { reply_to: m.prospect_id ? adresseReponse(repondreA, m.prospect_id) : repondreA } : {}),
          subject: m.subject,
          text: texte,
          html: versHtml(texte),
          headers: enTetes,
        }),
      }, 30_000);
      if (!res.ok) throw new Error(`Resend : erreur ${res.status} ${(await res.text()).slice(0, 200)}`);
      const { id: providerId } = (await res.json()) as { id: string };
      await sql`update public.mailbox_messages set status = 'envoye', sent_at = now(), provider_id = ${providerId},
                error_message = null where id = ${m.id}`;
      if (m.category === "pas_interesse") await opposerRefus(sql, m.to_email, m.name);
      bilan.envoyes++;
      erreursDeSuite = 0;
      await journal(sql, taskId, "info", `${qui} : réponse envoyée.`);
    } catch (err) {
      bilan.erreurs++;
      erreursDeSuite++;
      const message = (err as Error).message;
      await sql`update public.mailbox_messages set status = 'erreur', error_message = ${message.slice(0, 500)} where id = ${m.id}`;
      await journal(sql, taskId, "error", `${qui} : ${message}`);
      if (erreursDeSuite >= MAX_ERREURS_DE_SUITE) throw new Error(`${MAX_ERREURS_DE_SUITE} erreurs de suite : envoi arrêté par sécurité.`);
    }
    await sql`update public.tasks set output = ${sql.json(bilan as never)} where id = ${taskId}`;
  }
}

async function main() {
  const sql = connecter();
  let taskId: string | null = null;
  let nom = "Inès";
  try {
    let r: Reglages | undefined;
    try {
      [r] = await sql<Reglages[]>`
        select display_name, enabled, instructions, signature, auto_reply_enabled, auto_reply_max_per_day
        from public.agent_settings where agent = 'boite'`;
      // Contacts de chauffe (migration 20261103000000_contacts_chauffe.sql) : liste vide tant qu'elle n'est pas appliquée.
      if (r) {
        r.contacts_chauffe = await sql<{ c: string[] }[]>`select contacts_chauffe c from public.agent_settings where agent = 'boite'`
          .then((x) => (x[0]?.c ?? []).map((a) => a.toLowerCase()))
          .catch(() => []);
      }
    } catch (err) {
      // Colonne absente (42703) = migration de la boîte mail pas encore lancée. Toute autre erreur remonte.
      if ((err as { code?: string }).code !== "42703") throw err;
      r = undefined;
    }
    if (!r) {
      console.log("Boîte mail pas encore installée : exécute la migration 20261027000000_boite_mail.sql dans Supabase.");
      return;
    }
    nom = r.display_name;
    if (!r.enabled) {
      console.log(`${nom} est en pause (page « Boîte mail ») : les e-mails restent dans la boîte, rien n'est envoyé.`);
      return;
    }

    // Boîtes de prospection (28/10) : un artisan qui répond à l'adresse d'envoi au lieu de l'adresse de réponse
    // arrive ici aussi (et les rebonds partent sur la liste d'opposition). Une boîte en panne n'arrête rien.
    const boites = lireBoites(process.env.BOITES_ENVOI);
    if (boites.length) {
      const rel = await releverBoites(sql, boites);
      if (rel.recus || rel.rebonds) console.log(`Boîtes de prospection : ${rel.recus} message(s) reçu(s), ${rel.rebonds} rebond(s).`);
      for (const e of rel.erreurs) console.log(`Relève impossible : ${e}`);
    }

    const [{ nouveaux, valides }] = await sql<{ nouveaux: number; valides: number }[]>`
      select count(*) filter (where direction = 'entrant' and status = 'nouveau')::int as nouveaux,
             count(*) filter (where direction = 'sortant' and status = 'valide')::int as valides
      from public.mailbox_messages`;
    // Rattrapage des STOP mal rangés (5/11), à chaque passage, même sans nouveau message.
    const rattrapes = await rattraperStop(sql, null);
    bilan.stop += rattrapes;
    if (nouveaux === 0 && valides === 0) {
      if (rattrapes) console.log(`${rattrapes} STOP mal rangé(s) rattrapé(s) et ajouté(s) à la liste d'opposition.`);
      console.log("Boîte à jour : aucun nouvel e-mail, aucune réponse à envoyer.");
      return;
    }

    const [tache] = await sql<{ id: string }[]>`
      insert into public.tasks (agent, title, status, input, attempts, started_at, is_demo)
      values ('boite', ${`${nom} : ${nouveaux} e-mail(s) reçu(s), ${valides} réponse(s) à envoyer`}, 'en_cours',
              ${sql.json({ nouveaux, valides, modele: MODELE })}, 1, now(), ${SIMULATION})
      returning id`;
    taskId = tache.id;

    if (nouveaux > 0) await trier(sql, taskId, r);
    await envoyer(sql, taskId);

    await sql`update public.tasks set status = 'terminee', finished_at = now(), output = ${sql.json(bilan as never)} where id = ${taskId}`;
  } catch (err) {
    const message = (err as Error).message;
    console.error(message);
    if (taskId) {
      await sql`update public.tasks set status = 'echouee', finished_at = now(), error_message = ${message},
                output = ${sql.json(bilan as never)} where id = ${taskId}`;
    }
    process.exitCode = 1;
  } finally {
    const texte = [
      `## ${nom} : boîte mail${SIMULATION ? " (simulation)" : ""}`,
      "",
      `Triés : **${bilan.tries}** · Réponses parties seules : ${bilan.auto_envoyees} · À valider : ${bilan.a_valider} · À regarder : ${bilan.a_traiter}`,
      `STOP : ${bilan.stop} · Rangés (automatiques, spam) : ${bilan.ignores} · Envoyés : ${bilan.envoyes} · Erreurs : ${bilan.erreurs} · Coût IA : ${bilan.cout_ia_eur.toFixed(4)} €`,
      bilan.arret ? `\n**Arrêt :** ${bilan.arret}` : "",
    ].join("\n");
    console.log(texte);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${texte}\n`);
    await sql.end();
  }
}

await main();
