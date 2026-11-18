// =====================================================================
// Worker Cloudflare « devanture-sites » : sert les sites des clients de Devanture (Pedro, 30/10).
//
//   apercu.devanture-artisans.fr/<site>/…  → aperçu (jamais sur Google)
//   <domaine du client>/…                 → son site en ligne (www.<domaine> renvoie vers <domaine>)
//
// Les fichiers viennent du stockage Supabase, dossier public « sites/<site>/… », mis en cache par Cloudflare.
// La correspondance domaine → site est le fichier « sites/_hotes.json », tenu à jour par Pedro.
// Variable : SUPABASE_URL (https://xxxx.supabase.co). Aucun secret.
// =====================================================================

interface Env {
  SUPABASE_URL: string;
}

const APERCU = "apercu.devanture-artisans.fr";

/** Options de cache propres à Cloudflare (absentes des types standard de fetch). */
type InitCf = RequestInit & { cf?: Record<string, unknown> };
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Type de chaque fichier d'après son extension (ne dépend pas de ce que le stockage a retenu). */
const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8", css: "text/css; charset=utf-8", txt: "text/plain; charset=utf-8",
  xml: "application/xml; charset=utf-8", json: "application/json", webp: "image/webp", png: "image/png",
  jpg: "image/jpeg", woff2: "font/woff2", ico: "image/x-icon",
};

const securite: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "x-frame-options": "SAMEORIGIN",
};

function page(statut: number, titre: string, texte: string, robots = true): Response {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titre}</title></head><body style="font-family:system-ui,sans-serif;max-width:34rem;margin:15vh auto;padding:0 1rem;color:#222">
<h1 style="font-size:1.4rem">${titre}</h1><p>${texte}</p></body></html>`;
  return new Response(html, {
    status: statut,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...securite,
      ...(robots ? { "x-robots-tag": "noindex" } : {}) },
  });
}

/** Domaine → site, d'après sites/_hotes.json (gardé 2 minutes en cache). */
async function hotes(env: Env): Promise<Record<string, string>> {
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/public/sites/_hotes.json`, {
    cf: { cacheEverything: true, cacheTtl: 120 },
  } as InitCf);
  if (!res.ok) return {};
  try {
    return (await res.json()) as Record<string, string>;
  } catch {
    return {};
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method !== "GET" && req.method !== "HEAD") return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
    const url = new URL(req.url);
    const hote = url.hostname.toLowerCase();
    let site: string;
    let chemin: string;
    const apercu = hote === APERCU;

    if (apercu) {
      const [, premier, ...reste] = url.pathname.split("/");
      if (!premier) return page(200, "Aperçus Devanture", "Ouvrez le lien d'aperçu que vous avez reçu par e-mail.");
      if (!SLUG.test(premier)) return page(404, "Page introuvable", "Ce lien d'aperçu n'existe pas.");
      if (reste.length === 0) return Response.redirect(`${url.origin}/${premier}/${url.search}`, 301);
      site = premier;
      chemin = reste.join("/");
    } else {
      const table = await hotes(env);
      if (hote.startsWith("www.") && table[hote.slice(4)]) {
        return Response.redirect(`https://${hote.slice(4)}${url.pathname}${url.search}`, 301);
      }
      const s = table[hote];
      if (!s || !SLUG.test(s)) return page(404, "Site en préparation", "Ce site sera bientôt en ligne.");
      site = s;
      chemin = url.pathname.slice(1);
    }

    // Adresses « propres » : /prestation → /prestation/ ; un dossier sert son index.html.
    if (chemin.includes("..")) return page(400, "Adresse invalide", "Cette adresse n'est pas valide.");
    const dernier = chemin.split("/").pop() ?? "";
    if (chemin && !chemin.endsWith("/") && !dernier.includes(".")) {
      return Response.redirect(`${url.origin}${url.pathname}/${url.search}`, 301);
    }
    if (chemin === "" || chemin.endsWith("/")) chemin += "index.html";

    const html = chemin.endsWith(".html");
    // Les photos et polices ont un nom qui change avec leur contenu : on peut les garder longtemps.
    const duree = html || /\.(txt|xml|json)$/.test(chemin) ? 300 : 31_536_000;
    const source = await fetch(`${env.SUPABASE_URL}/storage/v1/object/public/sites/${site}/${chemin}`, {
      cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": duree, "400-499": 30, "500-599": 0 } },
    } as InitCf);
    if (source.status === 404 || source.status === 400) {
      const accueil = apercu ? `/${site}/` : "/";
      return page(404, "Page introuvable", `Cette page n'existe pas (ou plus). <a href="${accueil}">Revenir à l'accueil</a>.`, apercu);
    }
    if (!source.ok) return page(502, "Site momentanément indisponible", "Réessayez dans un instant.", apercu);

    const ext = chemin.split(".").pop() ?? "";
    const entetes = new Headers({
      "content-type": TYPES[ext] ?? source.headers.get("content-type") ?? "application/octet-stream",
      "cache-control": html ? "public, max-age=300" : `public, max-age=${duree}${duree > 300 ? ", immutable" : ""}`,
      ...securite,
    });
    if (apercu) entetes.set("x-robots-tag", "noindex, nofollow");
    else entetes.set("strict-transport-security", "max-age=31536000");
    const etag = source.headers.get("etag");
    if (etag) entetes.set("etag", etag);
    return new Response(req.method === "HEAD" ? null : source.body, { status: 200, headers: entetes });
  },
};
