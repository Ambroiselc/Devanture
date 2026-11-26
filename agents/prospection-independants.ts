// Loïc, nouvelle cible (26/11, décision de Broise) : photographes et coachs sportifs du Nord, du Pas-de-Calais,
// puis des départements voisins. Voir agents/lib/cible.ts.
//
// Méthode (testée le 26/11 sur 150 fiches : 11 retenus) :
//   1. Recherche Google « par lot » : une requête = jusqu'à 20 fiches avec site, note, nombre d'avis et téléphone
//      (Text Search Enterprise, 1 000 requêtes gratuites par mois : plafond suivi ci-dessous). Aucune fiche détaillée.
//   2. Visite du site : e-mail (même méthode que pour les artisans), réservation en ligne, tarifs affichés.
//   3. Règle : e-mail trouvé, moins de 30 avis, ni réservation en ligne ni tarifs → « qualifié » (Sid prend le relais).
//      Les autres sont enregistrés « écarté » avec la raison (pour ne jamais les relire).
// Un couple métier + commune n'est cherché qu'une fois : il devient une campagne « Indépendants · <métier> · <commune> ».
//
// Usage : node agents/prospection-independants.ts [--recherches 15]
import { parseArgs } from "node:util";
import { connecter, sansNul, type Sql } from "./lib/db.ts";
import { http, httpTenace, SIMULATION, USER_AGENT } from "./lib/http.ts";
import { analyserSite, estReseauSocial, hote } from "./lib/site.ts";
import { ajouterResume, masquer } from "./lib/sortie-publique.ts";
import { AVIS_MAX, METIERS_INDEPENDANTS, PRIX, RECHERCHE_METIER, RESA, type MetierIndep } from "./lib/cible.ts";

const { values: args } = parseArgs({ options: { recherches: { type: "string", default: "15" } } });

/** Départements parcourus, dans l'ordre. */
const DEPARTEMENTS = ["59", "62", "80", "02", "60"];
/** Communes d'au moins ce nombre d'habitants (les plus peuplées d'abord). */
const POPULATION_MIN = 8000;
/** Plafond mensuel de recherches (1 000 gratuites chez Google, on garde une marge). */
const PLAFOND_MOIS = 950;
/** Pages de 20 résultats pour une grande ville (chaque page = 1 recherche). */
const pagesPour = (population: number) => (population >= 100_000 ? 3 : population >= 40_000 ? 2 : 1);

interface Commune { code: string; nom: string; population: number; codesPostaux: string[]; zone: { sud: number; ouest: number; nord: number; est: number } }

async function communesDuDepartement(dep: string): Promise<Commune[]> {
  const res = await httpTenace(`https://geo.api.gouv.fr/departements/${dep}/communes?fields=nom,code,codesPostaux,population,bbox&format=json`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`geo.api.gouv.fr : erreur ${res.status} (département ${dep})`);
  const data = (await res.json()) as { nom: string; code: string; codesPostaux?: string[]; population?: number; bbox?: { coordinates?: number[][][] } }[];
  return data
    .filter((c) => (c.population ?? 0) >= POPULATION_MIN && c.bbox?.coordinates?.[0]?.length)
    .map((c) => {
      const pts = c.bbox!.coordinates![0];
      const lngs = pts.map((p) => p[0]);
      const lats = pts.map((p) => p[1]);
      return {
        code: c.code, nom: c.nom, population: c.population ?? 0, codesPostaux: c.codesPostaux ?? [],
        zone: { sud: Math.min(...lats), nord: Math.max(...lats), ouest: Math.min(...lngs), est: Math.max(...lngs) },
      };
    })
    .sort((a, b) => b.population - a.population);
}

interface Fiche {
  placeId: string; nom: string; adresse: string; site: string | null; nbAvis: number; note: number | null;
  statut: string | null; telephone: string | null;
}

const FIELD_MASK = [
  "places.id", "places.displayName", "places.formattedAddress", "places.websiteUri", "places.rating",
  "places.userRatingCount", "places.businessStatus", "places.nationalPhoneNumber", "nextPageToken",
].join(",");

async function rechercherLot(texte: string, c: Commune, pageToken?: string): Promise<{ fiches: Fiche[]; suivante: string | null }> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY manquante.");
  const res = await http("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELD_MASK },
    body: JSON.stringify({
      textQuery: `${texte} ${c.nom}`, languageCode: "fr", regionCode: "FR", pageSize: 20,
      locationRestriction: { rectangle: { low: { latitude: c.zone.sud, longitude: c.zone.ouest }, high: { latitude: c.zone.nord, longitude: c.zone.est } } },
      ...(pageToken ? { pageToken } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Google Places : erreur ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { nextPageToken?: string; places?: Array<{
    id: string; displayName?: { text?: string }; formattedAddress?: string; websiteUri?: string; rating?: number;
    userRatingCount?: number; businessStatus?: string; nationalPhoneNumber?: string;
  }> };
  const fiches = (data.places ?? []).map((p) => {
    masquer(p.displayName?.text, p.formattedAddress, p.websiteUri); // journaux publics
    return {
      placeId: p.id, nom: p.displayName?.text ?? "", adresse: p.formattedAddress ?? "", site: p.websiteUri ?? null,
      nbAvis: p.userRatingCount ?? 0, note: p.rating ?? null, statut: p.businessStatus ?? null, telephone: p.nationalPhoneNumber ?? null,
    };
  });
  return { fiches, suivante: data.nextPageToken ?? null };
}

const dansLaCommune = (f: Fiche, c: Commune) =>
  c.codesPostaux.some((cp) => f.adresse.includes(cp)) || f.adresse.toLowerCase().includes(c.nom.toLowerCase());

async function lire(url: string): Promise<{ html: string; url: string } | null> {
  try {
    const res = await http(url, { headers: { "user-agent": USER_AGENT, accept: "text/html" }, redirect: "follow" }, 10_000);
    if (!res.ok || !(res.headers.get("content-type") ?? "text/html").includes("html")) return null;
    return { html: (await res.text()).slice(0, 600_000), url: res.url || url };
  } catch { return null; }
}

const sansScripts = (html: string) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ");

/** Le site a-t-il déjà une réservation en ligne ou des tarifs ? (accueil + 2 pages tarifs / rendez-vous) */
async function equipement(site: string): Promise<{ repond: boolean; resa: boolean; prix: boolean }> {
  const accueil = await lire(site);
  if (!accueil) return { repond: false, resa: false, prix: false };
  let resa = RESA.test(accueil.html);
  let prix = PRIX.test(sansScripts(accueil.html));
  const liens = new Set<string>();
  for (const m of accueil.html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (!/tarif|prix|rendez|rdv|r[ée]serv|booking|prestation|s[ée]ance|formule/i.test(`${m[1]} ${m[2]}`)) continue;
    try { const u = new URL(m[1], accueil.url); if (u.hostname === new URL(accueil.url).hostname) liens.add(u.toString()); } catch { /* ignoré */ }
  }
  for (const page of [...liens].slice(0, 2)) {
    if (resa && prix) break;
    const p = await lire(page);
    if (!p) continue;
    resa ||= RESA.test(p.html);
    prix ||= PRIX.test(sansScripts(p.html));
  }
  return { repond: true, resa, prix };
}

async function recherchesDuMois(sql: Sql): Promise<number> {
  const [r] = await sql<{ n: number }[]>`
    select coalesce(sum((output->>'recherches')::int), 0)::int as n from public.tasks
    where agent = 'prospection' and output ? 'recherches' and output ? 'cible'
      and started_at >= date_trunc('month', now())`;
  return r?.n ?? 0;
}

async function main() {
  const sql = connecter();
  const bilan = { cible: "independants", recherches: 0, fiches: 0, deja_connues: 0, avec_email: 0, qualifies: 0, ecartes: 0, opposes: 0, erreurs: 0, couples: [] as string[], arret: undefined as string | undefined };
  let taskId: string | null = null;
  try {
    const [loic] = await sql<{ enabled: boolean }[]>`select enabled from public.agent_settings where agent = 'prospection'`;
    if (loic && !loic.enabled) { console.log("Loïc est en pause : rien à faire."); return; }
    const deja = await recherchesDuMois(sql);
    const budget = Math.min(Number.parseInt(args.recherches!, 10) || 15, PLAFOND_MOIS - deja);
    if (budget <= 0) { console.log(`Plafond du mois atteint (${deja} recherches Google) : rien à faire.`); return; }

    const [tache] = await sql<{ id: string }[]>`
      insert into public.tasks (agent, title, status, input, attempts, started_at, is_demo)
      values ('prospection', 'Loïc : photographes et coachs', 'en_cours', ${sql.json({ cible: "independants", recherches: budget })}, 1, now(), ${SIMULATION})
      returning id`;
    taskId = tache.id;

    // Couples déjà cherchés (une campagne par couple).
    const faits = new Set((await sql<{ name: string }[]>`select name from public.campaigns where name like 'Indépendants · %'`).map((r) => r.name));

    dehors: for (const dep of DEPARTEMENTS) {
      const communes = await communesDuDepartement(dep);
      for (const c of communes) {
        for (const metier of METIERS_INDEPENDANTS as readonly MetierIndep[]) {
          const nomCampagne = `Indépendants · ${metier} · ${c.nom} (${dep})`;
          if (faits.has(nomCampagne)) continue;
          if (bilan.recherches >= budget) { bilan.arret = `Budget de ${budget} recherche(s) atteint.`; break dehors; }
          const [camp] = await sql<{ id: string }[]>`
            insert into public.campaigns (name, description, status, target_city, target_category, started_at, is_demo)
            values (${nomCampagne}, 'Nouvelle cible du 26/11 : recherche Google par lot', 'en_cours', ${c.nom}, ${metier}, now(), ${SIMULATION})
            returning id`;
          faits.add(nomCampagne);
          bilan.couples.push(`${metier} · ${c.nom}`);
          let token: string | undefined;
          for (let page = 0; page < pagesPour(c.population) && bilan.recherches < budget; page++) {
            let lot: { fiches: Fiche[]; suivante: string | null };
            try { lot = await rechercherLot(RECHERCHE_METIER[metier], c, token); }
            catch (e) { bilan.erreurs++; console.log(`${nomCampagne} : ${(e as Error).message}`); break; }
            bilan.recherches++;
            for (const f of lot.fiches) {
              if (f.statut && f.statut !== "OPERATIONAL") continue;
              if (!dansLaCommune(f, c)) continue;
              const [connu] = await sql`select 1 from public.prospects where google_place_id = ${f.placeId}`;
              if (connu) { bilan.deja_connues++; continue; }
              bilan.fiches++;
              await traiter(sql, camp.id, metier, c, f, bilan);
            }
            if (!lot.suivante) break;
            token = lot.suivante;
            await new Promise((r) => setTimeout(r, 2000)); // Google demande un court délai avant la page suivante
          }
          await sql`update public.campaigns set status = 'terminee' where id = ${camp.id}`;
        }
      }
    }
    if (!bilan.arret && bilan.recherches < budget) bilan.arret = "Toutes les communes des départements prévus ont été cherchées.";
    await sql`update public.tasks set status = 'terminee', finished_at = now(), output = ${sql.json(bilan as never)} where id = ${taskId}`;
    const md = `## Loïc · photographes et coachs\n\n${bilan.recherches} recherche(s) Google (${deja + bilan.recherches} ce mois-ci sur ${PLAFOND_MOIS}), ${bilan.fiches} nouvelle(s) fiche(s), ${bilan.avec_email} avec e-mail, **${bilan.qualifies} qualifié(s)**, ${bilan.ecartes} écarté(s).\n\n${bilan.arret ?? ""}\n`;
    console.log(md);
    ajouterResume(md);
  } catch (err) {
    const message = (err as Error).message;
    console.error(message);
    if (taskId) await sql`update public.tasks set status = 'echouee', finished_at = now(), error_message = ${message}, output = ${sql.json(bilan as never)} where id = ${taskId}`;
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

async function traiter(sql: Sql, campagneId: string, metier: MetierIndep, c: Commune, f: Fiche, bilan: { avec_email: number; qualifies: number; ecartes: number; opposes: number }) {
  let raison: string | null = null;
  let email: string | null = null;
  let emailSource: string | null = null;
  let siteUrl: string | null = null;
  if (f.nbAvis >= AVIS_MAX) raison = `${f.nbAvis} avis Google : déjà une clientèle installée.`;
  else if (!f.site || estReseauSocial(f.site) || !hote(f.site)) raison = "Pas de vrai site : pas d'e-mail trouvable.";
  else {
    const [analyse, eq] = await Promise.all([analyserSite(f.site), equipement(f.site)]);
    siteUrl = analyse.url ?? f.site;
    email = analyse.email;
    emailSource = analyse.emailSource;
    // 26/11 : site hébergé en sous-domaine d'une plateforme (train.strivee.app) et adresse de la plateforme
    // (…@strivee.app) : ce n'est pas son adresse à elle.
    const h = hote(siteUrl) ?? "";
    const domaine = email?.split("@")[1] ?? "";
    if (email && h !== domaine && !h.startsWith("www.") && h.endsWith(`.${domaine}`)) { email = null; emailSource = null; }
    if (!eq.repond) raison = "Son site ne répond pas.";
    else if (!email) raison = "Pas d'e-mail trouvé sur son site.";
    else if (eq.resa) raison = "A déjà la réservation en ligne.";
    else if (eq.prix) raison = "Affiche déjà ses tarifs.";
  }
  if (email) {
    bilan.avec_email++;
    const [{ oppose }] = await sql<{ oppose: boolean }[]>`select public.is_opposed(${email}) as oppose`;
    if (oppose) { bilan.opposes++; raison = "Sur la liste d'opposition."; email = null; emailSource = null; }
  }
  const qualifie = raison === null;
  if (qualifie) bilan.qualifies++; else bilan.ecartes++;
  const ligne = {
    campaign_id: campagneId,
    name: f.nom,
    category: metier,
    address: f.adresse || null,
    city: c.nom,
    postal_code: f.adresse.match(/\b(\d{5})\b/)?.[1] ?? c.codesPostaux[0] ?? null,
    email: qualifie ? email : null,
    phone: f.telephone,
    current_website: siteUrl ?? f.site,
    has_website: Boolean(f.site),
    source: "Fiche Google (recherche par lot) + site",
    score: qualifie ? 80 : null,
    status: qualifie ? "qualifie" : "ecarte",
    notes: null,
    google_place_id: f.placeId,
    website_quality: qualifie ? "correct" : null,
    email_source: qualifie ? emailSource : null,
    score_reason: qualifie ? `Site sans réservation en ligne ni tarifs, ${f.nbAvis} avis Google.` : raison,
    last_checked_at: new Date(),
    is_demo: SIMULATION,
  };
  const colonnes = Object.keys(ligne) as (keyof typeof ligne)[];
  await sql`insert into public.prospects ${sql(sansNul(ligne), colonnes)}
            on conflict (google_place_id) where google_place_id is not null do nothing`;
}

await main();
