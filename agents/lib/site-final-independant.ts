// Pages du site définitif d'un photographe ou d'un coach (27/11, Pedro) : comme site-final.ts pour les artisans.
//   index.html (accueil), une page par prestation (formule Pro), mentions-legales/, robots.txt, sitemap.xml.
// Les autres pages gardent l'en-tête, le contact et le bas de page de l'accueil : seul le milieu
// (entre <!--principal--> et <!--/principal-->, posés par site-independant.ts) change.
import { renderIndependant } from "./demo-independant.ts";
import { coupe, HEBERGEUR, tete, type MentionsClient } from "./site-final.ts";
import { esc, imgPhoto } from "./site-reel.ts";
import type { ContenuSiteIndependant } from "./site-independant.ts";

const CSS_ARTICLE = `<style>.article{max-width:820px;margin:0 auto}.article h1{font-size:clamp(32px,5vw,52px);margin:14px 0 18px}
.article h3{margin:26px 0 6px;font-size:20px}.article p{color:var(--doux)}.article .retour{margin:0;font-size:15px}
.article .photos{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr));gap:10px;margin-top:24px}
.article .photos img{aspect-ratio:4/5;height:auto;border-radius:3px}</style>`;

function milieu(accueil: string, nouveau: string): string {
  const debut = accueil.indexOf("<!--principal-->");
  const fin = accueil.indexOf("<!--/principal-->");
  if (debut < 0 || fin < 0) throw new Error("Modèle sans repères <!--principal--> : impossible de faire les pages.");
  return accueil.slice(0, debut) + nouveau + accueil.slice(fin + "<!--/principal-->".length);
}

export function construireSiteIndependant(c: ContenuSiteIndependant, mentions: MentionsClient): Map<string, string> {
  const r = c.reel;
  const accueil = renderIndependant(c).replace("</head>", `${CSS_ARTICLE}\n</head>`);
  const racine = r.domaine ? `https://${r.domaine}/` : null;
  const fichiers = new Map<string, string>();
  fichiers.set("index.html", accueil.replaceAll("{{R}}", ""));
  const action = r.reservation ? `<a class="btn" href="{{R}}#reserver">Réserver en ligne</a>` : `<a class="btn" href="#contact">Me contacter</a>`;

  for (const page of r.pages) {
    const p = c.prestations[page.prestation];
    const photos = r.photos.filter((x) => x.prestation === page.prestation).slice(0, 6);
    const article = `<section class="band"><div class="article">
  <p class="retour"><a href="{{R}}#prestations">← Toutes les prestations</a></p>
  <h1>${esc(page.titre)}</h1>
  ${p?.prix ? `<p><span class="prix">${esc(p.prix)}</span></p>` : ""}
  ${page.paragraphes.map((x) => `<p>${esc(x)}</p>`).join("\n  ")}
  ${photos.length ? `<div class="photos">${photos.map((x) => imgPhoto(x, "")).join("")}</div>` : ""}
  <div class="ctas" style="margin-top:28px">${action}</div>
</div></section>`;
    const html = tete(milieu(accueil, article), `${page.titre} à ${c.commune} · ${c.nom}`,
      coupe(`${p?.description ?? page.paragraphes[0]} ${c.nom}, ${c.metier.toLowerCase()} à ${c.commune}.`, 160),
      racine ? `${racine}${page.slug}/` : null);
    fichiers.set(`${page.slug}/index.html`, html.replaceAll("{{R}}", "../"));
  }

  const ligne = (t: string | null) => (t ? `<br>${esc(t)}` : "");
  const m = mentions;
  const contenuMentions = `<section class="band"><div class="article">
  <h1>Mentions légales</h1>
  <h3>Éditeur du site</h3>
  <p>${esc(m.entreprise)}${ligne(m.siret ? `SIRET : ${m.siret.replace(/^(\d{3})(\d{3})(\d{3})(\d{5})$/, "$1 $2 $3 $4")}` : null)}${ligne(m.adresse)}${ligne(m.telephone ? `Téléphone : ${m.telephone}` : null)}${ligne(m.email ? `E-mail : ${m.email}` : null)}</p>
  <p>Directeur de la publication : ${esc(m.entreprise)}.</p>
  <h3>Hébergement</h3>
  <p>${esc(HEBERGEUR)}.</p>
  <h3>Réalisation</h3>
  <p>Devanture (Ambroise Le Clerc EI), <a href="https://devanture-artisans.fr">devanture-artisans.fr</a>.</p>
  <h3>Données personnelles</h3>
  <p>Les informations envoyées par le formulaire de contact servent uniquement à répondre à votre demande. Elles sont transmises par e-mail à ${esc(m.entreprise)} et conservées au plus trois ans. Vous pouvez demander à les consulter, les corriger ou les effacer${m.email ? ` en écrivant à ${esc(m.email)}` : ""}. Vous pouvez aussi saisir la CNIL (cnil.fr).</p>
  ${r.reservation ? `<h3>Réservation en ligne</h3>
  <p>La réservation en ligne passe par un service choisi par ${esc(m.entreprise)} (Cal.com). Les informations saisies lors d'une réservation (nom, e-mail, créneau) sont enregistrées par ce service pour le compte de ${esc(m.entreprise)}, seulement pour gérer le rendez-vous. L'agenda ne se charge que si vous cliquez sur « Voir les créneaux disponibles ».</p>` : ""}
  <h3>Cookies</h3>
  <p>Ce site ne dépose aucun cookie et n'utilise aucun outil de mesure d'audience.${r.reservation ? " L'agenda de réservation, affiché seulement à votre demande, peut utiliser les cookies nécessaires à son fonctionnement." : ""}</p>
  <h3>Photos et textes</h3>
  <p>Les photos et les textes de ce site appartiennent à ${esc(m.entreprise)}. Merci de ne pas les reprendre sans autorisation.</p>
</div></section>`;
  fichiers.set("mentions-legales/index.html",
    tete(milieu(accueil, contenuMentions), `Mentions légales · ${c.nom}`, `Mentions légales du site de ${c.nom}.`,
      racine ? `${racine}mentions-legales/` : null, false).replaceAll("{{R}}", "../"));

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
