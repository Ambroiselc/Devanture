// Test n° 2 de la nouvelle cible (26/11, demande de Broise : « lance Loïc sur 150 avec la règle »).
// EN LECTURE SEULE : rien n'est écrit dans la base, aucun e-mail n'est envoyé.
//
// 1. Recherche Google « par lot » : une seule requête renvoie jusqu'à 20 fiches AVEC site, note et nombre d'avis
//    (Text Search Enterprise : facturé à la requête, 1 000 requêtes gratuites par mois, quota séparé de celui
//    des fiches détaillées de Loïc). Aucune fiche détaillée n'est lue.
// 2. Visite du site : e-mail (même méthode que Loïc), réservation en ligne, tarifs affichés.
// 3. Règle proposée à Broise : e-mail trouvé ET moins de 30 avis ET ni réservation en ligne ni tarifs.
// N'affiche que des totaux (journaux GitHub publics).
// Se lance quand tests/cible.txt change et que sa 1re ligne commence par « lot » (workflow diag-cible.yml).
import "./lib/sortie-publique.ts";
import { ajouterResume, masquer } from "./lib/sortie-publique.ts";
import { lireCommune, type Commune } from "./lib/geo.ts";
import { dansLaCommune, type FicheGoogle } from "./lib/places.ts";
import { analyserSite, estReseauSocial, hote } from "./lib/site.ts";
import { http, USER_AGENT } from "./lib/http.ts";

const OBJECTIF = Number(process.env.OBJECTIF_FICHES ?? 150);
const AVIS_MAX = 30;
const METIERS = ["sophrologue", "hypnothérapeute", "naturopathe", "coach sportif", "photographe"];
const COMMUNES = ["59350", "59512", "59599", "59009", "59378", "59328", "59017", "59368"];

const FIELD_MASK = [
  "places.id", "places.displayName", "places.formattedAddress", "places.websiteUri", "places.rating",
  "places.userRatingCount", "places.businessStatus", "places.primaryType", "places.types",
].join(",");

let requetes = 0;

async function rechercherLot(metier: string, commune: Commune): Promise<FicheGoogle[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY manquante.");
  requetes++;
  const res = await http("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELD_MASK },
    body: JSON.stringify({
      textQuery: `${metier} ${commune.nom}`, languageCode: "fr", regionCode: "FR", pageSize: 20,
      locationRestriction: { rectangle: {
        low: { latitude: commune.zone.sud, longitude: commune.zone.ouest },
        high: { latitude: commune.zone.nord, longitude: commune.zone.est },
      } },
    }),
  });
  if (!res.ok) throw new Error(`Google Places : erreur ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { places?: Array<{
    id: string; displayName?: { text?: string }; formattedAddress?: string; websiteUri?: string; rating?: number;
    userRatingCount?: number; businessStatus?: string; primaryType?: string; types?: string[];
  }> };
  return (data.places ?? []).map((p) => {
    masquer(p.displayName?.text, p.formattedAddress, p.websiteUri);
    return {
      placeId: p.id, nom: p.displayName?.text ?? "", adresse: p.formattedAddress ?? "", site: p.websiteUri ?? null,
      note: p.rating ?? null, nbAvis: p.userRatingCount ?? 0, statut: p.businessStatus ?? null,
      type: p.primaryType ?? null, types: p.types ?? [],
    };
  });
}

/** Réservation en ligne : plateformes connues ou modules de réservation des créateurs de sites. */
const RESA = /resalib\.fr|doctolib\.fr|planity\.com|calendly\.com|cal\.com\/|crenolibre\.fr|medoucine\.com|treatwell\.fr|booksy\.com|fresha\.com|simplybook\.|acuityscheduling|setmore\.com|zcal\.co|tidycal|agendize|clicrdv|rdv360|book-online|bookings-checkout|services-page|wix-bookings|webador[^"']*booking|reservation en ligne|réservation en ligne|réserver en ligne|prendre (?:un )?(?:rdv|rendez-vous) en ligne/i;
/** Tarifs : un montant en euros (de 15 à 499 €) écrit sur la page. */
const PRIX = /\b(?:[1-9]\d|[1-4]\d\d)(?:[.,]\d{2})?\s?(?:€|euros?\b|eur\b)/i;

async function lire(url: string): Promise<{ html: string; url: string } | null> {
  try {
    const res = await http(url, { headers: { "user-agent": USER_AGENT, accept: "text/html" }, redirect: "follow" }, 10_000);
    if (!res.ok || !(res.headers.get("content-type") ?? "text/html").includes("html")) return null;
    return { html: (await res.text()).slice(0, 600_000), url: res.url || url };
  } catch { return null; }
}

/** Liens internes vers les pages tarifs / rendez-vous (2 au plus). */
function pagesUtiles(html: string, base: string): string[] {
  const liens = new Set<string>();
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (!/tarif|prix|rendez|rdv|r[ée]serv|booking|prestation|s[ée]ance/i.test(`${m[1]} ${m[2]}`)) continue;
    try { const u = new URL(m[1], base); if (u.hostname === new URL(base).hostname) liens.add(u.toString()); } catch { /* ignoré */ }
  }
  return [...liens].slice(0, 2);
}

async function equipement(site: string): Promise<{ repond: boolean; resa: boolean; prix: boolean }> {
  const accueil = await lire(site);
  if (!accueil) return { repond: false, resa: false, prix: false };
  let resa = RESA.test(accueil.html);
  let prix = PRIX.test(accueil.html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " "));
  for (const page of pagesUtiles(accueil.html, accueil.url)) {
    if (resa && prix) break;
    const p = await lire(page);
    if (!p) continue;
    resa ||= RESA.test(p.html);
    prix ||= PRIX.test(p.html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " "));
  }
  return { repond: true, resa, prix };
}

interface Compte {
  fiches: number; avecSite: number; email: number; peuAvis: number; emailPeuAvis: number;
  resa: number; prix: number; ni: number; retenus: number;
}
const vide = (): Compte => ({ fiches: 0, avecSite: 0, email: 0, peuAvis: 0, emailPeuAvis: 0, resa: 0, prix: 0, ni: 0, retenus: 0 });
const parMetier = new Map<string, Compte>(METIERS.map((m) => [m, vide()]));
const total = vide();
const vus = new Set<string>();

const communes: Commune[] = [];
for (const c of COMMUNES) communes.push(await lireCommune(c));

// On tourne : métier 1 commune 1, métier 2 commune 1… jusqu'à l'objectif de fiches.
dehors: for (const commune of communes) {
  for (const metier of METIERS) {
    if (total.fiches >= OBJECTIF) break dehors;
    let lot: FicheGoogle[] = [];
    try { lot = await rechercherLot(metier, commune); } catch (e) { console.log(`${metier} ${commune.nom} : ${(e as Error).message}`); continue; }
    for (const f of lot) {
      if (total.fiches >= OBJECTIF) break;
      if (vus.has(f.placeId)) continue;
      vus.add(f.placeId);
      if (f.statut && f.statut !== "OPERATIONAL") continue;
      if (!dansLaCommune(f, commune)) continue;
      const c = parMetier.get(metier)!;
      const ajouter = (k: keyof Compte) => { c[k]++; total[k]++; };
      ajouter("fiches");
      const peuAvis = f.nbAvis < AVIS_MAX;
      if (peuAvis) ajouter("peuAvis");
      if (!f.site || estReseauSocial(f.site) || !hote(f.site)) continue;
      ajouter("avecSite");
      const [analyse, eq] = await Promise.all([analyserSite(f.site), equipement(f.site)]);
      if (!analyse.email) continue;
      ajouter("email");
      if (!peuAvis) continue;
      ajouter("emailPeuAvis");
      if (eq.resa) ajouter("resa");
      if (eq.prix) ajouter("prix");
      if (!eq.resa && !eq.prix) { ajouter("ni"); ajouter("retenus"); }
    }
  }
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : "—");
const md = [
  "## Test n° 2 de la nouvelle cible : recherche par lot + règle complète (lecture seule)",
  "",
  `Recherches Google (par lot de 20) : ${requetes}. Fiches détaillées lues : 0.`,
  "",
  "| Métier | Fiches | < 30 avis | Site | E-mail | E-mail et < 30 avis | dont réservation | dont tarifs | **Retenus** |",
  "|---|---|---|---|---|---|---|---|---|",
  ...[...parMetier.entries()].map(([m, c]) => `| ${m} | ${c.fiches} | ${c.peuAvis} | ${c.avecSite} | ${c.email} | ${c.emailPeuAvis} | ${c.resa} | ${c.prix} | **${c.retenus}** |`),
  `| **Total** | ${total.fiches} | ${total.peuAvis} | ${total.avecSite} | ${total.email} | ${total.emailPeuAvis} | ${total.resa} | ${total.prix} | **${total.retenus}** |`,
  "",
  `Entonnoir : ${total.fiches} fiches → ${total.email} avec e-mail (${pct(total.email, total.fiches)}) → ${total.emailPeuAvis} avec moins de ${AVIS_MAX} avis → **${total.retenus} retenus** (ni réservation ni tarifs), soit ${pct(total.retenus, total.fiches)} des fiches.`,
  "",
].join("\n");
console.log(md);
ajouterResume(md);
