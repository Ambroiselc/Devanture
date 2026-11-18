// =====================================================================
// Pedro, l'agent des sites définitifs (30/10)
//
// Préparer (--client <id>, ou --tout : tous les clients dont le contenu est arrivé et qui n'ont pas encore de site) :
//   1. part de la maquette du client, dans le style qu'il a choisi, avec son habillage ;
//   2. fait réécrire les textes par Claude Haiku avec ce que le client a envoyé (prestations, zone, horaires…),
//      plus les pages de prestation en formule Pro ;
//   3. prépare ses photos (remises droites, réduites, en WebP) et les fait légender par Claude Haiku, qui choisit
//      aussi la plus belle pour l'en-tête et écarte les photos floues ou sans rapport ;
//   4. assemble les pages (accueil, prestations, mentions légales), héberge les polices avec le site ;
//   5. publie le tout dans le stockage (dossier public « sites/<site>/ ») : l'aperçu est aussitôt visible sur
//      https://apercu.devanture-artisans.fr/<site>/ ;
//   6. passe la fiche à « Site en préparation » et prépare l'e-mail d'aperçu « à valider » (page Inès).
//
// Mettre en ligne (--en-ligne <id>) : quand le client a validé et que son domaine est branché sur Cloudflare,
//   refait les pages avec l'adresse définitive (Google, plan du site), relie le domaine et www au serveur des sites,
//   puis passe la fiche à « En ligne ».
//
// Lancement : fiche du client (page Clients), ou GitHub > Actions > « Pedro — sites des clients ».
// Secrets : SUPABASE_DB_URL, ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY (stockage),
// CLOUDFLARE_API_TOKEN et CLOUDFLARE_ACCOUNT_ID (domaines). Procédure : docs/sites-clients.md.
// =====================================================================
import { parseArgs } from "node:util";
import { appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { connecter, type Sql } from "./lib/db.ts";
import { SIMULATION } from "./lib/http.ts";
import { MODELE } from "./lib/haiku.ts";
import type { ContenuDemo } from "./lib/demo-artisan-pro.ts";
import type { StyleDemo } from "./lib/demo-styles.ts";
import { variantes } from "./lib/habillage.ts";
import { URL_APP } from "./lib/accueil.ts";
import type { PhotoSite, Reel } from "./lib/site-reel.ts";
import { construireSite, versSlug, type MentionsClient } from "./lib/site-final.ts";
import { legenderPhotos, redigerSite } from "./lib/redaction-site.ts";
import { preparerLogo, preparerPhoto, type PhotoPrete } from "./lib/photos.ts";
import { heberger, relier } from "./lib/polices.ts";
import { brancherAdresse, workerSitesExiste, zoneDuDomaine } from "./lib/cloudflare.ts";
import { redigerDemo } from "./lib/redaction-demo.ts";

export const APERCU = "https://apercu.devanture-artisans.fr";
const ZONE_APERCU = "devanture-artisans.fr";
/** Photos gardées sur le site : 10 pour l'Essentiel (galerie de 10 photos), 30 au plus pour le Pro. */
const PHOTOS_MAX = { essentiel: 10, pro: 30 } as const;
/** Pro : jusqu'à 5 pages = l'accueil + 4 pages de prestation. */
const PAGES_PRO = 4;
const OBJET_APERCU = "Votre site est prêt à regarder";

const { values: args } = parseArgs({
  options: {
    client: { type: "string", default: "" },
    tout: { type: "boolean", default: false },
    "en-ligne": { type: "string", default: "" },
  },
});

interface Client {
  id: string;
  prospect_id: string;
  formule: "essentiel" | "pro";
  etape: string;
  domaine: string | null;
  contenu: Record<string, string>;
  fichiers: { chemin: string; nom: string; sorte: string; taille: number; legende?: string }[];
  name: string;
  category: string | null;
  city: string | null;
  postal_code: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  siret: string | null;
  google_place_id: string | null;
  campaign_id: string | null;
}

interface SiteExistant { id: string; slug: string; content: ContenuDemo & { reel: Reel }; template: string | null }

const bilan = { sites: 0, en_ligne: 0, photos: 0, erreurs: 0, cout_ia_eur: 0, apercus: [] as string[], avertissements: [] as string[] };
let tokensEntree = 0;
let tokensSortie = 0;

// ---------------------------------------------------------------------------------------------
// Stockage Supabase
// ---------------------------------------------------------------------------------------------

function stockage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const cle = process.env.SUPABASE_SECRET_KEY;
  if (!url || !cle) {
    throw new Error("Il manque NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SECRET_KEY (secrets GitHub) : voir docs/sites-clients.md.");
  }
  return createClient(url.replace(/\/rest\/v1\/?$/, ""), cle, { auth: { persistSession: false } }).storage;
}

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8", css: "text/css; charset=utf-8", txt: "text/plain; charset=utf-8",
  xml: "application/xml", json: "application/json", webp: "image/webp", png: "image/png", jpg: "image/jpeg",
  woff2: "font/woff2",
};

async function telecharger(chemin: string): Promise<Buffer> {
  const { data, error } = await stockage().from("clients").download(chemin);
  if (error || !data) throw new Error(`fichier ${chemin.split("/").pop()} introuvable dans le stockage (${error?.message ?? "vide"})`);
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Publie les fichiers du site dans « sites/<slug>/ ». La liste des fichiers publiés est gardée dans
 * « sites/<slug>/_fichiers.json » : ceux qui ne servent plus sont retirés (sauf `garderAnciens`).
 */
async function publier(slug: string, fichiers: Map<string, Buffer | string>, garderAnciens = false) {
  const s = stockage().from("sites");
  let anciens: string[] = [];
  const { data: manifeste } = await s.download(`${slug}/_fichiers.json`);
  if (manifeste) {
    try { anciens = JSON.parse(await manifeste.text()) as string[]; } catch { anciens = []; }
  }
  for (const [chemin, contenu] of fichiers) {
    const ext = chemin.split(".").pop() ?? "";
    const type = TYPES[ext];
    if (!type) throw new Error(`type de fichier inattendu : ${chemin}`);
    const html = ext === "html" || ext === "txt" || ext === "xml";
    const { error } = await s.upload(`${slug}/${chemin}`, typeof contenu === "string" ? Buffer.from(contenu) : contenu, {
      contentType: type, upsert: true, cacheControl: html ? "60" : "31536000",
    });
    if (error) throw new Error(`stockage : ${chemin} (${error.message})`);
  }
  const tous = garderAnciens ? [...new Set([...anciens, ...fichiers.keys()])] : [...fichiers.keys()];
  const aRetirer = anciens.filter((f) => !tous.includes(f)).map((f) => `${slug}/${f}`);
  if (aRetirer.length) await s.remove(aRetirer);
  await s.upload(`${slug}/_fichiers.json`, Buffer.from(JSON.stringify(tous)), {
    contentType: "application/json", upsert: true, cacheControl: "60",
  });
}

/** Ajoute (ou retire, avec slug null) un domaine dans la table « domaine → site » lue par le Worker. */
async function majHotes(domaine: string, slug: string | null) {
  const s = stockage().from("sites");
  let table: Record<string, string> = {};
  const { data } = await s.download("_hotes.json");
  if (data) {
    try { table = JSON.parse(await data.text()) as Record<string, string>; } catch { table = {}; }
  }
  if (slug) table[domaine] = slug;
  else delete table[domaine];
  const { error } = await s.upload("_hotes.json", Buffer.from(JSON.stringify(table, null, 1)), {
    contentType: "application/json", upsert: true, cacheControl: "60",
  });
  if (error) throw new Error(`stockage : _hotes.json (${error.message})`);
}

// ---------------------------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------------------------

async function journal(sql: Sql, taskId: string, level: "info" | "warning" | "error", message: string) {
  console.log(`[${level}] ${message}`);
  await sql`insert into public.task_events (task_id, level, message, is_demo) values (${taskId}, ${level}, ${message}, ${SIMULATION})`;
}

const empreinte = (b: Buffer) => createHash("sha256").update(b).digest("hex").slice(0, 10);

/** Style choisi par le client sur sa page d'accueil (« Je vous laisse choisir » → le sobre, retenu le 23/10). */
const styleDuClient = (contenu: Record<string, string>): StyleDemo => (contenu.style === "chaleureux" ? "chaleureux" : "pro");

/** Pages HTML : les polices hébergées avec le site, reliées au bon niveau de dossier. */
async function avecPolices(pages: Map<string, string>): Promise<Map<string, Buffer | string>> {
  const sortie = new Map<string, Buffer | string>();
  const polices = await heberger(pages.get("index.html") ?? "");
  for (const [chemin, contenu] of pages) {
    const profondeur = chemin.split("/").length - 1;
    sortie.set(chemin, chemin.endsWith(".html") ? relier(contenu, polices, "../".repeat(profondeur)) : contenu);
  }
  if (polices) for (const [chemin, donnees] of polices.fichiers) sortie.set(chemin, donnees);
  return sortie;
}

async function chargerClient(sql: Sql, id: string): Promise<Client> {
  const [c] = await sql<Client[]>`
    select c.id, c.prospect_id, c.formule, c.etape, c.domaine, c.contenu, c.fichiers,
           p.name, p.category, p.city, p.postal_code, p.address, p.email, p.phone, p.siret, p.google_place_id, p.campaign_id
    from public.clients c join public.prospects p on p.id = c.prospect_id
    where c.id = ${id}`;
  if (!c) throw new Error(`Client ${id} introuvable.`);
  return c;
}

async function siteExistant(sql: Sql, prospectId: string): Promise<SiteExistant | null> {
  const [w] = await sql<SiteExistant[]>`
    select id, slug, content, template from public.websites
    where prospect_id = ${prospectId} and kind = 'production' and status <> 'archive'
    order by created_at desc limit 1`;
  return w ?? null;
}

// ---------------------------------------------------------------------------------------------
// Préparer le site
// ---------------------------------------------------------------------------------------------

async function preparer(sql: Sql, taskId: string, c: Client) {
  const nomClient = c.name;
  if (["abandonne", "resilie"].includes(c.etape)) throw new Error(`${nomClient} : fiche « ${c.etape} », pas de site.`);
  const [budget] = await sql<{ depasse: boolean }[]>`select depasse from public.ai_budget_status`;
  if (budget?.depasse) throw new Error("Budget IA du mois atteint : arrêt.");

  // 1. La maquette (la plus récente, même archivée), ou à défaut une nouvelle rédaction.
  const [demo] = await sql<{ content: ContenuDemo }[]>`
    select content from public.websites
    where prospect_id = ${c.prospect_id} and kind = 'demo' and content is not null
    order by (status <> 'archive') desc, created_at desc limit 1`;
  const commune = c.city ?? "votre secteur";
  let maquette = demo?.content ?? null;
  let cout = 0;
  if (!maquette) {
    await journal(sql, taskId, "info", `${nomClient} : pas de maquette, Pedro rédige d'abord les textes de base.`);
    const r = await redigerDemo({ nom: nomClient, metier: c.category ?? "Artisan", commune, adresse: c.address, email: c.email, texteSite: null }, [commune]);
    maquette = r.contenu;
    cout += r.coutEur;
    tokensEntree += r.tokensEntree;
    tokensSortie += r.tokensSortie;
  }
  const style = styleDuClient(c.contenu);

  // 2. Les textes, avec ce que le client a écrit.
  const nbPages = c.formule === "pro" ? PAGES_PRO : 0;
  const { textes, usage: u1 } = await redigerSite({
    nom: maquette.nom, metier: maquette.metier, commune: maquette.commune,
    prestations: c.contenu.prestations ?? null, zone: c.contenu.zone ?? null, horaires: c.contenu.horaires ?? null,
    telephone: c.contenu.telephone ?? c.phone ?? null, message: c.contenu.message ?? null,
    maquette, nbPages,
  });
  cout += u1.coutEur;
  tokensEntree += u1.tokensEntree;
  tokensSortie += u1.tokensSortie;

  // 3. Les photos et le logo.
  const binaires = new Map<string, Buffer>();
  const avertir = (t: string) => bilan.avertissements.push(`${nomClient} : ${t}`);
  let logo: Reel["logo"] = null;
  const fichierLogo = [...c.fichiers].reverse().find((f) => f.sorte === "logo");
  if (fichierLogo) {
    try {
      const l = await preparerLogo(fichierLogo.nom, await telecharger(fichierLogo.chemin));
      const nom = `logo-${empreinte(l.image)}.webp`;
      binaires.set(nom, l.image);
      logo = { src: `{{R}}${nom}`, largeur: l.largeur, hauteur: l.hauteur };
    } catch (err) {
      avertir(`logo écarté (${(err as Error).message}).`);
    }
  }
  const prets: (PhotoPrete & { nom: string; legende: string | null })[] = [];
  for (const f of c.fichiers.filter((x) => x.sorte === "photo").slice(0, 40)) {
    try {
      prets.push({ ...(await preparerPhoto(f.nom, await telecharger(f.chemin))), nom: f.nom, legende: f.legende ?? null });
    } catch (err) {
      avertir(`photo « ${f.nom} » écartée (${(err as Error).message}).`);
    }
  }
  const { avis, usage: u2 } = await legenderPhotos(prets.map((p) => p.miniature), maquette.metier,
    textes.services.map((s) => s.titre), prets.map((p) => p.legende));
  cout += u2.coutEur;
  tokensEntree += u2.tokensEntree;
  tokensSortie += u2.tokensSortie;

  const gardees = prets.map((p, i) => ({ p, a: avis[i] })).filter((x) => x.a?.garder !== false);
  const ecartees = prets.length - gardees.length;
  if (ecartees > 0) avertir(`${ecartees} photo(s) écartée(s) par Pedro (floues, documents ou sans rapport) : à vérifier sur l'aperçu.`);
  // La plus belle en premier (en-tête), puis les autres dans l'ordre d'envoi du client.
  const iVitrine = gardees.reduce((m, x, i) => (x.a.vitrine > gardees[m].a.vitrine ? i : m), 0);
  const ordre = gardees.length ? [gardees[iVitrine], ...gardees.filter((_, i) => i !== iVitrine)] : [];
  const photos: PhotoSite[] = ordre.slice(0, PHOTOS_MAX[c.formule]).map(({ p, a }) => {
    const h = empreinte(p.grande);
    binaires.set(`photos/${h}-1600.webp`, p.grande);
    binaires.set(`photos/${h}-800.webp`, p.petite);
    return { src: `{{R}}photos/${h}-1600.webp`, petit: `{{R}}photos/${h}-800.webp`, largeur: p.largeur, hauteur: p.hauteur, alt: a.alt, legende: a.legende, prestation: a.prestation };
  });
  if (ordre.length > photos.length) avertir(`${ordre.length - photos.length} photo(s) de plus que la formule n'en prévoit (${PHOTOS_MAX[c.formule]}) : non publiées.`);
  if (photos.length < 3) avertir(`seulement ${photos.length} photo(s) : le site sera plus beau avec 5 photos ou plus (redemander au client).`);
  bilan.photos += photos.length;

  // 4. Le site.
  const existant = await siteExistant(sql, c.prospect_id);
  const slug = existant?.slug ?? `${versSlug(maquette.nom, 40)}-${Math.random().toString(36).slice(2, 6)}`;
  const habillage = maquette.habillage ? structuredClone(maquette.habillage) : undefined;
  // Sans photo, pas d'en-tête « grande photo » (il resterait un trou).
  if (habillage && photos.length === 0) {
    if (variantes({ habillage }, "pro").entete === 2) habillage.pro.entete = 0;
    if (variantes({ habillage }, "chaleureux").entete === 2) habillage.chaleureux.entete = 0;
  }
  const reel: Reel = {
    telephone: textes.telephone,
    horaires: textes.horaires,
    logo,
    photos,
    avisUrl: c.google_place_id ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(c.google_place_id)}` : null,
    devis: { url: `${URL_APP}/api/devis`, site: slug },
    // Site déjà en ligne qu'on refait (modification mensuelle) : il garde son adresse définitive.
    domaine: existant?.content?.reel?.domaine ?? null,
    citation: textes.citation,
    pages: textes.pages.map((p) => ({
      ...p, slug: versSlug(textes.services[p.prestation]?.titre ?? p.titre, 40),
    })).filter((p, i, t) => t.findIndex((q) => q.slug === p.slug) === i && !["photos", "polices", "mentions-legales"].includes(p.slug)),
    description: textes.description,
  };
  const contenu: ContenuDemo & { reel: Reel } = {
    ...maquette,
    adresse: textes.afficherAdresse ? (c.address ?? maquette.adresse) : null,
    email: c.email ?? maquette.email,
    accroche: textes.accroche, intro: textes.intro, services: textes.services,
    zone: textes.zone, zoneTexte: textes.zoneTexte, apropos: textes.apropos,
    habillage, reel,
  };
  const mentions: MentionsClient = {
    entreprise: c.name, siret: c.siret, adresse: [c.address, c.postal_code && c.city ? `${c.postal_code} ${c.city}` : c.city].filter(Boolean).join(", ") || null,
    telephone: textes.telephone, email: c.email,
  };
  const pages = construireSite(contenu, style, mentions);
  const fichiers = await avecPolices(pages);
  for (const [k, v] of binaires) fichiers.set(k, v);

  // 5. Publication de l'aperçu.
  await publier(slug, fichiers);
  const apercu = reel.domaine ? `https://${reel.domaine}/` : `${APERCU}/${slug}/`;

  // 6. Base : le site, la fiche, l'e-mail d'aperçu à valider.
  await sql.begin(async (tx) => {
    if (existant) {
      await tx`update public.websites set content = ${tx.json(contenu as never)}, template = ${`site-${style}`},
               status = case when status = 'publie' then 'publie' else 'pret' end,
               url = case when status = 'publie' then url else ${apercu} end, updated_at = now()
               where id = ${existant.id}`;
    } else {
      await tx`insert into public.websites (prospect_id, kind, status, template, content, slug, url, is_demo)
               values (${c.prospect_id}, 'production', 'pret', ${`site-${style}`}, ${tx.json(contenu as never)}, ${slug}, ${apercu}, ${SIMULATION})`;
    }
    await tx`update public.clients set etape = 'site_en_preparation'
             where id = ${c.id} and etape in ('paye', 'contenu_demande', 'contenu_recu')`;
    await tx`insert into public.costs (task_id, campaign_id, provider, category, amount_eur, description, is_demo)
             values (${taskId}, ${c.campaign_id}, 'anthropic', 'api', ${cout}, ${`Site définitif (${MODELE}) : ${nomClient}`}, ${SIMULATION})`;
    if (c.email && !existant) {
      const [{ signature } = { signature: null }] = await tx<{ signature: string | null }[]>`
        select signature from public.agent_settings where agent = 'boite'`;
      const corps = [
        "Bonjour,",
        "",
        "Votre site est prêt. Vous pouvez le regarder ici, sur votre téléphone comme sur un ordinateur :",
        apercu,
        "",
        "Prenez le temps de tout relire. Dites-moi ce que vous voulez changer, même un détail, en répondant à cet e-mail.",
        "",
        "Quand tout vous convient, répondez simplement « c'est bon pour moi ». Je réserve alors votre adresse et je mets le site en ligne.",
        "",
        "Bien cordialement,",
        signature?.trim() || "Ambroise Le Clerc\nDevanture",
      ].join("\n");
      const [m] = await tx<{ id: string }[]>`
        insert into public.mailbox_messages (direction, prospect_id, to_email, subject, body_text, category, status,
                                             review_reason, sent_by, is_demo)
        values ('sortant', ${c.prospect_id}, ${c.email}, ${OBJET_APERCU}, ${corps}, 'client', 'a_valider',
                ${`Aperçu du site prêt : ouvre ${apercu} et relis-le avant de valider. Ensuite, passe la fiche à « Aperçu envoyé ».`},
                'agent', ${SIMULATION})
        returning id`;
      await tx`update public.mailbox_messages set thread_id = ${m.id} where id = ${m.id}`;
    }
  });
  bilan.cout_ia_eur = Math.round((bilan.cout_ia_eur + cout) * 1e6) / 1e6;
  bilan.sites++;
  bilan.apercus.push(`${nomClient} : ${apercu}`);
  await journal(sql, taskId, "info", `${nomClient} : site prêt (${style}, ${photos.length} photo(s), ${reel.pages.length} page(s) de prestation) → ${apercu}`);
}

// ---------------------------------------------------------------------------------------------
// Mettre en ligne
// ---------------------------------------------------------------------------------------------

async function mettreEnLigne(sql: Sql, taskId: string, c: Client) {
  const domaine = (c.domaine ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domaine)) {
    throw new Error(`${c.name} : pas de domaine noté sur la fiche (ex. hebert-couverture.fr).`);
  }
  if (!["valide", "domaine_achete", "en_ligne", "abonne"].includes(c.etape)) {
    throw new Error(`${c.name} : la fiche est à « ${c.etape} ». Le site se met en ligne après la validation écrite du client (fiche « Validé » ou « Domaine acheté »).`);
  }
  const site = await siteExistant(sql, c.prospect_id);
  if (!site) throw new Error(`${c.name} : pas encore de site préparé (bouton « Préparer le site »).`);
  const zone = await zoneDuDomaine(domaine);
  if (zone.statut !== "active") {
    throw new Error(`${domaine} est dans Cloudflare mais pas encore actif (statut « ${zone.statut} ») : vérifier les 2 serveurs DNS `
      + "de Cloudflare chez OVH, puis réessayer (ça peut prendre quelques heures).");
  }

  // Pages refaites avec l'adresse définitive (Google, partage, plan du site). Photos et logo ne changent pas.
  const contenu = { ...site.content, reel: { ...site.content.reel, domaine } };
  const style: StyleDemo = site.template === "site-chaleureux" ? "chaleureux" : "pro";
  const mentions: MentionsClient = {
    entreprise: c.name, siret: c.siret, adresse: [c.address, c.postal_code && c.city ? `${c.postal_code} ${c.city}` : c.city].filter(Boolean).join(", ") || null,
    telephone: contenu.reel.telephone, email: c.email,
  };
  const fichiers = await avecPolices(construireSite(contenu, style, mentions));
  await publier(site.slug, fichiers, true);
  await majHotes(domaine, site.slug);
  await majHotes(`www.${domaine}`, site.slug);
  await brancherAdresse(domaine, zone.id);
  await brancherAdresse(`www.${domaine}`, zone.id);

  await sql.begin(async (tx) => {
    await tx`update public.websites set content = ${tx.json(contenu as never)}, status = 'publie', url = ${`https://${domaine}/`},
             published_at = coalesce(published_at, now()), updated_at = now() where id = ${site.id}`;
    await tx`update public.clients set domaine = ${domaine},
             etape = case when etape in ('valide', 'domaine_achete') then 'en_ligne' else etape end,
             en_ligne_le = coalesce(en_ligne_le, current_date) where id = ${c.id}`;
  });
  bilan.en_ligne++;
  bilan.apercus.push(`${c.name} : https://${domaine}/`);
  await journal(sql, taskId, "info", `${c.name} : en ligne sur https://${domaine}/ (le certificat peut prendre quelques minutes).`);
}

// ---------------------------------------------------------------------------------------------

async function main() {
  const sql = connecter();
  let taskId: string | null = null;
  try {
    const enLigne = args["en-ligne"] || "";
    let ids: string[];
    if (enLigne) ids = [enLigne];
    else if (args.client) ids = [args.client];
    else if (args.tout) {
      ids = (await sql<{ id: string }[]>`
        select c.id from public.clients c
        where c.etape = 'contenu_recu'
          and not exists (select 1 from public.websites w
                          where w.prospect_id = c.prospect_id and w.kind = 'production' and w.status <> 'archive')
        order by c.contenu_recu_le nulls last limit 5`).map((r) => r.id);
    } else {
      throw new Error("Préciser --client <id>, --tout ou --en-ligne <id>.");
    }
    if (ids.length === 0) {
      console.log("Aucun client dont le contenu attend son site : rien à faire.");
      return;
    }

    const [tache] = await sql<{ id: string }[]>`
      insert into public.tasks (agent, title, status, input, attempts, started_at, is_demo)
      values ('site_production', ${enLigne ? "Pedro : mise en ligne" : `Pedro : ${ids.length} site(s)`}, 'en_cours',
              ${sql.json({ clients: ids, en_ligne: !!enLigne, modele: MODELE })}, 1, now(), ${SIMULATION})
      returning id`;
    taskId = tache.id;

    // Le serveur des sites et l'adresse des aperçus (vérifiés à chaque passage : rien n'est refait s'ils sont là).
    if (!(await workerSitesExiste())) {
      throw new Error("Le serveur des sites (Worker « devanture-sites ») n'est pas encore publié : lancer d'abord le workflow "
        + "« Sites des clients — serveur » (GitHub > Actions).");
    }
    try {
      await brancherAdresse("apercu.devanture-artisans.fr", (await zoneDuDomaine(ZONE_APERCU)).id);
    } catch (err) {
      await journal(sql, taskId, "warning", `Adresse des aperçus : ${(err as Error).message}`);
    }

    for (const id of ids) {
      const c = await chargerClient(sql, id);
      try {
        if (enLigne) await mettreEnLigne(sql, taskId, c);
        else await preparer(sql, taskId, c);
      } catch (err) {
        bilan.erreurs++;
        await journal(sql, taskId, "error", `${c.name} : ${(err as Error).message}`);
      }
    }
    for (const a of bilan.avertissements) await journal(sql, taskId, "warning", a);
    await sql`update public.tasks set status = ${bilan.erreurs && !bilan.sites && !bilan.en_ligne ? "echouee" : "terminee"},
              finished_at = now(), output = ${sql.json(bilan as never)}, tokens_input = ${tokensEntree},
              tokens_output = ${tokensSortie},
              error_message = ${bilan.erreurs && !bilan.sites && !bilan.en_ligne ? "Voir le journal de la tâche." : null}
              where id = ${taskId}`;
    if (bilan.erreurs && !bilan.sites && !bilan.en_ligne) process.exitCode = 1;
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
      `## Pedro : sites des clients${SIMULATION ? " (simulation)" : ""}`,
      "",
      `Sites préparés : **${bilan.sites}** · Mis en ligne : **${bilan.en_ligne}** · Photos : ${bilan.photos} · Erreurs : ${bilan.erreurs} · Coût IA : ${bilan.cout_ia_eur.toFixed(4)} €`,
      ...bilan.apercus.map((a) => `- ${a}`),
      ...(bilan.avertissements.length ? ["", "**À vérifier :**", ...bilan.avertissements.map((a) => `- ${a}`)] : []),
    ].join("\n");
    console.log(texte);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${texte}\n`);
    await sql.end();
  }
}

await main();
