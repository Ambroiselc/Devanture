// Le « vrai site » d'un client (30/10, Pedro) : ce qui change par rapport à la maquette.
//
// Les deux modèles de maquette (demo-artisan-pro.ts et demo-artisan-chaleureux.ts) savent aussi fabriquer le site
// définitif : quand le contenu porte un champ `reel`, ils affichent les vraies infos du client (téléphone, horaires,
// logo, photos, avis Google, formulaire de devis qui marche) et retirent tout ce qui est « à compléter ».
// Sans `reel`, rien ne change : c'est une maquette.
//
// Liens internes : toutes les adresses relatives (photos, pages de prestation, mentions légales) commencent par
// le marqueur {{R}}, que Pedro remplace par « » sur l'accueil et par « ../ » sur les autres pages.
// Ce fichier est lu par les modèles (tableau de bord compris) : il n'importe rien.

export interface PhotoSite {
  /** Grande version (1 600 px de large au plus), chemin relatif : « {{R}}photos/02-1600.webp ». */
  src: string;
  /** Petite version (800 px de large au plus). */
  petit: string;
  largeur: number;
  hauteur: number;
  /** Texte de remplacement : ce qu'on voit sur la photo, sans rien inventer. */
  alt: string;
  /** Légende affichée sous la photo (30/10) : celle du client, sinon une courte légende naturelle. Absente = alt. */
  legende?: string;
  /** Index de la prestation (dans `services`) que montre la photo, ou null. */
  prestation: number | null;
  /** Point à garder visible quand la photo est recadrée (% depuis la gauche, % depuis le haut), ou absent (= centre). */
  centre?: [number, number];
}

export interface PageSite {
  /** Morceau d'adresse de la page : « renovation-de-toiture » (la page est servie sur …/renovation-de-toiture/). */
  slug: string;
  titre: string;
  /** Index de la prestation correspondante dans `services`. */
  prestation: number;
  /** 2 ou 3 paragraphes. */
  paragraphes: string[];
}

export interface Reel {
  telephone: string | null;
  horaires: string | null;
  logo: { src: string; largeur: number; hauteur: number } | null;
  /** Dans l'ordre d'affichage ; la première sert de grande photo d'en-tête. */
  photos: PhotoSite[];
  /** Fiche Google du client (« Lire nos avis »), ou null : la partie Avis disparaît. */
  avisUrl: string | null;
  /** Formulaire de devis : adresse de l'API et identifiant du site. */
  devis: { url: string; site: string };
  /** Domaine du client une fois en ligne (adresse canonique, plan du site), sinon null (aperçu). */
  domaine: string | null;
  /** Une phrase du client sur sa façon de travailler (style chaleureux), ou null. */
  citation: string | null;
  /** Pages de prestation (formule Pro), sinon liste vide. */
  pages: PageSite[];
  /** Description pour Google (150 caractères environ). */
  description: string;
}

/**
 * Site définitif d'un photographe ou d'un coach (27/11, Pedro) : la maquette « indépendant » (demo-independant.ts),
 * avec les photos du client, sa page de réservation en ligne (Cal.com) et un formulaire de contact qui marche.
 */
export interface ReelIndependant {
  telephone: string | null;
  /** Dans l'ordre d'affichage ; la première sert de grande photo d'en-tête, les autres de galerie. */
  photos: PhotoSite[];
  /** Portrait de la personne pour « À propos » (photo légendée « moi » par le client), sinon null : pas de photo. */
  portrait: PhotoSite | null;
  /** Page de réservation du client (Cal.com), sinon null : la partie Réserver disparaît, tout mène au contact. */
  reservation: string | null;
  /** Formulaire de contact : adresse de l'API et identifiant du site (même circuit que les devis des artisans). */
  devis: { url: string; site: string };
  domaine: string | null;
  pages: PageSite[];
  description: string;
}

export function esc(texte: string | null | undefined): string {
  return String(texte ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** « 06 12 34 56 78 » → « tel:+33612345678 ». */
export function lienTel(telephone: string): string {
  const chiffres = telephone.replace(/[^\d+]/g, "");
  return `tel:${/^0\d{9}$/.test(chiffres) ? `+33${chiffres.slice(1)}` : chiffres}`;
}

/** Horaires sur plusieurs lignes (le client les tape comme il veut) → HTML. */
export function horairesHtml(horaires: string): string {
  return esc(horaires).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join("<br>");
}

/** Balise d'une photo, avec ses deux tailles. `prioritaire` : l'image d'en-tête, chargée tout de suite. */
export function imgPhoto(p: PhotoSite, classe: string, prioritaire = false): string {
  return `<img class="${classe}" src="${p.src}" srcset="${p.petit} 800w, ${p.src} 1600w" sizes="(max-width: 820px) 100vw, 50vw" `
    + `width="${p.largeur}" height="${p.hauteur}" alt="${esc(p.alt)}" decoding="async"${prioritaire ? ' fetchpriority="high"' : ' loading="lazy"'}>`;
}

/** Adresse d'une ancre de l'accueil (« #prestations »), qui marche aussi depuis une page de prestation. */
export const ancre = (r: Reel | undefined, id: string) => (r ? `{{R}}#${id}` : `#${id}`);

/** En-tête de la page : description, adresse canonique, partage, et fiche « entreprise locale » pour Google. */
export function teteSeo(r: Pick<Reel, "domaine" | "photos" | "description" | "telephone">,
  c: { nom: string; metier: string; commune: string; adresse: string | null; email: string | null; zone: string[] },
  type = "HomeAndConstructionBusiness"): string {
  const url = r.domaine ? `https://${r.domaine}/` : null;
  const image = r.photos[0] && url ? `${url}${r.photos[0].src.replace("{{R}}", "")}` : null;
  const fiche: Record<string, unknown> = {
    "@context": "https://schema.org", "@type": type,
    name: c.nom, description: r.description, areaServed: c.zone.map((z) => ({ "@type": "City", name: z })),
  };
  if (url) fiche.url = url;
  if (image) fiche.image = image;
  if (r.telephone) fiche.telephone = r.telephone;
  if (c.email) fiche.email = c.email;
  if (c.adresse) fiche.address = { "@type": "PostalAddress", streetAddress: c.adresse, addressLocality: c.commune, addressCountry: "FR" };
  return [
    `<meta name="description" content="${esc(r.description)}">`,
    url ? `<link rel="canonical" href="${url}">` : "",
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${esc(`${c.nom} · ${c.metier} à ${c.commune}`)}">`,
    `<meta property="og:description" content="${esc(r.description)}">`,
    image ? `<meta property="og:image" content="${image}">` : "",
    `<meta name="format-detection" content="telephone=no">`,
    `<script type="application/ld+json">${JSON.stringify(fiche).replace(/</g, "\\u003c")}</script>`,
  ].filter(Boolean).join("\n");
}

/** Champ piège invisible : les robots le remplissent, les humains non. */
export const champPiege = `<div aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden"><label>Ne pas remplir<input name="site_web" tabindex="-1" autocomplete="off"></label></div>`;

/** Script du formulaire de devis : envoi à l'API, message de confirmation, et repli sur l'appel en cas d'échec. */
export function scriptDevis(r: Pick<Reel, "telephone" | "devis">): string {
  const secours = r.telephone ? ` Vous pouvez aussi appeler le ${r.telephone}.` : "";
  return `<script>
(function () {
  var f = document.getElementById("devis"), ok = document.getElementById("ok");
  f.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var d = new FormData(f), b = f.querySelector("button[type=submit]");
    if (d.get("site_web")) { ok.hidden = false; return; }
    if (!String(d.get("tel") || "").trim() && !String(d.get("msg") || "").trim()) {
      ok.textContent = "Indiquez au moins votre numéro ou votre demande."; ok.hidden = false; return;
    }
    b.disabled = true; b.textContent = "Envoi…";
    fetch(${JSON.stringify(r.devis.url)}, {
      method: "POST", headers: { "content-type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ site: ${JSON.stringify(r.devis.site)}, nom: d.get("nom"), tel: d.get("tel"),
        email: d.get("email"), commune: d.get("commune"), message: d.get("msg") })
    }).then(function (res) { return res.json(); }).then(function (j) {
      if (!j.ok) throw new Error(j.raison || "refus");
      f.reset(); ok.textContent = "Merci, votre demande est bien envoyée. Je vous recontacte rapidement."; ok.hidden = false;
      b.textContent = "Demande envoyée";
    }).catch(function () {
      ok.textContent = "L'envoi n'a pas marché, réessayez dans un instant.${secours}"; ok.hidden = false;
      b.disabled = false; b.textContent = "Envoyer ma demande";
    });
  });
})();
</script>`;
}

/** Bas de page du vrai site : mentions légales et crédit. */
export function piedReel(nom: string, commune: string): string {
  return `<span>© ${new Date().getFullYear()} ${esc(nom)} · ${esc(commune)} · <a href="{{R}}mentions-legales/" style="color:inherit">Mentions légales</a></span>`
    + `<span>Site réalisé par <a href="https://devanture-artisans.fr" style="color:inherit">Devanture</a></span>`;
}
