// =====================================================================
// Valérie envoie les e-mails VALIDÉS par Broise, avec une montée progressive (voir lib/rythme-envoi.ts).
//
// Canaux d'envoi (28/10) : les BOÎTES de prospection (secret BOITES_ENVOI, voir lib/boites-envoi.ts),
// chacune avec sa montée (5 → 25 par jour). Resend ne prospecte plus dès qu'il y a une boîte (ses conditions
// interdisent la prospection à froid) : il ne sert qu'aux réponses d'Inès.
//
// À chaque vague (4 par jour ouvré, vers 9 h, 11 h, 14 h et 16 h) :
//   1. relève les boîtes (rebonds → liste d'opposition ; réponses → boîte d'Inès) et suit chez Resend
//      les e-mails partis par Resend (rebond, signalement de spam → liste d'opposition) ;
//   2. calcule le quota du jour de chaque canal (palier de la demi-semaine, divisé par deux si un problème),
//      dans la limite du plafond de la page « Valérie » ;
//   3. envoie la part de cette vague en alternant les canaux, espacés de 30 s à 1 min 30 (donc 2 à 6 minutes
//      entre deux e-mails d'une même boîte), après avoir vérifié que l'adresse peut recevoir des e-mails
//      et qu'elle n'est pas sur la liste d'opposition.
//
// Rien ne part tant que :
//   • l'envoi n'est pas activé sur la page « Valérie » (send_enabled) ;
//   • EMAIL_FROM et DEMO_BASE_URL ne sont pas remplis, ou qu'il n'y a ni boîte (BOITES_ENVOI) ni RESEND_API_KEY
//     (DEMO_BASE_URL = adresse publique des maquettes, ex. https://app.devanture-artisans.fr/m).
// Test sans Internet ni clés : DEVANTURE_SIMULATION=1 sur une base locale.
// =====================================================================
import { parseArgs } from "node:util";
import { CIBLE, METIERS_INDEPENDANTS } from "./lib/cible.ts";
import { promises as dns } from "node:dns";
import { connecter, fermerTachesInterrompues, type Sql } from "./lib/db.ts";
import { http, sleep, SIMULATION } from "./lib/http.ts";
import { LIEN_DEMO, remplacerSignature } from "./lib/redaction-email.ts";
import { adresseReponse } from "./lib/boite.ts";
import { versHtml } from "./lib/email-html.ts";
import { preparerRelances } from "./lib/relance.ts";
import { relire as relireCoco, type BilanRelecture, renvois } from "./lib/coco.ts";
import { quotaResend, rythmeBoite, rythmeDuJour, vagueDuMoment, VAGUES_PAR_JOUR, DEBUT_VAGUES, type Rythme, type Sante } from "./lib/rythme-envoi.ts";
import { envoyerDepuis, expediteurPour, fermerTransports, lireBoites, releverBoites, type Boite } from "./lib/boites-envoi.ts";
import { ajouterResume } from "./lib/sortie-publique.ts";

const { values: args } = parseArgs({
  options: {
    // Pour un essai : ignore l'heure et envoie au plus ce nombre d'e-mails (dans la limite du quota du jour).
    essai: { type: "string", default: "" },
    // Envoie tout de suite UN e-mail validé précis (son identifiant), avec les mêmes vérifications et le même quota.
    email: { type: "string", default: "" },
    // Test de délivrabilité (27/10) : renvoie une COPIE d'un vrai e-mail déjà parti (le plus récent, ou --email),
    // construite exactement pareil (texte, HTML, image, en-têtes), vers cette adresse (ex. mail-tester.com).
    // Ne change rien dans la base et ne compte pas dans le quota.
    "copie-vers": { type: "string", default: "" },
    // Copie de chauffe (6/11) : le dernier PREMIER e-mail parti à un vrai artisan AVEC l'image de la maquette.
    "copie-image": { type: "boolean", default: false },
    // … ou SANS image (6/11 : comparaison de délivrabilité avec / sans image).
    "copie-sans-image": { type: "boolean", default: false },
  },
});

const RESEND = "https://api.resend.com/emails";
const MAX_ERREURS_DE_SUITE = 3;
/**
 * Part maximale de chaque vague réservée aux relances. 30/10 : 0,3 ; 5/11 : 1 (choix de Broise) — toutes les relances
 * dues partent d'abord, les nouveaux artisans prennent le reste des places. Avec 0,3, elles s'accumulaient (~12 par jour
 * pour ~21 dues) et environ la moitié des artisans n'auraient jamais été relancés (fenêtre de 30 jours).
 */
const PART_RELANCES = 1;

interface AEnvoyer {
  id: string;
  prospect_id: string;
  subject: string;
  body: string;
  with_image: boolean | null;
  email: string;
  name: string;
  slug: string | null;
  website_id: string | null;
  // Relance (30/10) : l'e-mail d'origine, pour répondre dans le même fil et depuis la même boîte.
  relance_de: string | null;
  origine_message_id: string | null;
  origine_canal: string | null;
}

/** Heure décimale à Paris (ex. 14.5 pour 14 h 30) et jour de la semaine (1 = lundi … 7 = dimanche). */
function heureParis(d: Date) {
  const p = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false })
    .formatToParts(d);
  const h = Number(p.find((x) => x.type === "hour")?.value ?? 0);
  const m = Number(p.find((x) => x.type === "minute")?.value ?? 0);
  const jour = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."].indexOf(p.find((x) => x.type === "weekday")?.value ?? "") + 1;
  return { heure: h + m / 60, jour };
}

/** L'adresse peut-elle recevoir des e-mails ? (son domaine a un serveur de messagerie) */
async function boiteValide(email: string): Promise<boolean> {
  if (SIMULATION) return !email.includes("invalide");
  const domaine = email.split("@")[1];
  try {
    const mx = await dns.resolveMx(domaine);
    return mx.length > 0;
  } catch {
    return false;
  }
}

async function journal(sql: Sql, taskId: string, level: "info" | "warning" | "error", message: string) {
  console.log(`[${level}] ${message}`);
  await sql`insert into public.task_events (task_id, level, message, is_demo) values (${taskId}, ${level}, ${message}, ${SIMULATION})`;
}

/** Un canal d'envoi : une boîte de prospection, ou Resend (l'ancien canal, en attendant). */
interface Canal {
  cle: string;            // adresse de la boîte, ou « resend »
  boite: Boite | null;
  rythme: Rythme;
  quota: number;          // e-mails autorisés aujourd'hui
  aujourdhui: number;     // déjà partis aujourd'hui
  part: number;           // à envoyer dans cette vague
  cetteVague: number;     // déjà envoyés depuis le début de la vague en cours (19/11)
}

interface Contenu {
  prospectId: string;
  a: string;
  objet: string;
  texte: string;
  lien: string;
  image: { contenu: Buffer; type: string } | null;
  /** Message-ID de l'e-mail auquel celui-ci fait suite (relance) : même fil chez l'artisan. */
  enReponseA?: string | null;
}

/**
 * Domaines alignés (9/11) : un e-mail parti d'une boîte de prospection (ex. a.leclerc@devanture-sites.fr) ne cite plus
 * devanture-artisans.fr. Le test d'orca.eu (Microsoft 365, 9/11) l'a classé en indésirable alors que SPF, DKIM et DMARC
 * passaient : réponse, lien et désabonnement vers un AUTRE domaine que l'expéditeur ressemblent à du hameçonnage, et
 * liaient la réputation de devanture-artisans.fr (réponses d'Inès, clients) à celle de la prospection.
 *   • réponse et désabonnement → la boîte elle-même, avec l'étiquette du prospect (a.leclerc+p-<id>@…, relevée par IMAP) ;
 *   • lien de la maquette et mentions → https://<domaine de la boîte>/m/<slug>, SEULEMENT si ce domaine sert déjà les
 *     maquettes (vérifié une fois par passage : la racine doit renvoyer vers le site vitrine, voir proxy.ts) ;
 *     sinon on garde app.devanture-artisans.fr, pour ne jamais envoyer un lien mort.
 */
const domainesServis = new Map<string, Promise<boolean>>();
function domaineServi(domaine: string): Promise<boolean> {
  let p = domainesServis.get(domaine);
  if (!p) {
    p = http(`https://${domaine}/`, { redirect: "manual" }, 10_000)
      .then((r) => r.status >= 300 && r.status < 400 && (r.headers.get("location") ?? "").includes("devanture-artisans.fr"))
      .catch(() => false)
      .then((ok) => {
        console.log(ok ? `Liens des maquettes sur ${domaine} (domaine aligné).`
          : `${domaine} ne sert pas encore les maquettes : liens laissés sur app.devanture-artisans.fr.`);
        return ok;
      });
    domainesServis.set(domaine, p);
  }
  return p;
}

/** Remplace devanture-artisans.fr par le domaine de la boîte (liens) ou par la boîte elle-même (adresses e-mail). */
function alignerDomaine(texte: string, boite: Boite): string {
  const domaine = boite.adresse.split("@")[1];
  return texte
    .replace(/https?:\/\/app\.devanture-artisans\.fr\/m\//gi, `https://${domaine}/m/`)
    .replace(/[\w.+-]+@devanture-artisans\.fr/gi, boite.adresse)
    .replace(/(?<![\w.@-])(?:www\.)?devanture-artisans\.fr/gi, domaine);
}

/** Envoie par le canal choisi. Renvoie l'identifiant chez Resend, ou le Message-ID pour une boîte. */
async function envoyer(canal: { cle: string; boite: Boite | null }, c: Contenu, env: { cle?: string; expediteur: string; repondreA: string | null }) {
  if (canal.boite && await domaineServi(canal.boite.adresse.split("@")[1])) {
    c = { ...c, texte: alignerDomaine(c.texte, canal.boite), lien: alignerDomaine(c.lien, canal.boite) };
  }
  // Boîte de prospection : réponse et désabonnement vers la boîte elle-même (même domaine que l'expéditeur).
  const base = canal.boite ? canal.boite.adresse : env.repondreA;
  const repondre = base ? adresseReponse(base, c.prospectId) : null;
  const entetes: Record<string, string> = base ? { "List-Unsubscribe": `<mailto:${repondre ?? base}?subject=STOP>` } : {};
  if (c.enReponseA && /^<[^<>\s]+@[^<>\s]+>$/.test(c.enReponseA)) {
    entetes["In-Reply-To"] = c.enReponseA;
    entetes.References = c.enReponseA;
  }
  const html = versHtml(c.texte, c.lien, c.image !== null);
  if (canal.boite) {
    return envoyerDepuis(canal.boite, {
      de: expediteurPour(env.expediteur, canal.boite.adresse), a: c.a, repondreA: repondre,
      objet: c.objet, texte: c.texte, html, image: c.image, entetes,
    });
  }
  const res = await http(RESEND, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.cle}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.expediteur,
      to: [c.a],
      // Adresse de réponse propre au prospect (ambroise+p-<id>@…) : la boîte mail sait qui répond.
      ...(repondre ? { reply_to: repondre } : {}),
      subject: c.objet,
      text: c.texte,
      html,
      ...(c.image ? { attachments: [{ filename: "maquettes.jpg", content: c.image.contenu.toString("base64"), content_type: c.image.type, content_id: "maquette" }] } : {}),
      headers: entetes,
    }),
  }, 30_000);
  if (!res.ok) throw new Error(`Resend : erreur ${res.status} ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { id: string }).id;
}

async function image(sql: Sql, m: AEnvoyer) {
  if (!m.with_image || !m.website_id) return null;
  // L'image « duo » (les deux styles côte à côte) ; à défaut, le style sobre.
  const [c] = await sql<{ image: Buffer; mime: string }[]>`
    select image, mime from public.website_captures where website_id = ${m.website_id}
    order by (style = 'duo') desc, (style = 'pro') desc limit 1`;
  return c ? { contenu: Buffer.from(c.image), type: c.mime } : null;
}

async function main() {
  const sql = connecter();
  await fermerTachesInterrompues(sql); // 19/11 : tâches restées « en cours » après un lancement annulé
  const bilan = { suivis: 0, rebonds: 0, plaintes: 0, envoyes: 0, relances_preparees: 0, adresses_invalides: 0, opposes: 0, erreurs: 0,
    quota: 0, palier: 0, ralenti: false, recus_boites: 0, canaux: {} as Record<string, { quota: number; envoyes: number }>,
    coco: undefined as BilanRelecture | undefined, arret: undefined as string | undefined };
  let taskId: string | null = null;
  try {
    const [r] = await sql<{ enabled: boolean; send_enabled: boolean; send_max_per_day: number; display_name: string; signature: string | null }[]>`
      select enabled, send_enabled, send_max_per_day, display_name, signature from public.agent_settings where agent = 'email'`;
    if (!r?.send_enabled || !r.enabled) {
      console.log("Envoi désactivé sur la page « Valérie » : rien n'est envoyé.");
      return;
    }
    const cle = process.env.RESEND_API_KEY;
    const expediteur = process.env.EMAIL_FROM;
    const baseDemo = process.env.DEMO_BASE_URL?.replace(/\/+$/, "");
    const repondreA = process.env.EMAIL_REPLY_TO || null;
    const boites = lireBoites(process.env.BOITES_ENVOI);
    const manquants = [!cle && !boites.length && "BOITES_ENVOI (ou RESEND_API_KEY)", !expediteur && "EMAIL_FROM", !baseDemo && "DEMO_BASE_URL"].filter(Boolean);
    if (manquants.length || !expediteur || !baseDemo) {
      console.log(`Envoi pas encore branché : il manque ${manquants.join(", ")} (secrets GitHub).`);
      return;
    }
    const env = { cle, expediteur, repondreA };

    if (args["copie-vers"]) {
      const dest = args["copie-vers"].trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(dest)) throw new Error(`Adresse de copie invalide : ${dest}`);
      const [m] = await sql<(AEnvoyer & { sender: string | null })[]>`
        select e.id, e.prospect_id, e.subject, e.body, e.with_image, e.sender, p.email, p.name, w.slug, w.id as website_id
        from public.emails e
        join public.prospects p on p.id = e.prospect_id
        left join public.websites w on w.id = e.website_id
        where e.status in ('envoye', 'repondu') and w.slug is not null
          ${args.email ? sql`and e.id = ${args.email}` : sql``}
          ${args["copie-image"] ? sql`and e.with_image = true and e.relance_de is null and e.is_demo = false and p.is_demo = false
                                     and p.status <> 'ecarte'` : sql``}
          ${args["copie-sans-image"] ? sql`and coalesce(e.with_image, false) = false and e.relance_de is null and e.is_demo = false
                                     and p.is_demo = false and p.status <> 'ecarte'` : sql``}
        order by e.sent_at desc nulls last limit 1`;
      if (!m) throw new Error("Aucun e-mail déjà envoyé (avec maquette) à copier.");
      // 6/11 : « ?apercu=1 » pour que la visite de la copie ne compte pas comme une ouverture de l'artisan.
      const lien = `${baseDemo}/${m.slug}?apercu=1`;
      const img = await image(sql, m);
      // Test du canal d'aujourd'hui : la boîte d'origine si c'en est une, sinon la première boîte ; Resend s'il n'y a aucune boîte.
      const boite = boites.find((b) => b.adresse === m.sender) ?? boites[0] ?? null;
      await envoyer({ cle: boite?.adresse ?? "resend", boite }, {
        // 6/11 : adresse de réponse sans l'identifiant de l'artisan (« +p-chauffe ») : une réponse à la copie n'est jamais
        // prise pour une réponse de l'artisan.
        prospectId: "chauffe", a: dest, objet: m.subject, lien, image: img,
        texte: remplacerSignature(m.body, r.signature ?? "").replaceAll(LIEN_DEMO, lien),
      }, env);
      const texteBilan = `## Copie de test envoyée\n\nCopie de l'e-mail à ${m.name} (${img ? "avec" : "sans"} image) envoyée à ${dest} depuis ${boite?.adresse ?? "Resend"}.`;
      console.log(texteBilan);
      ajouterResume(`${texteBilan}\n`);
      return;
    }

    const maintenant = new Date();
    const { heure, jour } = heureParis(maintenant);
    const essai = args.email ? 1 : Number.parseInt(args.essai!, 10);
    if (!essai && (jour >= 6 || heure < 8.5 || heure > 18)) {
      console.log("En dehors des heures de bureau (lundi au vendredi, 8 h 30 – 18 h) : rien n'est envoyé.");
      return;
    }

    // 19/11 : un envoi arrêté à la main sur GitHub (ou coupé) restait « En cours » pour toujours sur le tableau de bord.
    // Tout envoi encore « en cours » après 70 min (plafond du workflow : 60 min) est marqué « annulé ».
    await sql`update public.tasks set status = 'annulee', finished_at = coalesce(finished_at, now()),
              error_message = coalesce(error_message, 'Arrêté avant la fin (annulé sur GitHub ou coupé).')
              where agent = 'email' and status = 'en_cours' and title like '%: envoi%'
                and started_at < now() - interval '70 minutes'`;

    const [tache] = await sql<{ id: string }[]>`
      insert into public.tasks (agent, title, status, input, attempts, started_at, is_demo)
      values ('email', ${`${r.display_name} : envoi${essai ? " (essai)" : ""}`}, 'en_cours',
              ${sql.json({ envoi: true, essai: essai || null })}, 1, now(), ${SIMULATION})
      returning id`;
    taskId = tache.id;

    // 1a. Relève des boîtes : rebonds et réponses arrivées directement sur l'adresse d'envoi.
    if (boites.length) {
      const rel = await releverBoites(sql, boites);
      bilan.rebonds += rel.rebonds;
      bilan.recus_boites = rel.recus;
      for (const e of rel.erreurs) await journal(sql, taskId, "warning", `Relève de la boîte ${e}`);
      if (rel.rebonds) await journal(sql, taskId, "warning", `${rel.rebonds} rebond(s) dans les boîtes : adresses mises sur la liste d'opposition.`);
    }

    // 1b. Suivi chez Resend des e-mails partis par Resend ces 10 derniers jours (rebonds, signalements de spam).
    const suivre = !cle ? [] : await sql<{ id: string; provider_id: string; email: string | null; name: string }[]>`
      select e.id, e.provider_id, p.email, p.name from public.emails e join public.prospects p on p.id = e.prospect_id
      where e.status = 'envoye' and e.provider_id is not null and e.sent_at > now() - interval '10 days'
        and coalesce(e.sender, 'resend') = 'resend'
        and coalesce(e.delivery_status, '') not in ('bounced', 'complained')`;
    for (const s of suivre) {
      try {
        const res = await http(`${RESEND}/${s.provider_id}`, { headers: { Authorization: `Bearer ${cle}` } });
        if (!res.ok) continue;
        const evt = String(((await res.json()) as { last_event?: string }).last_event ?? "").replace(/^email\./, "");
        bilan.suivis++;
        await sql`update public.emails set delivery_status = ${evt || null}, delivery_checked_at = now() where id = ${s.id}`;
        if ((evt === "bounced" || evt === "complained") && s.email) {
          if (evt === "bounced") bilan.rebonds++; else bilan.plaintes++;
          await sql`insert into public.opposition_list (email, business_name, reason, notes, is_demo)
                    values (${s.email}, ${s.name}, ${evt === "bounced" ? "adresse_invalide" : "plainte"},
                            ${evt === "bounced" ? "Rebond à l'envoi (Resend)." : "Signalé comme spam (Resend)."}, ${SIMULATION})
                    on conflict do nothing`;
          await journal(sql, taskId, "warning", `${s.name} : ${evt === "bounced" ? "rebond" : "signalé comme spam"}, mis sur la liste d'opposition.`);
        }
      } catch {
        /* suivi impossible pour cet e-mail : on réessaiera à la vague suivante */
      }
    }

    // 1 bis. Relances dues (30/10) : préparées « à valider » sur la page Valérie (rien ne part sans Broise).
    let relancesPretes = false;
    try {
      const [{ ok }] = await sql<{ ok: boolean }[]>`
        select exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = 'emails' and column_name = 'relance_de') as ok`;
      relancesPretes = ok;
      if (ok && !args.email) {
        bilan.relances_preparees = await preparerRelances(sql, r.signature ?? "", SIMULATION);
        if (bilan.relances_preparees) await journal(sql, taskId, "info", `${bilan.relances_preparees} relance(s) préparée(s), à valider sur la page Valérie.`);
      }
    } catch (err) {
      await journal(sql, taskId, "warning", `Relances non préparées : ${(err as Error).message}`);
    }

    // 1 ter. Coco (30/10), en pilote automatique : relit les RELANCES qui viennent d'être préparées ci-dessus.
    //    Depuis le 3/11, les premiers e-mails sont relus juste après leur rédaction par Valérie (agents/emails.ts),
    //    plus à chaque vague. Si elle échoue, l'envoi continue avec ce qui était déjà validé.
    if (!args.email) {
      try {
        const [coco] = await sql<{ enabled: boolean; instructions: string | null }[]>`
          select enabled, instructions from public.agent_settings where agent = 'coco'`;
        if (coco?.enabled) {
          const rel = await relireCoco(sql, {
            max: 40, taskId, consignes: coco.instructions, finAuPlusTard: Date.now() + 8 * 60_000, seulement: "relances",
            journal: (niveau, message) => journal(sql, taskId!, niveau, message),
          });
          bilan.coco = rel;
          if (rel.relus) {
            await journal(sql, taskId, "info", `Coco a relu ${rel.relus} e-mail(s) : ${rel.ok} validé(s), ${rel.corriges} corrigé(s) puis validé(s), ${rel.gardes} gardé(s) pour Broise${renvois(rel)}.`);
          }
          if (rel.arret) await journal(sql, taskId, "warning", rel.arret);
        }
      } catch (err) {
        await journal(sql, taskId, "warning", `Coco n'a pas pu relire : ${(err as Error).message}`);
      }
    }

    // 2. Quota du jour, canal par canal (chaque boîte a sa montée ; Resend la sienne).
    // 19/11 : GitHub saute parfois un créneau programmé. Le workflow passe donc toutes les 30 min ; chaque vague a sa
    // plage horaire (DEBUT_VAGUES) et un passage n'envoie que ce qui manque à la vague en cours (« cette_vague »).
    const debutVague = DEBUT_VAGUES[vagueDuMoment(heure)];
    const minutesDansVague = Math.max(1, Math.round((heure - debutVague) * 60));
    const stats = await sql<{ canal: string; premier: Date | null; envoyes7j: number; rebonds7j: number; plaintes7j: number; aujourdhui: number; cette_vague: number }[]>`
      select coalesce(sender, 'resend') as canal, min(sent_at) as premier,
             count(*) filter (where sent_at > now() - interval '7 days')::int as envoyes7j,
             count(*) filter (where sent_at > now() - interval '7 days' and delivery_status = 'bounced')::int as rebonds7j,
             count(*) filter (where sent_at > now() - interval '7 days' and delivery_status = 'complained')::int as plaintes7j,
             count(*) filter (where sent_at >= (date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'))::int as aujourdhui,
             count(*) filter (where sent_at >= now() - make_interval(mins => ${minutesDansVague}))::int as cette_vague
      from public.emails where status in ('envoye', 'repondu') or (status = 'erreur' and sent_at is not null)
      group by 1`;
    const stat = (c: string) => stats.find((s) => s.canal === c) ?? { premier: null, envoyes7j: 0, rebonds7j: 0, plaintes7j: 0, aujourdhui: 0, cette_vague: 0 };
    const sante = (s: ReturnType<typeof stat>): Sante => ({ envoyes7j: s.envoyes7j, rebonds7j: s.rebonds7j, plaintes7j: s.plaintes7j });

    const canaux: Canal[] = boites.map((b) => {
      const s = stat(b.adresse);
      const rythme = rythmeBoite(s.premier ? new Date(s.premier) : null, maintenant, sante(s));
      return { cle: b.adresse, boite: b, rythme, quota: rythme.quota, aujourdhui: s.aujourdhui, cetteVague: s.cette_vague, part: 0 };
    });
    if (cle) {
      const s = stat("resend");
      const rythme = rythmeDuJour(s.premier ? new Date(s.premier) : null, maintenant, sante(s), r.send_max_per_day);
      const quota = boites.length ? quotaResend(rythme, boites.length) : rythme.quota;
      canaux.push({ cle: "resend", boite: null, rythme, quota, aujourdhui: s.aujourdhui, cetteVague: s.cette_vague, part: 0 });
    }
    // Plafond de la page « Valérie », pour tous les canaux ensemble (les boîtes d'abord).
    let plafond = Math.max(0, r.send_max_per_day - canaux.reduce((t, c) => t + c.aujourdhui, 0));
    for (const c of canaux) {
      const reste = Math.min(Math.max(0, c.quota - c.aujourdhui), plafond);
      plafond -= reste;
      c.quota = c.aujourdhui + reste;
    }
    bilan.quota = canaux.reduce((t, c) => t + c.quota, 0);
    bilan.palier = canaux.reduce((t, c) => t + c.rythme.palier, 0);
    bilan.ralenti = canaux.some((c) => c.rythme.ralenti);
    for (const c of canaux) {
      bilan.canaux[c.cle] = { quota: c.quota, envoyes: c.aujourdhui };
      if (c.rythme.ralenti) await journal(sql, taskId, "warning", `${c.cle === "resend" ? "Resend" : c.cle} : rythme divisé par deux (${c.rythme.raison}).`);
    }

    // Part de cette vague pour chaque canal ; en essai, au plus « essai » e-mails en tout.
    let budgetEssai = essai || Infinity;
    for (const c of canaux) {
      const reste = Math.max(0, c.quota - c.aujourdhui);
      // 19/11 (demande de Broise) : jamais plus d'un quart du quota du jour par vague (≈ 12-15 e-mails en tout avec
      // 2 boîtes à 25/jour), même si une vague a été sautée par GitHub. Sauf le rattrapage de fin de journée
      // (à partir de 17 h 30) : lui envoie tout ce qui reste du quota, d'un coup.
      const rattrapage = heure >= 17.5;
      const plafondVague = rattrapage ? Infinity : Math.max(0, Math.ceil(c.quota / VAGUES_PAR_JOUR) - c.cetteVague);
      // 20/11 (Broise : « une seule série par vague ») : la vague part en entier au premier passage (plafond de la vague,
      // dans la limite du quota restant). Avant, ceil(reste / vagues restantes) donnait 6 au lieu de 7 par boîte, et le
      // passage suivant envoyait les 2 manquants une demi-heure plus tard. Les passages en plus ne servent qu'en secours.
      c.part = Math.min(essai ? reste : Math.min(reste, plafondVague), budgetEssai);
      budgetEssai -= c.part;
    }
    // Ordre d'envoi : on alterne les canaux (boîte 1, boîte 2, …, boîte 1, …).
    const ordre: Canal[] = [];
    for (let tour = 0; ordre.length < canaux.reduce((t, c) => t + c.part, 0); tour++) {
      for (const c of canaux) if (tour < c.part) ordre.push(c);
    }
    if (ordre.length === 0) {
      bilan.arret = `Quota du jour atteint (${canaux.reduce((t, c) => t + c.aujourdhui, 0)} / ${bilan.quota}).`;
    }

    // 3. Les e-mails validés (30/10, revu le 5/11) : les relances dues prennent d'abord les places de la vague
    //    (PART_RELANCES = 1, les plus anciennes d'abord, fenêtre de 30 jours), puis les nouveaux artisans le reste. Parmi elles, celles des artisans qui ont ouvert leur maquette passent en premier. S'il manque de
    //    premiers e-mails validés, les relances prennent les places restantes.
    const adressesBoites = boites.map((b) => b.adresse);
    const selection = (relances: boolean, limite: number) => limite <= 0 || (relances && (!relancesPretes || !adressesBoites.length)) ? Promise.resolve([] as AEnvoyer[]) : sql<AEnvoyer[]>`
      select e.id, e.prospect_id, e.subject, e.body, e.with_image, p.email, p.name, w.slug, w.id as website_id,
             ${relancesPretes ? sql`e.relance_de, o.provider_id as origine_message_id, o.sender as origine_canal`
                              : sql`null::uuid as relance_de, null::text as origine_message_id, null::text as origine_canal`}
      from public.emails e
      join public.prospects p on p.id = e.prospect_id
      left join public.websites w on w.id = e.website_id
      ${relancesPretes ? sql`left join public.emails o on o.id = e.relance_de` : sql``}
      where e.status = 'valide' and p.email is not null
        ${args.email ? sql`and e.id = ${args.email}` : sql``}
        ${relancesPretes
          // Une relance ne part pas si l'artisan a répondu entre-temps (le premier e-mail est alors « repondu »).
          // 2/11 : une relance part UNIQUEMENT de la boîte du premier e-mail (même adresse, même fil). Exception : premier
          // e-mail parti par Resend → relance « nouvelle adresse » (e-mail neuf) depuis n'importe quelle boîte.
          ? (relances ? sql`and e.relance_de is not null and o.status = 'envoye'
                            and (o.sender = any(${adressesBoites}) or coalesce(o.sender, 'resend') = 'resend')` : sql`and e.relance_de is null`)
          : sql``}
        ${!relances && CIBLE === "independants" && !args.email
          // 26/11 (décision de Broise) : les PREMIERS e-mails ne partent plus qu'à la nouvelle cible (photographes, coachs).
          // Les relances des artisans déjà contactés continuent.
          ? sql`and p.category = any(${[...METIERS_INDEPENDANTS]})` : sql``}
      order by ${relances ? sql`coalesce(w.vues, 0) > 0 desc, o.sent_at,` : sql``} p.score desc nulls last, e.updated_at, e.created_at
      limit ${limite}`;
    const placesRelances = args.email ? ordre.length : Math.ceil(ordre.length * PART_RELANCES);
    const relancesVague = ordre.length === 0 ? [] : await selection(true, placesRelances);
    const premiers = ordre.length === 0 ? [] : await selection(false, ordre.length - relancesVague.length);
    const reste = ordre.length - relancesVague.length - premiers.length;
    const enPlus = reste <= 0 ? [] : (await selection(true, relancesVague.length + reste))
      .filter((x) => !relancesVague.some((y) => y.id === x.id)).slice(0, reste);
    const liste = [...relancesVague, ...enPlus, ...premiers];

    let erreursDeSuite = 0;
    let n = 0;
    for (const m of liste) {
      try {
        const [{ oppose }] = await sql<{ oppose: boolean }[]>`select public.is_opposed(${m.email}) as oppose`;
        if (oppose) { bilan.opposes++; await sql`update public.emails set status = 'erreur' where id = ${m.id}`; continue; }
        if (!m.slug) throw new Error("maquette sans adresse publique (slug manquant)");
        if (!(await boiteValide(m.email))) {
          bilan.adresses_invalides++;
          await sql`update public.emails set status = 'erreur', delivery_status = 'adresse_invalide' where id = ${m.id}`;
          await sql`insert into public.opposition_list (email, business_name, reason, notes, is_demo)
                    values (${m.email}, ${m.name}, 'adresse_invalide', 'Domaine sans serveur de messagerie.', ${SIMULATION})
                    on conflict do nothing`;
          continue;
        }
        // Relance (2/11) : OBLIGATOIREMENT depuis la boîte du premier e-mail. S'il ne lui reste plus de place dans cette
        // vague, la relance attend la suivante (elle reste « validée ») ; elle ne part jamais d'une autre adresse.
        const relanceMemeBoite = Boolean(m.relance_de && m.origine_canal && adressesBoites.includes(m.origine_canal));
        if (relanceMemeBoite) {
          const j = ordre.findIndex((c, k) => k >= n && c.cle === m.origine_canal);
          if (j < 0) { await journal(sql, taskId, "info", `${m.name} : relance remise à la prochaine vague (plus de place dans la boîte du premier e-mail).`); continue; }
          if (j > n) [ordre[n], ordre[j]] = [ordre[j], ordre[n]];
        }
        const canal = ordre[n];
        if (n > 0) await sleep(30_000 + Math.floor(Math.random() * 60_000)); // 30 s à 1 min 30 entre deux e-mails
        n++;

        const lien = `${baseDemo}/${m.slug}`;
        const img = await image(sql, m);
        const providerId = await envoyer(canal, {
          prospectId: m.prospect_id, a: m.email, objet: m.subject, lien, image: img,
          enReponseA: relanceMemeBoite ? m.origine_message_id : null,
          // Signature actuelle de la page « Valérie », même pour un e-mail rédigé avant son changement.
          texte: remplacerSignature(m.body, r.signature ?? "").replaceAll(LIEN_DEMO, lien),
        }, env);

        await sql`update public.emails set status = 'envoye', sent_at = now(), provider_id = ${providerId},
                  sender = ${canal.cle}, delivery_status = 'sent' where id = ${m.id}`;
        await sql`update public.prospects set status = 'contacte' where id = ${m.prospect_id} and status in ('demo_prete', 'qualifie', 'nouveau')`;
        bilan.envoyes++;
        bilan.canaux[canal.cle].envoyes++;
        erreursDeSuite = 0;
        await journal(sql, taskId, "info", `${m.name} : ${m.relance_de ? "relance envoyée" : "e-mail envoyé"}${img ? " (avec image)" : ""} depuis ${canal.boite?.adresse ?? "Resend"}.`);
      } catch (err) {
        bilan.erreurs++;
        erreursDeSuite++;
        await journal(sql, taskId, "error", `${m.name} : ${(err as Error).message}`);
        if (erreursDeSuite >= MAX_ERREURS_DE_SUITE) throw new Error(`${MAX_ERREURS_DE_SUITE} erreurs de suite : envoi arrêté par sécurité.`);
      }
      await sql`update public.tasks set output = ${sql.json(bilan as never)} where id = ${taskId}`;
      if (n >= ordre.length) break;
    }

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
    fermerTransports();
    const parCanal = Object.entries(bilan.canaux).map(([c, v]) => `${c === "resend" ? "Resend" : c} ${v.envoyes}/${v.quota}`).join(" · ");
    const texte = [
      `## Valérie : envoi${SIMULATION ? " (simulation)" : ""}`,
      "",
      `Envoyés : **${bilan.envoyes}** · Quota du jour : ${bilan.quota} (paliers ${bilan.palier}${bilan.ralenti ? ", ralenti" : ""})`,
      parCanal ? `Par canal (aujourd'hui / quota) : ${parCanal}` : "",
      `Rebonds : ${bilan.rebonds} · Signalements de spam : ${bilan.plaintes} · Adresses invalides : ${bilan.adresses_invalides} · Erreurs : ${bilan.erreurs}`,
      bilan.recus_boites ? `Messages reçus dans les boîtes (transmis à Inès) : ${bilan.recus_boites}` : "",
      bilan.coco?.relus ? `Coco : ${bilan.coco.relus} relu(s) · ${bilan.coco.ok} validé(s) · ${bilan.coco.corriges} corrigé(s) · ${bilan.coco.gardes} gardé(s) pour Broise` : "",
      bilan.arret ? `\n${bilan.arret}` : "",
    ].filter((l) => l !== "").join("\n");
    console.log(texte);
    ajouterResume(`${texte}\n`);
    await sql.end();
  }
}

await main();
