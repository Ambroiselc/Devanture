// Assemble les pages du site définitif d'un client (Pedro, 30/10) à partir du contenu (avec `reel`) :
//   index.html (accueil), une page par prestation (formule Pro), mentions-legales/, robots.txt, sitemap.xml.
// Les pages autres que l'accueil reprennent l'en-tête, le bloc contact et le bas de page de l'accueil :
// seul le milieu (entre <!--principal--> et <!--/principal-->) change. Aucune requête Internet ici.
import { STYLES, type StyleDemo } from "./demo-styles.ts";
import type { ContenuDemo } from "./demo-artisan-pro.ts";
import { esc, imgPhoto, type Reel } from "./site-reel.ts";

export interface MentionsClient {
  /** Nom de l'entreprise (raison sociale ou nom commercial). */
  entreprise: string;
  siret: string | null;
  adresse: string | null;
  telephone: string | null;
  email: string | null;
}

/** Hébergeur des sites des clients (mentions légales, LCEN art. 6). */
export const HEBERGEUR = "Cloudflare, Inc., 101 Townsend Street, San Francisco, CA 94107, États-Unis (cloudflare.com)";

const BOUTON: Record<StyleDemo, string> = { pro: "btn btn-amber", chaleureux: "btn btn-brick" };

function milieu(html: string, nouveau: string, garderContact = true): string {
  const debut = html.indexOf("<!--principal-->");
  const fin = html.indexOf("<!--/principal-->");
  if (debut < 0 || fin < 0) throw new Error("Modèle sans repères <!--principal--> : impossible de faire les pages.");
  let sortie = html.slice(0, debut) + nouveau + html.slice(fin + "<!--/principal-->".length);
  if (!garderContact) {
    const a = sortie.indexOf("<!--contact-->");
    const b = sortie.indexOf("<!--/contact-->");
    if (a >= 0 && b >= 0) sortie = sortie.slice(0, a) + sortie.slice(b + "<!--/contact-->".length);
    // Sans formulaire, le script du formulaire n'a plus rien à faire (et planterait).
    sortie = sortie.replace(/<script>\n\(function \(\) \{\n  var f = document\.getElementById\("devis"\)[\s\S]*?<\/script>/, "");
  }
  return sortie;
}

/** Remplace titre, description et adresse canonique d'une page. */
function tete(html: string, titre: string, description: string, canonique: string | null, indexer = true): string {
  let s = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(titre)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(description)}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(titre)}">`);
  s = canonique ? s.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${canonique}">`)
    : s.replace(/<link rel="canonical" href="[^"]*">\n?/, "");
  if (!indexer) s = s.replace("<head>", `<head>\n<meta name="robots" content="noindex, follow">`);
  return s;
}

const coupe = (t: string, n: number) => (t.length <= n ? t : `${t.slice(0, n - 1).replace(/\s+\S*$/, "")}…`);

export function construireSite(c: ContenuDemo & { reel: Reel }, style: StyleDemo, mentions: MentionsClient): Map<string, string> {
  const r = c.reel;
  const rendu = STYLES.find((s) => s.id === style)!.rendu;
  const accueil = rendu(c);
  const racine = r.domaine ? `https://${r.domaine}/` : null;
  const fichiers = new Map<string, string>();
  fichiers.set("index.html", accueil.replaceAll("{{R}}", ""));

  // Pages de prestation (formule Pro).
  for (const page of r.pages) {
    const s = c.services[page.prestation];
    const photos = r.photos.filter((p) => p.prestation === page.prestation).slice(0, 6);
    const article = `<section>
  <div class="wrap article">
    <p style="margin:0"><a href="{{R}}#prestations">← Toutes les prestations</a></p>
    <h1 style="font-size:clamp(1.9rem,4.5vw,2.8rem);margin-top:14px">${esc(page.titre)}</h1>
    ${page.paragraphes.map((p) => `<p>${esc(p)}</p>`).join("\n    ")}
    ${photos.length ? `<div class="photos">${photos.map((p) => imgPhoto(p, "photo")).join("")}</div>` : ""}
    <p style="margin-top:28px"><a class="${BOUTON[style]}" href="#contact">Demander un devis</a></p>
  </div>
</section>`;
    const html = tete(milieu(accueil, article), `${page.titre} à ${c.commune} · ${c.nom}`,
      coupe(`${s?.description ?? page.paragraphes[0]} ${c.nom}, ${c.metier.toLowerCase()} à ${c.commune}.`, 160),
      racine ? `${racine}${page.slug}/` : null);
    fichiers.set(`${page.slug}/index.html`, html.replaceAll("{{R}}", "../"));
  }

  // Mentions légales (obligatoires : éditeur, hébergeur).
  const ligne = (t: string | null) => (t ? `<br>${esc(t)}` : "");
  const contenuMentions = `<section>
  <div class="wrap article mentions">
    <h1 style="font-size:clamp(1.8rem,4vw,2.4rem)">Mentions légales</h1>
    <h3>Éditeur du site</h3>
    <p>${esc(mentions.entreprise)}${ligne(mentions.siret ? `SIRET : ${mentions.siret.replace(/^(\d{3})(\d{3})(\d{3})(\d{5})$/, "$1 $2 $3 $4")}` : null)}${ligne(mentions.adresse)}${ligne(mentions.telephone ? `Téléphone : ${mentions.telephone}` : null)}${ligne(mentions.email ? `E-mail : ${mentions.email}` : null)}</p>
    <p>Directeur de la publication : le représentant légal de ${esc(mentions.entreprise)}.</p>
    <h3>Hébergement</h3>
    <p>${esc(HEBERGEUR)}.</p>
    <h3>Réalisation</h3>
    <p>Devanture (Ambroise Le Clerc EI), <a href="https://devanture-artisans.fr">devanture-artisans.fr</a>.</p>
    <h3>Données personnelles</h3>
    <p>Les informations envoyées par le formulaire de demande de devis servent uniquement à répondre à votre demande. Elles sont transmises par e-mail à ${esc(mentions.entreprise)} et conservées au plus trois ans. Vous pouvez demander à les consulter, les corriger ou les effacer${mentions.email ? ` en écrivant à ${esc(mentions.email)}` : ""}. Vous pouvez aussi saisir la CNIL (cnil.fr).</p>
    <h3>Cookies</h3>
    <p>Ce site ne dépose aucun cookie et n'utilise aucun outil de mesure d'audience.</p>
    <h3>Photos et textes</h3>
    <p>Les photos et les textes de ce site appartiennent à ${esc(mentions.entreprise)}. Merci de ne pas les reprendre sans autorisation.</p>
  </div>
</section>`;
  fichiers.set("mentions-legales/index.html",
    tete(milieu(accueil, contenuMentions, false), `Mentions légales · ${c.nom}`, `Mentions légales du site de ${c.nom}.`,
      racine ? `${racine}mentions-legales/` : null, false).replaceAll("{{R}}", "../"));

  // Pour les moteurs de recherche (seulement une fois en ligne sur le domaine du client).
  if (racine) {
    fichiers.set("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${racine}sitemap.xml\n`);
    const urls = [racine, ...r.pages.map((p) => `${racine}${p.slug}/`)];
    fichiers.set("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>
`);
  } else {
    fichiers.set("robots.txt", "User-agent: *\nDisallow: /\n");
  }
  return fichiers;
}

/** Morceau d'adresse lisible : « Rénovation de toiture » → « renovation-de-toiture ». */
export function versSlug(texte: string, max = 50): string {
  return texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/œ/g, "oe")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/g, "") || "page";
}
