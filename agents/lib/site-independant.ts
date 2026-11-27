// Site définitif d'un photographe ou d'un coach (27/11, Pedro).
//
// Le site part de la maquette « indépendant » (demo-independant.ts, avec ses variantes de demo-coach.ts et
// demo-photographe.ts), rendue avec des REPÈRES à la place des photos d'illustration : « reelL3 » (photo n° 3 du
// client, horizontale), « reelH5 » (en hauteur), « reelP0 » (son portrait). Les mises en page placent donc les photos
// du client exactement comme les photos d'illustration (le sens des photos compte : voir cadrage.ts, estEnHauteur).
// Ensuite `versVraiSite` transforme la page :
//   - repères → vraies photos (deux tailles, texte de remplacement, point de cadrage choisi par Claude Opus) ;
//   - galerie remplacée par TOUTES les photos du client, dans leur format (rien n'est coupé) ;
//   - plus aucune mention « illustration », « exemple » ni « Votre tarif » (le prix du client, ou rien) ;
//   - partie Réserver : son agenda Cal.com, chargé seulement quand le visiteur clique (aucune connexion à Cal.com
//     avant) ; sans lien de réservation, la partie disparaît et tout mène au contact ;
//   - contact : téléphone, e-mail et un formulaire qui marche (même circuit que les devis des artisans) ;
//   - bas de page, fiche Google, liens internes {{R}} (voir site-reel.ts), repères <!--/principal--> et <!--/contact-->.
// Aucune requête Internet ici : ce fichier sert aussi aux aperçus du tableau de bord.
import type { ContenuIndependant } from "./demo-independant.ts";
import { champPiege, esc, imgPhoto, lienTel, piedReel, scriptDevis, teteSeo, type PhotoSite, type ReelIndependant } from "./site-reel.ts";

export type ContenuSiteIndependant = ContenuIndependant & { reel: ReelIndependant };

const enHauteur = (p: PhotoSite) => p.hauteur > p.largeur * 1.05;

/**
 * Repères des photos du client, dans l'ordre où la maquette les attend : [0] = en-tête, puis la galerie (répétée
 * s'il y a peu de photos, les mises en page ont besoin de 7 cases), puis le portrait en dernier (case « À propos »).
 */
export function jetonsReels(r: ReelIndependant): string[] {
  const jetons = r.photos.map((p, i) => `reel${enHauteur(p) ? "H" : "L"}${i}`);
  if (!jetons.length) return ["reelL0", "reelP0"];
  const reste = jetons.slice(1).length ? jetons.slice(1) : [jetons[0]];
  const galerie: string[] = [];
  while (galerie.length < 7) galerie.push(...reste);
  return [jetons[0], ...galerie.slice(0, Math.max(7, reste.length)), "reelP0"];
}

/** Lien de réservation accepté : une adresse https. L'agenda s'affiche dans la page seulement pour Cal.com. */
export function lienReservation(texte: string | null | undefined): string | null {
  const t = String(texte ?? "").trim();
  if (!t) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    u.protocol = "https:";
    return u.toString();
  } catch {
    return null;
  }
}
const estCal = (url: string) => /^https:\/\/([a-z0-9-]+\.)*cal\.(com|eu)\//i.test(url);

/** Remplace la PREMIÈRE section `<section id="…" …>…</section>` (les sections de ces modèles ne s'imbriquent pas). */
function remplacerSection(html: string, id: string, nouveau: string): { html: string; trouve: boolean } {
  const re = new RegExp(`<section id="${id}"[^>]*>[\\s\\S]*?</section>`);
  if (!re.test(html)) return { html, trouve: false };
  return { html: html.replace(re, () => nouveau), trouve: true };
}

const CSS_REEL = `
.prix{font-weight:700;white-space:nowrap}
.apropos.sans-portrait{grid-template-columns:minmax(0,1fr)!important;max-width:900px;margin-inline:auto}
.gr{columns:3 260px;column-gap:12px;margin-top:22px}
.gr figure{margin:0 0 12px!important;break-inside:avoid;overflow:hidden;background:none!important;border-radius:3px;height:auto!important;aspect-ratio:auto!important}
.gr img{display:block;width:100%!important;height:auto!important;aspect-ratio:auto!important;object-fit:contain!important;transform:none!important}
.rr{background:var(--carte);border-block:1px solid var(--ligne)}
.rr-txt{max-width:40em}.rr-txt p{color:var(--doux)}
.rr-cal{margin-top:22px;border-radius:14px;overflow:hidden;background:#fff;border:1px solid var(--ligne)}
.rr-cal iframe{display:block;width:100%;height:720px;border:0}
.ctr{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:clamp(28px,5vw,72px);align-items:start;text-align:left}
.ctr .ctas{display:flex;flex-direction:column;align-items:flex-start;gap:12px;margin-top:22px}
.ctr-txt p{color:var(--doux)}
.ctr-form{display:grid;gap:14px;background:var(--carte);border:1px solid var(--ligne);border-radius:12px;padding:clamp(18px,3vw,28px);position:relative}
.ctr-form label{display:grid;gap:6px;font-size:14px;font-weight:600}
.ctr-form input,.ctr-form textarea{font:inherit;font-weight:400;color:#1b1b1b;background:#fff;border:1px solid var(--ligne);border-radius:8px;padding:12px;width:100%}
.ctr-form textarea{resize:vertical;min-height:110px}
.ctr-form .btn{width:100%}
.ctr-ok{margin:0;font-weight:600}.ctr-rgpd{margin:0;font-size:13px;color:var(--doux)}
@media(max-width:820px){.ctr{grid-template-columns:minmax(0,1fr)}.rr-cal iframe{height:640px}}`;

/** Script de l'agenda : le bouton « Voir les créneaux » charge la page Cal.com dans le site au premier clic. */
const SCRIPT_AGENDA = `<script>
(function () {
  var b = document.getElementById("voir-agenda"), z = document.getElementById("agenda");
  if (!b || !z) return;
  b.addEventListener("click", function (ev) {
    ev.preventDefault();
    if (!z.firstChild) {
      var f = document.createElement("iframe");
      f.src = b.getAttribute("data-embed"); f.title = "Réserver en ligne"; f.loading = "lazy";
      z.appendChild(f);
    }
    z.hidden = false; b.hidden = true;
  });
})();
</script>`;

export function versVraiSite(html: string, c: ContenuSiteIndependant): string {
  const r = c.reel;
  const photographe = c.metier === "Photographe";
  const parJeton = (j: string): PhotoSite | null => (j === "reelP0" ? r.portrait : r.photos[Number(j.slice(5))] ?? null);
  let s = html;

  // 1. Repères → photos du client.
  s = s.replace(/<img(?: class="([^"]*)")? src="https:\/\/images\.unsplash\.com\/photo-(reel[HLP]\d+)\?[^"]*" alt="[^"]*" loading="lazy" onerror="this\.remove\(\)">/g,
    (_, classe: string | undefined, j: string) => {
      const p = parJeton(j);
      return p ? imgPhoto(p, classe ?? "", j.endsWith("L0") || j.endsWith("H0")) : "";
    });
  if (s.includes("images.unsplash.com/photo-reel")) throw new Error("Site indépendant : une photo du modèle n'a pas été remplacée.");

  // 2. Plus d'illustration ni d'exemple.
  s = s.replace(/<p class="legende[^"]*"[^>]*>[\s\S]*?<\/p>/g, "").replace(/<figcaption>[\s\S]*?<\/figcaption>/g, "");
  let n = 0;
  s = s.replace(/<span class="todo">Votre tarif<\/span>/g, () => {
    const prix = c.prestations[n++]?.prix;
    // Case vide gardée : certaines mises en page placent le tarif dans une colonne de grille.
    return `<span class="prix">${prix ? esc(prix) : ""}</span>`;
  });
  if (!r.portrait) {
    s = s.replace(/<figure class="portrait">[\s\S]*?<\/figure>/, "").replace(/class="band apropos"/, 'class="band apropos sans-portrait"');
  }

  // 3. Galerie : toutes les photos du client sauf l'en-tête, entières.
  const autres = r.photos.slice(1);
  const titreGalerie = photographe ? "Portfolio" : "En images";
  const galerie = `<section id="galerie" class="band"><h2>${titreGalerie}</h2>
  <div class="gr">${autres.map((p) => `<figure>${imgPhoto(p, "")}</figure>`).join("")}</div>
</section>`;
  if (autres.length) {
    const g = remplacerSection(s, "galerie", galerie);
    s = g.html;
    if (!g.trouve && autres.length >= 2) {
      // Mises en page sans galerie (« Studio ») : une galerie avant la réservation, et son lien dans le menu.
      s = s.replace(/(<section id="reserver"|<section id="apropos")/, `${galerie}\n$1`);
      s = s.replace(/(<nav>[\s\S]*?<a href="#prestations">[^<]*<\/a>)/, `$1<a href="#galerie">${titreGalerie}</a>`);
    }
  } else {
    s = remplacerSection(s, "galerie", "").html.replace(/<a [^>]*href="#galerie"[^>]*>[\s\S]*?<\/a>/g, "");
  }

  // 4. Réservation en ligne.
  if (r.reservation) {
    const embed = `${r.reservation}${r.reservation.includes("?") ? "&" : "?"}embed=true&layout=month_view`;
    const resa = `<section id="reserver" class="band rr">
  <div class="rr-txt">
    <h2>Réserver en ligne</h2>
    <p>Choisissez ${photographe ? "la prestation" : c.prestations.length > 1 ? "la formule" : "la séance"} et le créneau qui vous conviennent : vous recevez la confirmation par e-mail.</p>
    <a class="btn" id="voir-agenda" href="${esc(r.reservation)}" target="_blank" rel="noopener"${estCal(r.reservation) ? ` data-embed="${esc(embed)}"` : ""}>Voir les créneaux disponibles</a>
  </div>
  ${estCal(r.reservation) ? `<div class="rr-cal" id="agenda" hidden></div>` : ""}
</section>`;
    s = remplacerSection(s, "reserver", resa).html;
    s = s.replace("Réservation</h3><p>En ligne, 24 h/24, avec un rappel la veille de la séance.", "Réservation</h3><p>En ligne, 24 h/24.");
  } else {
    s = remplacerSection(s, "reserver", "").html
      .replace(/<a href="#reserver">Réserver<\/a>/g, "")
      .replace(/<a href="#reserver"><b>3<\/b>Réserver<\/a>/g, `<a href="#contact"><b>3</b>Contact</a>`)
      .replace(/href="#reserver"/g, 'href="#contact"')
      .replace(/>Réserver (une séance|un créneau)</g, ">Me contacter<")
      .replace(/>Réserver( →)?</g, ">En parler$1<")
      .replace(/<div><b>24 h\/24<\/b><span>réservation en ligne<\/span><\/div>/, "")
      .replace("Réservation</h3><p>En ligne, 24 h/24, avec un rappel la veille de la séance.", "Contact</h3><p>Par téléphone, par e-mail ou par le formulaire en bas de page.");
  }

  // 5. Contact : vrais moyens de contact et formulaire.
  const titreContact = s.match(/<section id="contact"[^>]*>[\s\S]*?<h2>([\s\S]*?)<\/h2>/)?.[1] ?? "Parlons de votre projet";
  const telephone = r.telephone;
  const boutons = [
    r.reservation ? `<a class="btn" href="#reserver">Réserver en ligne</a>` : "",
    telephone ? `<a class="btn ghost" href="${lienTel(telephone)}">Appeler · ${esc(telephone)}</a>` : "",
    c.email ? `<a class="btn ghost" href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : "",
  ].join("");
  const contact = `<section id="contact" class="band ctr">
  <div class="ctr-txt">
    <h2>${titreContact}</h2>
    <p>${r.reservation ? "Réservez directement en ligne, ou écrivez-moi pour une question ou une demande particulière : je vous réponds rapidement." : "Écrivez-moi pour une question ou une demande : je vous réponds rapidement."}</p>
    <div class="ctas">${boutons}</div>
  </div>
  <form id="devis" class="ctr-form" novalidate>
    ${champPiege}
    <label>Votre nom<input name="nom" autocomplete="name" maxlength="80"></label>
    <label>Téléphone<input name="tel" type="tel" autocomplete="tel" maxlength="25"></label>
    <label>E-mail<input name="email" type="email" autocomplete="email" maxlength="120"></label>
    <label>Votre commune<input name="commune" maxlength="60"></label>
    <label>Votre message<textarea name="msg" rows="4" maxlength="2000"></textarea></label>
    <button class="btn" type="submit">Envoyer ma demande</button>
    <p id="ok" class="ctr-ok" role="status" hidden></p>
    <p class="ctr-rgpd">Vos coordonnées servent uniquement à vous répondre. <a href="{{R}}mentions-legales/">En savoir plus</a></p>
  </form>
</section>
<!--/contact-->`;
  const ct = remplacerSection(s, "contact", contact);
  if (!ct.trouve) throw new Error("Site indépendant : modèle sans partie contact.");
  s = ct.html;
  // Repère de fin du milieu de page (pages de prestation et mentions légales : site-final-independant.ts).
  s = s.replace("<!--contact-->", "<!--/principal-->\n<!--contact-->");

  // 6. Bas de page, en-tête pour Google, liens vers les pages de prestation, liens internes.
  s = s.replace(/<footer>[\s\S]*?<\/footer>/, `<footer>${piedReel(c.nom, c.commune)}</footer>`);
  s = s.replace(/<meta name="description" content="[^"]*">/, () => teteSeo(
    { domaine: r.domaine, photos: r.photos, description: r.description, telephone: r.telephone },
    { nom: c.nom, metier: c.metier, commune: c.commune, adresse: null, email: c.email ?? null, zone: c.zone }, "LocalBusiness"));
  const iPrest = s.indexOf('id="prestations"');
  if (iPrest >= 0 && r.pages.length) {
    let suite = s.slice(iPrest);
    for (const page of r.pages) {
      const titre = c.prestations[page.prestation]?.titre;
      if (!titre) continue;
      suite = suite.replace(`>${esc(titre)}</h`, `><a href="{{R}}${page.slug}/" style="color:inherit">${esc(titre)}</a></h`);
    }
    s = s.slice(0, iPrest) + suite;
  }
  s = s.replace(/href="#/g, 'href="{{R}}#');

  // 7. Styles (points de cadrage des photos compris) et scripts.
  const centres = [...r.photos, ...(r.portrait ? [r.portrait] : [])].filter((p) => p.centre)
    .map((p) => `img[src="${p.src}"]{object-position:${p.centre![0]}% ${p.centre![1]}%!important}`).join("");
  s = s.replace("</head>", `<style id="reel">${CSS_REEL}${centres}</style>\n</head>`);
  s = s.replace("</body>", `${r.reservation && estCal(r.reservation) ? SCRIPT_AGENDA : ""}${scriptDevis(r)}\n</body>`);
  return s;
}
