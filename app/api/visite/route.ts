// Compteur de visites du SITE VITRINE (2/11) : devanture-artisans.fr envoie ici { page, ref, src } après 4 s
// passées sur la page (navigator.sendBeacon, texte brut, donc sans requête préalable CORS). Ni adresse IP, ni cookie.
// 13/11 : le script envoie aussi { v, d } (numéro de visite tiré au hasard à chaque chargement, secondes passées
// onglet visible ; n = 1 au 1er envoi) toutes les 15 s, au changement de page et en quittant → détail de la visite (public.site_visite :
// heure, durée, pages, provenance, appareil, système, navigateur). Ancien script sans « v » : visite de 4 s.
// Jamais compté : Broise connecté au tableau de bord (même site, ses cookies sont envoyés), robots, navigation interne.
import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseKey, supabaseUrl } from "@/lib/supabase/config";
import { estConnecte } from "@/lib/est-connecte";
import { lireAppareil } from "@/lib/appareil";
import { lireReseau } from "@/lib/reseau";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { estDomaineProspection } from "@/lib/domaines-prospection";

const VIDE = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

/** Provenance lisible, à partir du paramètre ?src= ou du site d'où vient le visiteur. */
function provenance(ref: string, src: string): string | null {
  // 13/11 : ?src=email ajouté par le renvoi de devanture-sites.fr (lien de la signature ou des mentions d'un e-mail).
  if (src === "email") return "e-mail de prospection";
  if (src) return src.slice(0, 40);
  let hote = "";
  try { hote = new URL(ref).hostname.toLowerCase(); } catch { return "direct ou e-mail"; }
  if (!hote) return "direct ou e-mail";
  if (hote === "devanture-artisans.fr" || hote === "www.devanture-artisans.fr") return null; // navigation interne
  if (hote === "app.devanture-artisans.fr" || estDomaineProspection(hote)) return "maquette";
  if (/(^|\.)google\./.test(hote) && !hote.startsWith("mail.")) return "google";
  if (/(^|\.)(bing|duckduckgo|qwant|ecosia|yahoo|lilo)\./.test(hote)) return "moteur de recherche";
  if (/^(mail\.|webmail|outlook\.|.*\.mail\.)/.test(hote) || /orange\.fr$|free\.fr$|sfr\.fr$|laposte\.net$/.test(hote)) return "messagerie";
  if (/facebook|instagram|linkedin|t\.co$|twitter|x\.com$/.test(hote)) return "réseaux sociaux";
  return hote.replace(/^www\./, "").slice(0, 40);
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured) return VIDE();
  const ua = req.headers.get("user-agent") ?? "";
  if (!ua || /bot|crawl|spider|preview|headless|lighthouse|monitor/i.test(ua)) return VIDE();
  let corps: { page?: unknown; ref?: unknown; src?: unknown; v?: unknown; d?: unknown; n?: unknown } = {};
  try { corps = JSON.parse((await req.text()).slice(0, 2000)); } catch { return VIDE(); }
  const page = typeof corps.page === "string" ? corps.page : "/";
  const ref = typeof corps.ref === "string" ? corps.ref : "";
  const src = typeof corps.src === "string" ? corps.src : "";
  const source = provenance(ref, src);
  const v = typeof corps.v === "string" && /^[a-z0-9]{8,32}$/.test(corps.v) ? corps.v : null;
  // Sans numéro de visite (ancien script encore en cache) ou sans source (navigation interne, sauf mise à jour), rien.
  if ((!source && !v) || (await estConnecte())) return VIDE();
  const duree = typeof corps.d === "number" && Number.isFinite(corps.d) ? Math.round(corps.d) : 4;
  const a = lireAppareil(ua);
  // 13/11 : réseau d'où vient la visite (opérateur, pays ; jamais l'IP) pour reconnaître les robots de Microsoft 365 & co.
  let cf: Record<string, unknown> | undefined;
  try { cf = getCloudflareContext().cf as Record<string, unknown> | undefined; } catch { cf = undefined; }
  const r = lireReseau(cf);
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const base = {
    p_visite: v ?? crypto.randomUUID().replace(/-/g, "").slice(0, 24), p_page: page, p_source: source, p_duree: duree,
    p_appareil: a.appareil, p_systeme: a.systeme, p_navigateur: a.navigateur,
  };
  let { error } = await supabase.rpc("site_visite", { ...base, p_reseau: r.reseau, p_pays: r.pays, p_robot: r.robot });
  // Migration 20261113010000_visites_site_robots.sql pas encore appliquée : version d'avant, sans les robots.
  if (error && !r.robot) ({ error } = await supabase.rpc("site_visite", base));
  if (error && !r.robot) {
    // Migration 20261113000000_visites_site_detail.sql pas encore appliquée : l'ancien compteur, 1re fois seulement.
    console.error(`site_visite : ${error.message}`);
    if (source && (!v || corps.n === 1)) {
      const r = await supabase.rpc("site_vue", { p_page: page, p_source: source });
      // 12/11 : l'erreur était ignorée, et la fonction plantait à chaque visite depuis le 2/11 sans que personne le voie.
      if (r.error) console.error(`site_vue : ${r.error.message}`);
    }
  }
  return VIDE();
}
