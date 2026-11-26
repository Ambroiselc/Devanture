// Maquette PUBLIQUE d'un artisan : /m/<slug>, le lien envoyé dans les e-mails (DEMO_BASE_URL = …/m).
// Visible sans connexion. Les textes viennent de la fonction SQL public.maquette_publique, qui ne renvoie
// rien pour un prospect opposé, refusé ou écarté. ?style=pro | chaleureux : les deux styles, avec un sélecteur.
import { createClient } from "@supabase/supabase-js";
import { estStyle, renderAvecSelecteur } from "@/agents/lib/demo-styles";
import type { ContenuDemo } from "@/agents/lib/demo-artisan-pro";
import { isSupabaseConfigured, supabaseKey, supabaseUrl } from "@/lib/supabase/config";
import { estConnecte } from "@/lib/est-connecte";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { lireReseau } from "@/lib/reseau";
import { lireAppareil } from "@/lib/appareil";
import { bandeauInteret } from "@/lib/bandeau-interet";
import { moderniser } from "@/agents/lib/moderne";
import { renderIndependant, type ContenuIndependant } from "@/agents/lib/demo-independant";

const page = (html: string, status = 200) =>
  new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      // Les maquettes ne doivent pas apparaître sur Google.
      "x-robots-tag": "noindex, nofollow",
    },
  });

const introuvable = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Maquette introuvable</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#222">
<h1 style="font-size:1.4rem">Cette maquette n'est plus disponible</h1>
<p>Le lien a peut-être expiré. Répondez simplement à l'e-mail reçu : je vous renvoie la maquette.</p></body></html>`;

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isSupabaseConfigured || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return page(introuvable, 404);

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("maquette_publique", { p_slug: slug });
  const contenu = data as ContenuDemo | null;
  if (error || !contenu) return page(introuvable, 404);

  const url = new URL(req.url);
  const demande = url.searchParams.get("style");
  const style = estStyle(demande) ? demande : "chaleureux"; // 19/11 : chaleureux d'abord
  // Aperçu de Broise (2/11) : connecté au tableau de bord OU lien « ?apercu=1 » → visite jamais comptée.
  const apercu = url.searchParams.get("apercu") === "1" || (await estConnecte());
  // 19/11 : version « moderne » (animations, galerie qui défile) pour toutes les maquettes, validée par Broise ;
  // ?moderne=0 montre l'ancienne version (gardé par le sélecteur de style).
  const moderne = url.searchParams.get("moderne") !== "0";
  const suffixe = (apercu ? "&apercu=1" : "") + (moderne ? "" : "&moderne=0");
  // 26/11 : maquettes « indépendant » (photographes, coachs) : un seul style, déjà animé ; l'en-tête ne colle pas
  // sous le bandeau « Ce site pourrait être le vôtre ».
  const independant = (contenu as unknown as { modele?: string }).modele === "independant";
  const rendu = independant
    ? renderIndependant(contenu as unknown as ContenuIndependant).replace("</head>", "<style>header{position:relative!important}</style></head>")
    : renderAvecSelecteur(contenu, style, (s: string) => `/m/${slug}?style=${s}${suffixe}`);
  const brut = moderne && !independant ? moderniser(rendu) : rendu;
  // 13/11 : bandeau « Ce site m'intéresse », tout en haut et collé en haut de l'écran.
  const html = brut.replace("<body>", `<body>\n${bandeauInteret(slug, style, apercu)}`);
  const ajout = apercu ? bandeauApercu : compteur(slug);
  return page(html.includes("</body>") ? html.replace("</body>", `${ajout}</body>`) : html + ajout);
}

/** Petite pastille visible seulement en aperçu, pour savoir que la visite n'est pas comptée. */
const bandeauApercu = `<div style="position:fixed;left:12px;bottom:12px;z-index:9999;background:#111;color:#fff;font:600 12px/1.2 system-ui,sans-serif;padding:6px 10px;border-radius:999px;opacity:.85;pointer-events:none">👁 Aperçu — visite non comptée</div>`;

/**
 * Compteur de visites (30/10) : après 1,5 seconde passée sur la page (4 s jusqu'au 5/11, abaissé à la demande de Broise ;
 * les robots anti-virus des messageries, qui ouvrent les liens sans les lire, ne restent pas et se signalent souvent par
 * navigator.webdriver), le navigateur prévient le serveur. Durée (5/11) : un identifiant de visite tiré au hasard à
 * chaque ouverture (rien n'est gardé dans le navigateur), le temps passé onglet visible envoyé après 1,5 s, puis
 * toutes les 15 s et quand l'artisan quitte la page. Aucun cookie, aucune adresse IP : seulement la date, la durée et
 * le type d'appareil (téléphone ou ordinateur).
 */
function compteur(slug: string): string {
  const u = JSON.stringify(`/m/${slug}`);
  return `<script>(function(){if(navigator.webdriver)return;`
    + `var id=(Math.random().toString(36).slice(2,10)+Date.now().toString(36)).replace(/[^a-z0-9]/g,"").slice(0,24);`
    + `var app=/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)?"telephone":"ordinateur";`
    + `var vis=0,t0=null,compte=false,dernier=0;`
    + `function tot(){return vis+(t0?(Date.now()-t0)/1000:0)}`
    + `function envoi(p){var b=JSON.stringify({v:id,d:Math.round(tot()),a:app,p:p?1:0});`
    + `try{if(navigator.sendBeacon(${u},new Blob([b],{type:"text/plain"})))return}catch(e){}`
    + `try{fetch(${u},{method:"POST",body:b,keepalive:true})}catch(e){}}`
    + `function marche(){if(document.visibilityState==="visible"&&!t0)t0=Date.now()}`
    + `function pause(){if(t0){vis+=(Date.now()-t0)/1000;t0=null}}`
    + `marche();`
    + `setInterval(function(){if(!compte){if(tot()>=1.5){compte=true;dernier=tot();envoi(true)}}`
    + `else if(t0&&tot()-dernier>=15){dernier=tot();envoi(false)}},500);`
    + `document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible")marche();else{pause();if(compte){dernier=tot();envoi(false)}}});`
    + `window.addEventListener("pagehide",function(){pause();if(compte)envoi(false)})})();</script>`;
}

/** Visite comptée (appelée par le petit script ci-dessus). Ne renvoie rien. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // 13/11 : les robots (Microsoft 365 qui ouvre les liens de chaque e-mail reçu pour les vérifier, depuis ses serveurs ;
  // autres hébergeurs) ne sont jamais comptés. Reconnus par le réseau d'origine (lib/reseau.ts), jamais par l'IP.
  let cf: Record<string, unknown> | undefined;
  try { cf = getCloudflareContext().cf as Record<string, unknown> | undefined; } catch { cf = undefined; }
  const reseau = lireReseau(cf);
  if (reseau.robot) {
    console.log(`maquette ${slug} : robot ignoré (${reseau.reseau ?? "?"})`);
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  }
  // Sécurité en plus : une visite envoyée par quelqu'un de connecté (Broise) n'est jamais comptée.
  if (isSupabaseConfigured && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && !(await estConnecte())) {
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
    // 5/11 : le script envoie { v: visite, d: secondes, a: appareil, p: 1 au premier envoi }. Sans corps (anciennes
    // pages encore ouvertes) : seulement le compteur, comme avant.
    let corps: { v?: unknown; d?: unknown; a?: unknown; p?: unknown } | null = null;
    try { const t = (await req.text()).slice(0, 500); corps = t ? JSON.parse(t) : null; } catch { corps = null; }
    const visite = typeof corps?.v === "string" && /^[a-z0-9]{8,32}$/.test(corps.v) ? corps.v : null;
    if (!visite || corps?.p === 1) await supabase.rpc("maquette_vue", { p_slug: slug });
    if (!visite) console.error(`maquette ${slug} : visite sans identifiant (corps ${corps ? "illisible" : "vide"})`);
    if (visite) {
      const duree = Math.max(0, Math.min(7200, Math.round(Number(corps?.d) || 0)));
      const appareil = corps?.a === "telephone" || corps?.a === "ordinateur" ? corps.a : null;
      // 19/11 : système, navigateur, opérateur, pays et ville (comme le site vitrine) ; repli sur l'ancienne fonction
      // si la migration 20261119000000_visites_maquettes_reseau.sql n'est pas encore appliquée.
      const ua = lireAppareil(req.headers.get("user-agent") ?? "");
      let { error } = await supabase.rpc("maquette_visite", {
        p_slug: slug, p_visite: visite, p_duree: duree, p_appareil: appareil,
        p_systeme: ua.systeme, p_navigateur: ua.navigateur, p_reseau: reseau.reseau, p_pays: reseau.pays, p_ville: reseau.ville,
      });
      if (error) ({ error } = await supabase.rpc("maquette_visite", { p_slug: slug, p_visite: visite, p_duree: duree, p_appareil: appareil }));
      // 6/11 : visible dans les journaux Cloudflare (workflow « Diagnostic du tableau de bord ») si la durée ne s'enregistre pas.
      if (error) console.error(`maquette_visite ${slug} : ${error.message}`);
    }
  }
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
