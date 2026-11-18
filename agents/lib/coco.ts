// Coco, l'agente superviseuse (30/10) : elle relit les e-mails et les relances de Valérie « à valider »,
// avec l'œil de Broise (quelqu'un d'extérieur qui recevrait l'e-mail), et en pilote automatique :
//   • « ok »      → validé tel quel ;
//   • « corrige » → petites corrections (faute, tournure, objet), puis validé ;
//   • « garde »   → laissé « à valider » pour Broise, avec la raison (page /coco).
//     9/11 (choix de Broise : « qu'elle se fasse confiance ») : un premier e-mail gardé parce que le TEXTE est à revoir
//     est renvoyé seul à Valérie (remarque dans les notes, e-mail supprimé, réécrit au prochain passage), et un e-mail
//     gardé parce que la MAQUETTE ne va pas (métier faux) est renvoyé seul à Sid avec le bon métier (maquette archivée,
//     prospect « qualifié »). Exactement ce que faisaient les boutons de /coco. Garde-fou : au plus 2 renvois par artisan,
//     ensuite l'e-mail reste pour Broise. « artisan » (écarter) et « autre » restent toujours pour Broise.
//     17/11 (demande de Broise : « qu'elle ne me garde rien, qu'elle corrige tout toute seule ») : PLUS RIEN n'est gardé.
//     Tout problème est réglé par Coco elle-même (`regler`) :
//       - texte à revoir (ou cause « autre ») → Valérie le réécrit ; maquette fausse → Sid la refait (bon métier) ;
//       - pas une cible (cause « artisan »), adresse absente / en opposition / déjà contactée pour une autre fiche → artisan écarté ;
//       - l'artisan a écrit, ou son statut a changé → e-mail annulé (la conversation est dans la boîte mail) ;
//       - relance avec un problème → relance annulée (elle ne partira pas) ;
//       - après 2 renvois pour le même artisan → artisan écarté (pas de boucle sans fin).
//     Un e-mail annulé garde le statut « annule » (migration 20261117000000), donc Valérie ne le réécrit pas.
// D'abord des vérifications par le code (sans IA, toujours exactes), puis Claude Haiku pour la lecture.
// Les relances (texte fixe) n'ont besoin que des vérifications du code.
// Coco ne touche jamais aux réponses d'Inès, ni à la signature, ni aux mentions obligatoires, ni aux liens de paiement.
import type { Sql } from "./db.ts";
import { httpClaude, SIMULATION } from "./http.ts";
import { coutEur, MODELE } from "./haiku.ts";
import { LIEN_DEMO } from "./redaction-email.ts";
import { phrasesTropLongues } from "./style.ts";
import { METIERS } from "./metiers.ts";

/** D'où vient le problème d'un e-mail gardé (30/10) : qui doit le régler. */
export type Cause = "email" | "maquette" | "artisan" | "autre";
const LIBELLES_METIERS = METIERS.map((m) => m.label);

export type Verdict = "ok" | "corrige" | "garde" | "annule";

interface ARelire {
  id: string;
  prospect_id: string;
  campaign_id: string | null;
  subject: string;
  body: string;
  relance_de: string | null;
  name: string;
  category: string | null;
  city: string | null;
  email: string | null;
  email_source: string | null;
  prospect_status: string;
  current_website: string | null;
  website_quality: string | null;
  score: number | null;
  score_reason: string | null;
  slug: string | null;
  website_status: string | null;
  nom_affiche: string | null;
  origine_status: string | null;
  origine_sent_at: Date | null;
}

export interface BilanRelecture {
  relus: number;
  ok: number;
  corriges: number;
  gardes: number;
  /** 9/11 : renvoyés seuls à Valérie (texte) ou à Sid (maquette), au lieu d'attendre Broise. */
  renvoyes_valerie?: number;
  renvoyes_sid?: number;
  erreurs: number;
  cout_ia_eur: number;
  /** 17/11 : artisans écartés et e-mails / relances annulés par Coco (plus rien n'est gardé pour Broise). */
  ecartes?: number;
  annules?: number;
  arret?: string;
}

const FORMULE = "Bien cordialement,";

/** Le message rédigé par Valérie (avant la formule finale), et le reste (signature + mentions), intouchable. */
export function decouper(corps: string): { message: string; fin: string } {
  const i = corps.lastIndexOf(`\n${FORMULE}`);
  if (i === -1) return { message: corps, fin: "" };
  return { message: corps.slice(0, i).trimEnd(), fin: corps.slice(i) };
}

/**
 * Problèmes repérés par le code (sans IA). 17/11 : chacun dit aussi qui le règle :
 * « ecarter » (l'artisan n'est pas à contacter), « annuler » (e-mail à ne pas envoyer), « maquette » (Sid), « email » (Valérie).
 */
type Reglement = "ecarter" | "annuler" | "maquette" | "email";
interface Probleme { texte: string; reglement: Reglement }
async function verifierParLeCode(sql: Sql, e: ARelire): Promise<Probleme[]> {
  const p: Probleme[] = [];
  const ajouter = (texte: string, reglement: Reglement) => p.push({ texte, reglement });
  if (!e.email) ajouter("le prospect n'a plus d'adresse e-mail", "ecarter");
  else {
    const [{ oppose }] = await sql<{ oppose: boolean }[]>`select public.is_opposed(${e.email}) as oppose`;
    if (oppose) ajouter("l'adresse est sur la liste d'opposition", "ecarter");
    // Même adresse déjà contactée pour un AUTRE prospect (doublon dans la base).
    const [{ deja }] = await sql<{ deja: number }[]>`
      select count(*)::int as deja from public.emails x join public.prospects q on q.id = x.prospect_id
      where lower(q.email) = lower(${e.email}) and q.id <> ${e.prospect_id} and x.status in ('envoye', 'repondu')`;
    if (deja) ajouter("cette adresse a déjà reçu un e-mail pour une autre fiche (doublon)", "ecarter");
  }
  if (!e.slug) ajouter("la maquette n'a pas d'adresse publique", "maquette");
  else if (e.website_status && !["pret", "publie"].includes(e.website_status)) ajouter(`la maquette n'est pas prête (${e.website_status})`, "maquette");

  const enCours = e.relance_de ? ["contacte"] : ["nouveau", "qualifie", "demo_prete"];
  if (!enCours.includes(e.prospect_status)) ajouter(`le prospect est « ${e.prospect_status} »`, "annuler");

  // L'artisan a-t-il écrit (hors réponse automatique) ? Alors c'est une vraie conversation : à Broise.
  const [{ recus }] = await sql<{ recus: number }[]>`
    select count(*)::int as recus from public.mailbox_messages
    where prospect_id = ${e.prospect_id} and direction = 'entrant' and not auto_submitted
      and coalesce(category, '') not in ('automatique', 'spam', 'chauffe')`;
  if (recus) ajouter("l'artisan a déjà écrit : la conversation est dans la boîte mail", "annuler");
  if (e.relance_de && e.origine_status !== "envoye") ajouter("le premier e-mail n'est plus « envoyé » (réponse ou rebond entre-temps)", "annuler");

  const corps = e.body;
  if (corps.split(LIEN_DEMO).length !== 2) ajouter("le lien de la maquette manque ou apparaît plusieurs fois", "email");
  if (!corps.includes(FORMULE)) ajouter("la formule finale et la signature manquent", "email");
  if (!/STOP/.test(corps) || !corps.includes("donnees-personnelles")) ajouter("les mentions obligatoires (STOP, données personnelles) manquent", "email");
  if (/Prénom Nom/i.test(corps)) ajouter("la signature est encore « Prénom Nom » (à régler sur la page Valérie)", "email");
  const sansLien = corps.replaceAll(LIEN_DEMO, "");
  if (/\{\{|\}\}|\[[^\]]{0,40}\]|XXX|à compléter|lorem/i.test(sansLien)) ajouter("il reste un texte à remplir ({{…}}, […], XXX)", "email");
  if (/buy\.stripe|€|\beuros?\b|tarif|prix/i.test(decouper(corps).message)) ajouter("l'e-mail parle de prix ou de paiement", "email");
  if (!e.subject.trim() || e.subject.length > 90) ajouter("objet vide ou trop long", "email");
  if (/!/.test(e.subject)) ajouter("point d'exclamation dans l'objet", "email");
  return p;
}

const SYSTEME = `Tu es Coco, la superviseuse de Devanture, une micro-entreprise qui crée des sites web pour les artisans du bâtiment et du jardin.
Valérie a écrit un premier e-mail de prospection à un artisan, avec le lien d'une maquette de site préparée pour lui. Broise, le fondateur, te confie la relecture : tu regardes l'e-mail d'un œil extérieur, comme Broise le ferait, et comme l'artisan le recevra.

Ce qui doit être vrai :
- C'est bien la bonne entreprise : le nom cité correspond à l'entreprise, la commune et le métier sont cohérents.
- Rien d'inventé : pas de prix, de remise, de délai, de chiffres, d'avis, de chantiers, de certification qu'on ne connaît pas.
- Le ton est humain, poli et simple, à la première personne du singulier, en vouvoyant. Pas de « nous ». Pas commercial, pas insistant, pas de formules creuses (« booster votre visibilité », « n'hésitez pas »), pas de jargon.
- Le français est correct (orthographe, accords, ponctuation). Phrases courtes mais reliées. Pas de liste.
- L'e-mail se termine par une question simple. Il dit en une phrase que la maquette existe en deux styles, SAUF la version C (13/11) : un e-mail volontairement très court (35 à 60 mots), qui ne parle pas des deux styles et finit par une question à laquelle on répond en un mot (« Elle vous plaît ? ») ; c'est voulu, ne le rallonge pas et ne le garde pas pour ça.
- L'objet est naturel, concret, pas « publicitaire » (pas de majuscules partout, pas de point d'exclamation), de 25 à 70 caractères environ.
- Le lien ${LIEN_DEMO} est seul sur sa ligne, une seule fois : ne le change jamais.
- Le site actuel de l'artisan n'est évoqué qu'avec tact, et seulement d'après l'observation fournie.

Ce qui est VRAI et que tu ne dois pas mettre en doute (30/10) :
- La maquette contient une présentation de l'entreprise, ses prestations, sa zone d'intervention et un bouton pour demander un devis : « demander un devis en un clic », « vos prestations », « votre zone » sont donc exacts. Elle existe en deux styles sur la même page.
- L'argument « un seul chantier décroché grâce au site peut le rembourser » est voulu par Broise (version B du message) : ce n'est pas une promesse inventée.
- L'artisan a déjà été qualifié par Loïc. S'il vient de la liste officielle RGE de l'ADEME, c'est une entreprise certifiée et en activité. Une fiche Google peu remplie, un annuaire vide ou un code NAF voisin (charpente pour un couvreur, isolation ou fenêtres de toit pour un couvreur, plomberie pour un chauffagiste…) ne sont PAS des raisons de garder l'e-mail : beaucoup de petits artisans ont une présence en ligne très mince, et c'est justement pour ça qu'ils ont besoin d'un site.

Ta décision :
- « ok » : rien à redire, ou des détails qui ne valent pas une correction. C'est le cas le plus fréquent : ne corrige pas pour le plaisir.
- « corrige » : de petites retouches suffisent (faute, tournure maladroite, phrase trop longue, objet bancal, détail inventé à retirer). Renvoie alors l'objet et le texte complets corrigés, en gardant le même message, la même longueur environ, et ${LIEN_DEMO} tel quel. N'ajoute jamais de prix, de promesse ou d'information nouvelle.
- « garde » : seulement un vrai problème que l'artisan VERRAIT en lisant l'e-mail ou la maquette, et qu'une petite correction ne suffit pas à régler (tu le régleras toi-même grâce à « cause » : réécriture par Valérie, maquette refaite par Sid, ou artisan écarté). Par exemple : le nom ne correspond pas à l'entreprise ; le métier indiqué est clairement un AUTRE métier que le sien (un menuisier de portes et fenêtres présenté comme couvreur : la maquette lui proposerait des prestations qu'il ne fait pas) ; ce n'est visiblement pas un artisan (grande entreprise, enseigne nationale, administration, magasin) ; le texte est hors sujet ou gênant, ou il faudrait le réécrire entièrement.
  En cas de simple doute sans preuve, choisis « ok » : Broise préfère qu'un e-mail correct parte plutôt que d'être bloqué.
- avis : une phrase courte en français pour le journal de Broise (moins de 200 caractères) : ce que tu as vu ou corrigé.
- cause (seulement si « garde ») : d'où vient le problème, pour l'envoyer au bon agent.
  « email » = le texte est à revoir (Valérie le réécrira avec ta remarque) ; « maquette » = la maquette ne correspond pas à l'artisan, le plus souvent parce que le métier est faux (Sid la refera) ; « artisan » = ce n'est pas une cible (pas un artisan, enseigne nationale, magasin, administration) ; « autre » = rien de tout ça.
- metier (seulement si cause = « maquette » et que tu le sais) : le bon métier, choisi dans la liste.

Le texte que tu relis s'arrête avant la formule finale : la signature et les mentions légales sont ajoutées par le code, ne les écris pas.

Réponds uniquement avec l'outil « relire_email ».`;

const OUTIL = {
  name: "relire_email",
  description: "Enregistre la décision de Coco sur l'e-mail.",
  input_schema: {
    type: "object",
    properties: {
      verdict: { type: "string", enum: ["ok", "corrige", "garde"] },
      avis: { type: "string" },
      cause: { type: "string", enum: ["email", "maquette", "artisan", "autre"] },
      metier: { type: ["string", "null"], description: `Le bon métier, exactement l'un de : ${LIBELLES_METIERS.join(", ")} ; sinon null.` },
      objet: { type: "string", description: "Objet corrigé (seulement si verdict = corrige)." },
      texte: { type: "string", description: "Texte corrigé complet, sans formule finale ni signature (seulement si verdict = corrige)." },
    },
    required: ["verdict", "avis"],
  },
};

interface Lecture { verdict: Verdict; avis: string; cause: Cause; metier: string | null; objet?: string; texte?: string; coutEur: number; tokensEntree: number; tokensSortie: number }

async function lire(e: ARelire, message: string, consignes: string | null): Promise<Lecture> {
  if (SIMULATION) return { verdict: "ok", avis: "Simulation : relu sans IA.", cause: "autre", metier: null, coutEur: 0, tokensEntree: 0, tokensSortie: 0 };
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY manquante.");
  const donnees = {
    entreprise: e.name,
    nom_sur_la_maquette: e.nom_affiche,
    metier: e.category,
    commune: e.city,
    adresse_email_de_l_artisan: e.email,
    site_actuel: e.current_website,
    observation_du_site_actuel: e.website_quality,
    pourquoi_retenu: e.score_reason,
    source_de_l_adresse: e.email_source?.startsWith("rge:") ? "liste officielle RGE de l'ADEME (entreprise certifiée, en activité)" : e.email_source ? "site ou page publique de l'entreprise" : "inconnue",
    objet: e.subject,
    texte: message,
  };
  const res = await httpClaude("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODELE,
      max_tokens: 900,
      system: consignes ? `${SYSTEME}\n\nConsignes supplémentaires de Broise (à respecter) :\n${consignes}` : SYSTEME,
      tools: [OUTIL],
      tool_choice: { type: "tool", name: OUTIL.name },
      messages: [{ role: "user", content: JSON.stringify(donnees) }],
    }),
  }, 60_000);
  if (!res.ok) throw new Error(`API Claude : erreur ${res.status} ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { content: { type: string; input?: Record<string, unknown> }[]; usage: { input_tokens: number; output_tokens: number } };
  const s = data.content.find((c) => c.type === "tool_use")?.input;
  if (!s) throw new Error("API Claude : réponse sans décision.");
  const verdict = (["ok", "corrige", "garde"].includes(String(s.verdict)) ? s.verdict : "garde") as Verdict;
  const { input_tokens, output_tokens } = data.usage;
  return {
    verdict,
    cause: (["email", "maquette", "artisan", "autre"].includes(String(s.cause)) ? s.cause : "email") as Cause,
    metier: LIBELLES_METIERS.includes(String(s.metier)) ? String(s.metier) : null,
    avis: String(s.avis ?? "").replace(/\s+/g, " ").trim().slice(0, 300) || "Pas d'avis.",
    objet: typeof s.objet === "string" ? s.objet : undefined,
    texte: typeof s.texte === "string" ? s.texte : undefined,
    coutEur: coutEur(input_tokens, output_tokens),
    tokensEntree: input_tokens,
    tokensSortie: output_tokens,
  };
}

/** Une correction n'est acceptée que si elle reste sûre ; sinon l'e-mail est gardé pour Broise. */
function correctionSure(objet: string, texte: string, ancien: string): string | null {
  if (!objet || objet.length < 15 || objet.length > 90 || /!/.test(objet)) return "objet corrigé invalide";
  if (texte.split(LIEN_DEMO).length !== 2) return "le lien de la maquette a bougé";
  if (!texte.split("\n").some((l) => l.trim() === LIEN_DEMO)) return "le lien n'est plus seul sur sa ligne";
  if (texte.length < 0.6 * ancien.length || texte.length > 1.4 * ancien.length + 80) return "correction trop différente de l'original";
  if (/buy\.stripe|€|\beuros?\b|tarif|prix|https?:\/\//i.test(texte)) return "la correction ajoute un prix ou un lien";
  if (/bien cordialement|stop|données personnelles/i.test(texte)) return "la correction touche à la signature ou aux mentions";
  if (phrasesTropLongues(texte).length > 1) return "la correction garde des phrases trop longues";
  return null;
}

/** Colonnes coco_cause / coco_metier présentes ? (migration 20261030030000_coco_renvois.sql) */
let renvoisPrets: boolean | null = null;

async function noter(sql: Sql, id: string, verdict: Verdict, avis: string, maj?: { subject: string; body: string },
  renvoi?: { cause: Cause; metier: string | null }) {
  const statut = verdict === "garde" ? "a_valider" : verdict === "annule" ? "annule" : "valide";
  if (renvoisPrets === null) {
    const [{ ok }] = await sql<{ ok: boolean }[]>`
      select exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'emails' and column_name = 'coco_cause') as ok`;
    renvoisPrets = ok;
  }
  if (maj) {
    await sql`update public.emails set subject = ${maj.subject}, body = ${maj.body}, status = ${statut},
              coco_verdict = ${verdict}, coco_avis = ${avis}, coco_le = now() where id = ${id} and status = 'a_valider'`;
  } else {
    await sql`update public.emails set status = ${statut}, coco_verdict = ${verdict}, coco_avis = ${avis}, coco_le = now()
              where id = ${id} and status = 'a_valider'`;
  }
  if (renvoisPrets && verdict === "garde") {
    await sql`update public.emails set coco_cause = ${renvoi?.cause ?? "autre"}, coco_metier = ${renvoi?.metier ?? null}, coco_le = coco_le
              where id = ${id}`;
  }
}

const MAX_RENVOIS = 2;

/** Fin de phrase des journaux : « , 2 renvoyé(s) à Valérie, 1 à Sid » (rien s'il n'y en a pas). */
export function renvois(b: BilanRelecture): string {
  const v = b.renvoyes_valerie ?? 0, s = b.renvoyes_sid ?? 0, ec = b.ecartes ?? 0, an = b.annules ?? 0;
  return `${v ? `, ${v} renvoyé(s) à Valérie pour réécriture` : ""}${s ? `, ${s} renvoyé(s) à Sid pour refaire la maquette` : ""}`
    + `${ec ? `, ${ec} artisan(s) écarté(s)` : ""}${an ? `, ${an} e-mail(s) ou relance(s) annulé(s)` : ""}`;
}

/**
 * 17/11 : Coco règle elle-même tout problème (plus rien n'est gardé pour Broise). Renvoie ce qu'elle a fait.
 *  - relance → annulée ;
 *  - « annuler » → e-mail annulé (statut « annule ») ;
 *  - « ecarter » / cause « artisan » / déjà MAX_RENVOIS renvois → artisan écarté, e-mail annulé ;
 *  - « maquette » avec un métier connu → Sid refait la maquette (maquette archivée, prospect « qualifié ») ;
 *  - sinon → Valérie réécrit l'e-mail avec la remarque de Coco (e-mail supprimé, prospect inchangé).
 */
type Fait = "valerie" | "sid" | "ecarte" | "annule";
async function regler(sql: Sql, e: ARelire, avis: string, reglement: Reglement | "artisan", metier: string | null): Promise<Fait> {
  const avisCourt = avis.replace(/\s+/g, " ").slice(0, 300);
  const annuler = async (texte: string) => {
    await noter(sql, e.id, "annule", texte.slice(0, 900));
  };
  if (e.relance_de) { await annuler(`Relance annulée par Coco : ${avisCourt}`); return "annule"; }
  if (reglement === "annuler") { await annuler(`E-mail annulé par Coco : ${avisCourt}`); return "annule"; }

  const [p] = await sql<{ notes: string | null; category: string | null }[]>`
    select notes, category from public.prospects where id = ${e.prospect_id}`;
  const notes = (p?.notes ?? "").trim();
  const deja = notes.split("\n").filter((l) => l.startsWith("[Coco")).length;
  const ajouterNote = (ligne: string) => (notes ? `${notes}\n${ligne}` : ligne);

  let quoi: Reglement | "artisan" = reglement;
  if (quoi === "maquette") {
    const bon = metier && LIBELLES_METIERS.includes(metier) ? metier
      : p?.category && LIBELLES_METIERS.includes(p.category) ? p.category : null;
    if (!bon) quoi = "email"; else metier = bon;
  }
  if (quoi === "ecarter" || quoi === "artisan" || deja >= MAX_RENVOIS) {
    const pourquoi = deja >= MAX_RENVOIS && quoi !== "ecarter" && quoi !== "artisan"
      ? `déjà renvoyé ${deja} fois sans succès, ${avisCourt}` : avisCourt;
    await sql.begin(async (t) => {
      await t`update public.prospects set status = 'ecarte', notes = ${ajouterNote(`[Coco] écarté : ${pourquoi}`)}
              where id = ${e.prospect_id} and status in ('nouveau', 'qualifie', 'demo_prete')`;
    });
    await annuler(`Artisan écarté par Coco : ${pourquoi}`);
    return "ecarte";
  }
  await sql.begin(async (t) => {
    if (quoi === "maquette") {
      await t`update public.prospects set notes = ${ajouterNote(`[Coco → Sid] maquette refaite en ${metier} : ${avisCourt}`)},
              status = 'qualifie', category = ${metier} where id = ${e.prospect_id}`;
      await t`update public.websites set status = 'archive' where prospect_id = ${e.prospect_id} and kind = 'demo' and status <> 'archive'`;
    } else {
      // « [Coco] » est lu par Valérie comme remarque.
      await t`update public.prospects set notes = ${ajouterNote(`[Coco] ${avisCourt}`)} where id = ${e.prospect_id}`;
    }
    await t`delete from public.emails where id = ${e.id} and status = 'a_valider'`;
  });
  return quoi === "maquette" ? "sid" : "valerie";
}

/**
 * Relit au plus `max` e-mails « à valider » qu'elle n'a pas encore lus : les relances d'abord (elles ont une date),
 * puis les premiers e-mails dans l'ordre où l'envoi les prendra (meilleur score d'abord).
 */
export async function relire(sql: Sql, opts: { max: number; taskId: string | null; consignes: string | null; finAuPlusTard?: number;
  /** 3/11 : « relances » = seulement les relances (relues par l'envoi, qui vient de les préparer). */
  seulement?: "relances";
  journal?: (niveau: "info" | "warning" | "error", message: string) => Promise<void> }): Promise<BilanRelecture> {
  const bilan: BilanRelecture = { relus: 0, ok: 0, corriges: 0, gardes: 0, erreurs: 0, cout_ia_eur: 0 };
  const log = opts.journal ?? (async (_n, m) => console.log(m));
  const compter = async (fait: Fait, e: ARelire, avis: string, metier: string | null) => {
    const court = avis.replace(/\s+/g, " ").slice(0, 400);
    if (fait === "valerie") {
      bilan.renvoyes_valerie = (bilan.renvoyes_valerie ?? 0) + 1;
      await log("info", `Coco a renvoyé l'e-mail de ${e.name} à Valérie pour le réécrire : ${court}`);
    } else if (fait === "sid") {
      bilan.renvoyes_sid = (bilan.renvoyes_sid ?? 0) + 1;
      await log("info", `Coco a renvoyé ${e.name} à Sid pour refaire la maquette en ${metier ?? e.category} : ${court}`);
    } else if (fait === "ecarte") {
      bilan.ecartes = (bilan.ecartes ?? 0) + 1;
      await log("info", `Coco a écarté ${e.name} : ${court}`);
    } else {
      bilan.annules = (bilan.annules ?? 0) + 1;
      await log("info", `Coco a annulé ${e.relance_de ? "la relance" : "l'e-mail"} de ${e.name} : ${court}`);
    }
  };
  const liste = await sql<ARelire[]>`
    select e.id, e.prospect_id, e.campaign_id, e.subject, e.body, e.relance_de,
           p.name, p.category, p.city, p.email, p.email_source, p.status as prospect_status, p.current_website, p.website_quality,
           p.score, p.score_reason, w.slug, w.status as website_status, w.content->>'nom' as nom_affiche,
           o.status as origine_status, o.sent_at as origine_sent_at
    from public.emails e
    join public.prospects p on p.id = e.prospect_id
    left join public.websites w on w.id = e.website_id
    left join public.emails o on o.id = e.relance_de
    where e.status = 'a_valider' and e.coco_le is null and e.is_demo = ${SIMULATION}
      ${opts.seulement === "relances" ? sql`and e.relance_de is not null` : sql``}
    order by (e.relance_de is not null) desc, p.score desc nulls last, e.created_at
    limit ${opts.max}`;
  let erreursDeSuite = 0;
  for (const e of liste) {
    if (opts.finAuPlusTard && Date.now() > opts.finAuPlusTard) { bilan.arret = "Temps écoulé : la suite au prochain passage."; break; }
    try {
      bilan.relus++;
      const problemes = await verifierParLeCode(sql, e);
      if (problemes.length) {
        // Le règlement le plus fort l'emporte : écarter > annuler > maquette > e-mail.
        const ordre: Reglement[] = ["ecarter", "annuler", "maquette", "email"];
        const reglement = ordre.find((r) => problemes.some((x) => x.reglement === r)) ?? "email";
        const fait = await regler(sql, e, problemes.map((x) => x.texte).join(" ; "), reglement, null);
        await compter(fait, e, problemes.map((x) => x.texte).join(" ; "), null);
        continue;
      }
      if (e.relance_de) {
        await noter(sql, e.id, "ok", "Relance vérifiée : pas de réponse, pas de STOP, même fil.");
        bilan.ok++;
        continue;
      }
      const [budget] = await sql<{ depasse: boolean }[]>`select depasse from public.ai_budget_status`;
      if (budget?.depasse) { bilan.relus--; bilan.arret = "Budget IA du mois atteint : Coco ne relit plus (rien n'est validé sans elle)."; break; }

      const { message, fin } = decouper(e.body);
      const l = await lire(e, message, opts.consignes);
      bilan.cout_ia_eur = Math.round((bilan.cout_ia_eur + l.coutEur) * 1e6) / 1e6;
      if (l.coutEur > 0) {
        await sql`insert into public.costs (task_id, campaign_id, provider, category, amount_eur, description, is_demo)
                  values (${opts.taskId}, ${e.campaign_id}, 'anthropic', 'api', ${l.coutEur}, ${`Relecture de Coco (${MODELE}) : ${e.name}`}, ${SIMULATION})`;
      }
      if (l.verdict === "corrige" && l.objet && l.texte) {
        const objet = l.objet.replace(/\s+/g, " ").trim();
        const texte = l.texte.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
        const refus = correctionSure(objet, texte, message);
        if (refus) {
          const avis = `${l.avis} (sa correction était à refaire : ${refus})`;
          await compter(await regler(sql, e, avis, "email", null), e, avis, null);
        } else {
          await noter(sql, e.id, "corrige", l.avis, { subject: objet, body: `${texte}\n${fin}` });
          bilan.corriges++;
        }
      } else if (l.verdict === "corrige" || l.verdict === "garde") {
        const cause: Reglement | "artisan" = l.verdict === "corrige" ? "email"
          : l.cause === "maquette" ? "maquette" : l.cause === "artisan" ? "artisan" : "email";
        await compter(await regler(sql, e, l.avis, cause, l.metier), e, l.avis, l.metier);
      } else {
        await noter(sql, e.id, "ok", l.avis);
        bilan.ok++;
      }
      erreursDeSuite = 0;
    } catch (err) {
      bilan.erreurs++;
      erreursDeSuite++;
      await log("error", `Coco, ${e.name} : ${(err as Error).message}`);
      if (erreursDeSuite >= 3) { bilan.arret = "3 erreurs de suite : Coco s'arrête par sécurité."; break; }
    }
  }
  return bilan;
}
