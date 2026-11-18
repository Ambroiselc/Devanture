// Modèle de démo « Artisan pro » (phase 3) : la version sobre et professionnelle choisie le 23/10.
// Une seule fonction : contenu (JSON) → page HTML complète, prête à être affichée.
//
// Règle d'honnêteté : la démo ne montre QUE ce qu'on sait vraiment de l'artisan (nom, métier,
// commune, adresse de l'annuaire, e-mail trouvé sur son site). Tout le reste (téléphone, horaires,
// photos, avis, prix) apparaît en pointillés « à compléter avec vous » : on n'invente rien.
//
// Ce fichier est lu par l'agent des démos (agents/demos.ts) ET par le tableau de bord (/demo/…) :
// il n'importe que le petit fichier des variantes (habillage.ts), qui n'importe rien.
//
// Variantes (27/10) : palette, polices, en-tête, prestations et réalisations changent selon `c.habillage`
// (voir habillage.ts). Variante 0 partout = l'apparence d'origine.
import { variantes, type Habillage } from "./habillage.ts";
import { ancre, champPiege, horairesHtml, imgPhoto, lienTel, piedReel, scriptDevis, teteSeo, type Reel } from "./site-reel.ts";

export const MODELE_DEMO = "artisan-pro";

export interface ServiceDemo {
  /** Petite étiquette au-dessus du titre : « Urgence », « Rénovation »… */
  tag: string;
  titre: string;
  description: string;
}

export interface ContenuDemo {
  nom: string;
  metier: string;
  commune: string;
  adresse: string | null;
  email: string | null;
  /** Titre principal (h1). */
  accroche: string;
  /** Paragraphe sous le titre. */
  intro: string;
  services: ServiceDemo[];
  /** Phrase sur la zone d'intervention. */
  zoneTexte: string;
  /** Communes desservies (la commune de l'artisan en premier). */
  zone: string[];
  /** Court paragraphe de présentation, sans fait inventé. */
  apropos: string;
  /** Combinaison de variantes choisie par Sid pour que chaque site soit différent (absente = apparence d'origine). */
  habillage?: Habillage;
  /** Site définitif d'un client (Pedro, 30/10) : vraies infos et photos. Absent = maquette. */
  reel?: Reel;
}

/** Palettes du style sobre : fond sombre (ink), accent (amber), tons clairs. La 0 est celle d'origine. */
const PALETTES = [
  { ink: "#14263B", ink2: "#3E5268", mist: "#EEF2F6", line: "#D5DDE6", acc: "#E3A23B", accInk: "#2B1D05", soft: "#C9D4E0", mute: "#9FB0C2", ph: "#B7C3D0" }, // marine et ambre
  { ink: "#1F2328", ink2: "#4A525C", mist: "#F1F2F3", line: "#D9DCE0", acc: "#EE7A3B", accInk: "#1E0F05", soft: "#CFD3D8", mute: "#A2A8B0", ph: "#B9BEC5" }, // ardoise et orange
  { ink: "#17352A", ink2: "#3F5A4F", mist: "#EEF3EF", line: "#D3DED7", acc: "#E9C46A", accInk: "#2A2205", soft: "#C8D8CF", mute: "#9DB5A9", ph: "#AFC3B7" }, // forêt et jaune
  { ink: "#3A1820", ink2: "#634A50", mist: "#F5F0EE", line: "#E2D6D3", acc: "#DDAE74", accInk: "#2A1A06", soft: "#E3CDD1", mute: "#BFA2A8", ph: "#CDB6B2" }, // bordeaux et sable
  { ink: "#0F3B47", ink2: "#3E5F68", mist: "#ECF3F4", line: "#D0E0E3", acc: "#F4917A", accInk: "#2A0F06", soft: "#C3DADF", mute: "#93B5BD", ph: "#AFC8CD" }, // pétrole et corail
  { ink: "#22262E", ink2: "#4B5361", mist: "#F0F2F5", line: "#D8DCE3", acc: "#7FB2FF", accInk: "#0A1A33", soft: "#CDD2DA", mute: "#9EA6B3", ph: "#B8BFCA" }, // graphite et bleu
  { ink: "#2E241C", ink2: "#5B4E44", mist: "#F4F1EC", line: "#E0D8CE", acc: "#9CCB66", accInk: "#14210A", soft: "#DCD0C3", mute: "#B3A595", ph: "#C9BCAE" }, // chocolat et vert
];

/** Paires de polices (titres + texte), toutes sur Google Fonts. La 0 est celle d'origine. */
const POLICES = [
  { url: "Archivo:wght@500;700;800&family=Source+Sans+3:wght@400;600", titre: "Archivo", texte: "Source Sans 3" },
  { url: "Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;600", titre: "Barlow Condensed", texte: "Barlow" },
  { url: "Space+Grotesk:wght@500;700&family=IBM+Plex+Sans:wght@400;600", titre: "Space Grotesk", texte: "IBM Plex Sans" },
  { url: "Outfit:wght@500;700;800&family=Work+Sans:wght@400;600", titre: "Outfit", texte: "Work Sans" },
];

/** Échappe le texte avant de le mettre dans le HTML (le contenu vient d'une IA : prudence). */
function e(texte: string | null | undefined): string {
  return String(texte ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const aCompleter = (texte: string) => `<span class="todo">${e(texte)}</span>`;

export function renderArtisanPro(c: ContenuDemo): string {
  const annee = new Date().getFullYear();
  const services = c.services.slice(0, 6);
  const v = variantes(c, "pro");
  const pal = PALETTES[v.palette];
  const pol = POLICES[v.police];
  const photos = services.slice(0, v.realisations === 1 ? 2 : 3);
  const R = c.reel;
  const telHref = R?.telephone ? lienTel(R.telephone) : "#contact";
  const tel = R?.telephone ? `<a href="${telHref}" style="text-decoration:none">${e(R.telephone)}</a>` : R ? "" : aCompleter("Votre numéro");
  const mail = c.email ? e(c.email) : R ? "" : aCompleter("Votre adresse e-mail");
  const adresse = c.adresse ? e(c.adresse) : e(c.commune);
  const horaires = R?.horaires ? horairesHtml(R.horaires) : R ? "" : aCompleter("Vos horaires d'ouverture");
  const photoHero = R?.photos[0];
  const coords = [
    tel && `<div><small>Téléphone</small><strong>${tel}</strong></div>`,
    mail && `<div><small>E-mail</small><strong>${mail}</strong></div>`,
    `<div><small>Adresse</small><strong>${adresse}</strong></div>`,
    horaires && `<div><small>Horaires</small><strong>${horaires}</strong></div>`,
  ].filter(Boolean).join("\n      ");
  const texteHero = `<div class="eyebrow">${e(c.metier)} à ${e(c.commune)}</div>
      <h1>${e(c.accroche)}</h1>
      <p class="lead">${e(c.intro)}</p>
      <div class="ctas">
        <a class="btn btn-amber" href="#contact">Demander un devis</a>
        ${R && !R.telephone ? "" : `<a class="btn btn-ghost" href="${telHref}">Appeler</a>`}
      </div>`;
  // En-tête : 0 = texte + carte des coordonnées ; 1 = centré avec bandeau ; 2 = clair avec grande photo.
  const hero = [
    `<div class="hero">
  <div class="wrap">
    <div>
      ${texteHero}
    </div>
    <div class="card" aria-label="Coordonnées">
      ${coords}
    </div>
  </div>
</div>`,
    `<div class="hero hero-centre">
  <div class="wrap">
    <div class="centre">
      ${texteHero}
    </div>
    <div class="strip" aria-label="Coordonnées">
      ${coords}
    </div>
  </div>
</div>`,
    `<div class="hero hero-clair">
  <div class="wrap">
    <div>
      ${texteHero}
    </div>
    ${photoHero ? imgPhoto(photoHero, "photo photo-hero", true) : R ? "" : `<div class="ph ph-hero">Votre photo ici<br>(un beau chantier, votre équipe ou votre camionnette)</div>`}
  </div>
</div>
<div class="infos"><div class="wrap strip" aria-label="Coordonnées">
      ${coords}
</div></div>`,
  ][v.entete];
  // Prestations : 0 = grille ; 1 = cartes numérotées ; 2 = liste en lignes.
  const classeServices = ["services", "services cartes", "services lignes"][v.prestations];
  // Site Pro : « Sur devis » devient un lien vers la page de la prestation.
  const pied = (i: number) => {
    const page = R?.pages.find((p) => p.prestation === i);
    return page ? `<a class="from" href="{{R}}${page.slug}/">En savoir plus →</a>` : `<div class="from">Sur devis</div>`;
  };
  const blocService = (s: ServiceDemo, i: number) => v.prestations === 1
    ? `<div class="svc"><span class="num">${String(i + 1).padStart(2, "0")}</span><span class="tag">${e(s.tag)}</span><h3>${e(s.titre)}</h3><p>${e(s.description)}</p>${pied(i)}</div>`
    : v.prestations === 2
      ? `<div class="svc"><div><span class="tag">${e(s.tag)}</span><h3>${e(s.titre)}</h3></div><p>${e(s.description)}</p>${pied(i)}</div>`
      : `<div class="svc"><span class="tag">${e(s.tag)}</span><h3>${e(s.titre)}</h3><p>${e(s.description)}</p>${pied(i)}</div>`;
  // Vrai site : la galerie montre les photos du client (sauf celle de l'en-tête quand l'en-tête en a une).
  const galerie = R ? R.photos.slice(v.entete === 2 && R.photos.length > 3 ? 1 : 0) : [];
  const avis = R ? R.avisUrl : "maquette";
  // Réalisations : 0 = trois photos ; 1 = deux chantiers en « avant / après ».
  const blocRealisation = (s: ServiceDemo) => v.realisations === 1
    ? `<figure class="work" style="margin:0"><div class="paire"><div class="ph">Photo avant</div><div class="ph">Photo après</div></div><figcaption><h3>${e(s.titre)}</h3><span class="muted">${aCompleter("Commune · durée")}</span></figcaption></figure>`
    : `<figure class="work" style="margin:0"><div class="ph">Votre photo de chantier</div><figcaption><h3>${e(s.titre)}</h3><span class="muted">${aCompleter("Commune · durée")}</span></figcaption></figure>`;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${R ? teteSeo(R, c) : `<meta name="robots" content="noindex, nofollow">`}
<title>${e(c.nom)} · ${e(c.metier)} à ${e(c.commune)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${pol.url}&display=swap">
<style>
:root{
  --ink:${pal.ink};--ink-2:${pal.ink2};--paper:#FFFFFF;--mist:${pal.mist};--line:${pal.line};
  --amber:${pal.acc};--amber-ink:${pal.accInk};--soft:${pal.soft};--mute:${pal.mute};--ph:${pal.ph};
  --display:"${pol.titre}",system-ui,sans-serif;--body:"${pol.texte}",system-ui,sans-serif;
  color-scheme:light;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--body);font-size:17px;line-height:1.6}
.wrap{max-width:1080px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
h1,h2,h3{font-family:var(--display);line-height:1.15;text-wrap:balance;margin:0}
h2{font-size:clamp(1.6rem,3vw,2.1rem);font-weight:800}
h3{font-size:1.1rem;font-weight:700}
p{margin:0}
a{color:inherit}
.todo{border-bottom:2px dashed var(--amber);color:inherit;opacity:.85}
.demo{background:#FFF6E6;color:var(--amber-ink);font-size:.86rem;text-align:center;padding:8px 16px;border-bottom:1px solid #F1D9A8}
.demo strong{font-weight:600}
header{border-bottom:1px solid var(--line);background:var(--paper);position:sticky;top:0;z-index:5}
.bar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-block:14px}
.logo{font-family:var(--display);font-weight:800;font-size:1.15rem;min-width:0}
.logo small{display:block;font-family:var(--body);font-weight:600;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-2)}
nav{display:flex;gap:22px;font-weight:600;font-size:.95rem}
nav a{text-decoration:none;color:var(--ink-2)}
nav a:hover{color:var(--ink)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-family:var(--display);font-weight:700;font-size:.98rem;text-decoration:none;border:0;cursor:pointer;border-radius:6px;padding:13px 20px;white-space:nowrap}
.btn-amber{background:var(--amber);color:var(--amber-ink)}
.btn-amber:hover{filter:brightness(1.05)}
.btn-ghost{background:transparent;color:#fff;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.5)}
.btn:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid var(--amber);outline-offset:2px}
.hero{background:var(--ink);color:#fff}
.hero .wrap{display:grid;grid-template-columns:1.3fr 1fr;gap:48px;padding-block:64px 72px;align-items:center}
.eyebrow{font-weight:600;font-size:.8rem;letter-spacing:.14em;text-transform:uppercase;color:var(--amber)}
.hero h1{font-size:clamp(2rem,5vw,3.1rem);font-weight:800;margin-top:12px}
.hero .lead{color:var(--soft);font-size:1.12rem;margin-top:18px;max-width:52ch}
.ctas{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}
.card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:24px;display:grid;gap:16px}
.card div{display:grid;gap:2px}
.card small{font-size:.74rem;letter-spacing:.12em;text-transform:uppercase;color:var(--mute);font-weight:600}
.card strong{font-family:var(--display);font-size:1.05rem;font-weight:700;overflow-wrap:anywhere}
.card .todo{border-color:var(--amber)}
section{padding-block:72px}
.alt{background:var(--mist)}
.head{display:flex;justify-content:space-between;align-items:end;gap:24px;flex-wrap:wrap;margin-bottom:36px}
.head p{color:var(--ink-2);max-width:48ch}
.services{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);border:1px solid var(--line)}
.svc{background:var(--paper);padding:26px;display:grid;gap:10px;align-content:start}
.svc .tag{font-size:.75rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-2)}
.svc p{color:var(--ink-2);font-size:.97rem}
.svc .from{font-family:var(--display);font-weight:700;font-size:.92rem;margin-top:4px}
.two{display:grid;grid-template-columns:1fr 1.2fr;gap:48px;align-items:start}
.muted{color:var(--ink-2)}
.communes{display:flex;flex-wrap:wrap;gap:8px}
.communes span{background:var(--paper);border:1px solid var(--line);border-radius:4px;padding:5px 11px;font-size:.92rem}
.communes span:first-child{background:var(--ink);border-color:var(--ink);color:#fff;font-weight:600}
.works{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.ph{aspect-ratio:4/3;max-width:100%;border-radius:6px;border:2px dashed var(--ph);background:var(--mist);display:grid;place-items:center;color:var(--ink-2);font-size:.9rem;font-weight:600;text-align:center;padding:12px}
.work figcaption{margin-top:12px;display:grid;gap:2px}
.reviews{background:var(--paper);border:2px dashed var(--ph);border-radius:8px;padding:28px;display:grid;gap:10px;justify-items:start}
.stars{color:var(--amber);letter-spacing:3px;font-size:1.2rem}
.coords{display:grid;gap:18px;margin-top:22px}
.coords div{display:grid;gap:2px}
.coords small{font-size:.75rem;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-2);font-weight:600}
.coords strong{font-family:var(--display);font-size:1.12rem;overflow-wrap:anywhere}
form{background:var(--mist);border-radius:8px;padding:26px;display:grid;gap:14px}
.row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
label{display:grid;gap:6px;font-weight:600;font-size:.9rem}
input,textarea{font:inherit;font-weight:400;border:1px solid var(--line);border-radius:6px;padding:11px 12px;background:var(--paper);color:var(--ink);width:100%}
textarea{min-height:110px;resize:vertical}
.ok{background:#E4F3E8;color:#1E5A32;border-radius:6px;padding:12px;font-weight:600}
footer{background:var(--ink);color:var(--mute);font-size:.9rem;padding-block:28px}
footer .wrap{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
.callbar{display:none}
/* En-tête 1 : centré, coordonnées en bandeau */
.hero-centre .wrap{grid-template-columns:1fr;gap:40px;padding-block:72px 0}
.hero-centre .centre{text-align:center;display:grid;justify-items:center}
.hero-centre .lead{margin-inline:auto}
.hero-centre .ctas{justify-content:center}
.strip{display:grid;grid-template-columns:repeat(4,1fr);gap:20px}
.strip div{display:grid;gap:2px;min-width:0}
.strip small{font-size:.74rem;letter-spacing:.12em;text-transform:uppercase;font-weight:600}
.strip strong{font-family:var(--display);font-size:1.02rem;font-weight:700;overflow-wrap:anywhere}
.hero-centre .strip{border-top:1px solid rgba(255,255,255,.16);padding-block:24px 28px}
.hero-centre .strip small{color:var(--mute)}
/* En-tête 2 : fond clair, grande photo, coordonnées sur une bande sombre */
.hero-clair{background:var(--mist);color:var(--ink)}
.hero-clair .eyebrow{color:var(--ink-2)}
.hero-clair .eyebrow::before{content:"";display:inline-block;width:28px;height:3px;background:var(--amber);vertical-align:middle;margin-right:10px}
.hero-clair .lead{color:var(--ink-2)}
.hero-clair .btn-ghost{color:var(--ink);box-shadow:inset 0 0 0 1.5px var(--ink)}
.hero-clair .wrap{grid-template-columns:1.1fr 1fr}
.ph-hero{aspect-ratio:4/3.4;background:var(--paper)}
.infos{background:var(--ink);color:#fff;padding-block:22px}
.infos small{color:var(--mute)}
/* Prestations 1 : cartes numérotées */
.services.cartes{gap:20px;background:none;border:0}
.cartes .svc{border:1px solid var(--line);border-top:4px solid var(--amber);border-radius:6px}
.cartes .num{font-family:var(--display);font-weight:800;font-size:1.6rem;color:var(--ink);opacity:.25;line-height:1}
/* Prestations 2 : lignes */
.services.lignes{grid-template-columns:1fr;gap:0;background:none;border:0;border-top:2px solid var(--ink)}
.lignes .svc{grid-template-columns:minmax(0,1fr) minmax(0,1.6fr) auto;gap:24px;align-items:baseline;padding:22px 0;border-bottom:1px solid var(--line)}
.lignes .svc h3{margin-top:4px}
.lignes .from{margin:0;white-space:nowrap}
/* Réalisations 1 : avant / après */
.works.avap{grid-template-columns:1fr 1fr;gap:28px}
.paire{display:grid;grid-template-columns:1fr 1fr;gap:8px}
/* Vrai site (Pedro) : photos, logo, galerie, page de prestation */
.photo{display:block;width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;border-radius:6px;background:var(--mist)}
.photo-hero{aspect-ratio:4/3.4}
.hero:not(.hero-clair) .photo-hero{display:none}
.logo img{display:block;height:46px;width:auto;max-width:220px;object-fit:contain}
a.from{text-decoration:none;color:var(--ink)}
a.from:hover{text-decoration:underline}
.works.galerie{grid-template-columns:repeat(3,1fr)}
.work figcaption .muted{font-size:.92rem}
.reviews a.btn{margin-top:6px}
.article{max-width:760px}
.article p{color:var(--ink-2);margin-top:16px}
.article .photos{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-top:28px}
.mentions h3{margin-top:28px}
.mentions p{color:var(--ink-2);margin-top:8px}
@media (max-width:820px){
  .works.galerie,.article .photos{grid-template-columns:1fr 1fr}
  nav,.bar .btn{display:none}
  .hero-clair .wrap{grid-template-columns:1fr}
  .strip{grid-template-columns:1fr 1fr}
  .lignes .svc{grid-template-columns:1fr;gap:6px}
  .works.avap{grid-template-columns:1fr}
  .hero .wrap,.two{grid-template-columns:1fr;gap:32px}
  .services,.works{grid-template-columns:1fr}
  .row{grid-template-columns:1fr}
  section{padding-block:52px}
  .hero .wrap{padding-block:44px 52px}
  .callbar{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:6;gap:10px;background:var(--paper);border-top:1px solid var(--line);padding:10px max(16px,env(safe-area-inset-right,0px)) calc(10px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px))}
  .callbar .btn{flex:1}
  body{padding-bottom:72px}
}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
</style>
</head>
<body>
${R ? "" : `<div class="demo"><strong>Démonstration préparée par Devanture pour ${e(c.nom)}.</strong> Les éléments soulignés en pointillés sont à compléter ensemble.</div>`}

<header>
  <div class="wrap bar">
    <a class="logo" href="${R ? "{{R}}" : "#"}" style="text-decoration:none">${R?.logo
      ? `<img src="${R.logo.src}" width="${R.logo.largeur}" height="${R.logo.hauteur}" alt="${e(c.nom)}">`
      : `${e(c.nom)}<small>${e(c.metier)} · ${e(c.commune)}</small>`}</a>
    <nav aria-label="Navigation principale">
      <a href="${ancre(R, "prestations")}">Prestations</a><a href="${ancre(R, "zone")}">Zone</a>${!R || galerie.length ? `<a href="${ancre(R, "realisations")}">Réalisations</a>` : ""}${avis ? `<a href="${ancre(R, "avis")}">Avis</a>` : ""}<a href="#contact">Contact</a>
    </nav>
    <a class="btn btn-amber" href="#contact">Demander un devis</a>
  </div>
</header>

<!--principal-->
${hero}

<section id="prestations">
  <div class="wrap">
    <div class="head">
      <h2>Prestations</h2>
      <p>Chaque intervention commence par un devis écrit.${R ? "" : ` ${aCompleter("Vos prix indicatifs peuvent apparaître ici.")}`}</p>
    </div>
    <div class="${classeServices}">
      ${services.map(blocService).join("\n      ")}
    </div>
  </div>
</section>

<section id="zone" class="alt">
  <div class="wrap two">
    <div>
      <h2>Zone d'intervention</h2>
      <p class="muted" style="margin-top:14px">${e(c.zoneTexte)}</p>
    </div>
    <div class="communes">${c.zone.map((z) => `<span>${e(z)}</span>`).join("")}</div>
  </div>
</section>

${R ? (galerie.length ? `<section id="realisations">
  <div class="wrap">
    <div class="head"><h2>Réalisations</h2><p>Quelques chantiers récents.</p></div>
    <div class="works galerie">
      ${galerie.map((p) => `<figure class="work" style="margin:0">${imgPhoto(p, "photo")}<figcaption><span class="muted">${e(p.legende ?? p.alt)}</span></figcaption></figure>`).join("\n      ")}
    </div>
  </div>
</section>` : "") : `<section id="realisations">
  <div class="wrap">
    <div class="head"><h2>Réalisations</h2><p>Vos photos de chantier, avant et après, rassurent plus qu'un long discours.</p></div>
    <div class="works${v.realisations === 1 ? " avap" : ""}">
      ${photos.map(blocRealisation).join("\n      ")}
    </div>
  </div>
</section>`}

${!avis ? "" : R ? `<section id="avis" class="alt">
  <div class="wrap">
    <div class="head"><h2>Avis clients</h2></div>
    <div class="reviews">
      <div class="stars" aria-hidden="true">★★★★★</div>
      <h3>Ce que disent nos clients</h3>
      <p class="muted">Les avis de nos clients sont publiés sur notre fiche Google.</p>
      <a class="btn btn-amber" href="${e(R.avisUrl)}" target="_blank" rel="noopener">Lire les avis sur Google</a>
    </div>
  </div>
</section>` : `<section id="avis" class="alt">
  <div class="wrap">
    <div class="head"><h2>Avis clients</h2></div>
    <div class="reviews">
      <div class="stars" aria-hidden="true">☆☆☆☆☆</div>
      <h3>Vos avis Google peuvent s'afficher ici</h3>
      <p class="muted">Votre note et une sélection de vos avis clients, pour rassurer ceux qui ne vous connaissent pas encore.</p>
    </div>
  </div>
</section>`}

<section id="a-propos">
  <div class="wrap two">
    <h2>${e(c.nom)}</h2>
    <p class="muted">${e(c.apropos)}</p>
  </div>
</section>

<!--/principal-->
<!--contact-->
<section id="contact" class="alt">
  <div class="wrap two">
    <div>
      <h2>Demander un devis</h2>
      <p class="muted" style="margin-top:14px">Décrivez votre besoin : la demande arrive directement par e-mail.</p>
      <div class="coords">
        ${tel ? `<div><small>Téléphone</small><strong>${tel}</strong></div>` : ""}
        ${mail ? `<div><small>E-mail</small><strong>${mail}</strong></div>` : ""}
        ${R?.horaires ? `<div><small>Horaires</small><strong>${horaires}</strong></div>` : ""}
        <div><small>Secteur</small><strong>${e(c.commune)} et alentours</strong></div>
      </div>
    </div>
    <form id="devis" novalidate>
      <div class="row">
        <label for="nom">Nom<input id="nom" name="nom" autocomplete="name" placeholder="Votre nom"></label>
        <label for="tel">Téléphone<input id="tel" name="tel" autocomplete="tel" placeholder="06 00 00 00 00"></label>
      </div>
      ${R ? `<label for="email">E-mail (facultatif)<input id="email" name="email" type="email" autocomplete="email" placeholder="vous@exemple.fr"></label>` : ""}
      <label for="commune">Commune<input id="commune" name="commune" placeholder="${e(c.commune)}"></label>
      <label for="msg">Votre demande<textarea id="msg" name="msg" placeholder="Décrivez votre besoin en quelques mots"></textarea></label>
      <button class="btn btn-amber" type="submit">Envoyer ma demande</button>
      ${R ? champPiege : ""}
      <p class="ok" id="ok" hidden aria-live="polite">Ceci est une démonstration : rien n'a été envoyé.</p>
    </form>
  </div>
</section>
<!--/contact-->

<footer>
  <div class="wrap">${R ? piedReel(c.nom, c.commune) : `<span>© ${annee} ${e(c.nom)} · ${e(c.commune)}</span><span>Démonstration réalisée par Devanture</span>`}</div>
</footer>

<div class="callbar">${R && !R.telephone ? "" : `<a class="btn btn-amber" href="${telHref}">Appeler</a>`}<a class="btn" style="background:var(--ink);color:#fff" href="#contact">Devis</a></div>

${R ? scriptDevis(R) : `<script>
document.getElementById("devis").addEventListener("submit", function (ev) { ev.preventDefault(); document.getElementById("ok").hidden = false; });
</script>`}
</body>
</html>`;
}

/** Exemple fictif, pour voir le modèle sans base de données (/demo/exemple). */
export const EXEMPLE_DEMO: ContenuDemo = {
  nom: "Vandamme Plomberie",
  metier: "Plombier-chauffagiste",
  commune: "Roubaix",
  adresse: "12 rue de l'Exemple, 59100 Roubaix",
  email: null,
  accroche: "Dépannage, chauffage et salle de bains à Roubaix et dans la métropole lilloise",
  intro: "Une fuite, une chaudière qui se met en sécurité ou une salle de bains à refaire : décrivez votre besoin et recevez un devis clair avant toute intervention.",
  services: [
    { tag: "Urgence", titre: "Dépannage fuite", description: "Recherche de fuite, joint, flexible, robinetterie. Coupure et remise en eau." },
    { tag: "Chauffage", titre: "Chaudière gaz", description: "Entretien annuel, attestation et remplacement par une chaudière à condensation." },
    { tag: "Rénovation", titre: "Pompe à chaleur", description: "Étude, pose et mise en service d'une pompe à chaleur air-eau." },
    { tag: "Rénovation", titre: "Salle de bains", description: "Douche à l'italienne, remplacement de baignoire, adaptation pour les aînés." },
    { tag: "Eau chaude", titre: "Chauffe-eau", description: "Ballon électrique ou thermodynamique : remplacement et mise en service." },
    { tag: "Évacuation", titre: "Débouchage", description: "WC, évier, colonne : débouchage et contrôle des canalisations." },
  ],
  zoneTexte: "Interventions à Roubaix et dans les communes voisines de la métropole lilloise.",
  zone: ["Roubaix", "Tourcoing", "Wattrelos", "Croix", "Hem", "Wasquehal", "Lys-lez-Lannoy", "Villeneuve-d'Ascq", "Lille"],
  apropos: "Entreprise de plomberie et de chauffage installée à Roubaix, au service des particuliers et des petits commerces de la métropole lilloise.",
};
