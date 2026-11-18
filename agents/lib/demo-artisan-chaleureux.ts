// Modèle de démo « Artisan chaleureux » (26/10) : la version rouge brique, plus personnelle.
// Mêmes textes que le modèle « artisan pro » (ContenuDemo), seule la mise en forme change.
// Même règle d'honnêteté : ce qu'on ne sait pas (téléphone, photo, avis, prix, horaires) est « à compléter ».
// Ce fichier est lu par l'agent des maquettes ET par le tableau de bord : il n'importe que des types et le modèle pro.
// Variantes (27/10) : palette, polices, en-tête, prestations et réalisations selon `c.habillage` (habillage.ts).
import type { ContenuDemo } from "./demo-artisan-pro.ts";
import { variantes } from "./habillage.ts";
import { ancre, champPiege, horairesHtml, imgPhoto, lienTel, piedReel, scriptDevis, teteSeo } from "./site-reel.ts";

/** Palettes du style chaleureux. La 0 est celle d'origine (brique et mousse). */
const PALETTES = [
  { brick: "#A3412A", dk: "#7C2E1C", moss: "#24473B", text: "#2A2421", muted: "#6B5F58", stone: "#F2EEEA", line: "#E2DAD3", dash: "var(--dash)", pic: "#EADFD8", story: "#E4ECE8", foot: "#B9CBC2", ok: "#E3EFE8" }, // brique et mousse
  { brick: "#B4532F", dk: "#8C3E21", moss: "#1F3248", text: "#23262B", muted: "#5F6670", stone: "#F4EFEA", line: "#E4DCD4", dash: "#CDAE9B", pic: "#EBDFD6", story: "#DCE4EE", foot: "#AEBBCB", ok: "#E3EAF2" }, // terracotta et bleu nuit
  { brick: "#946012", dk: "#744B0D", moss: "#3B4724", text: "#2B2A22", muted: "#66624F", stone: "#F5F1E6", line: "#E6DFCB", dash: "#CDB98C", pic: "#EDE4CC", story: "#E8ECDD", foot: "#BEC6A8", ok: "#E9EEDD" }, // moutarde et olive
  { brick: "#2D6A4F", dk: "#1F4D39", moss: "#4A2E1F", text: "#2A2623", muted: "#685E56", stone: "#EEF2EC", line: "#DCE3DA", dash: "#A9BFAF", pic: "#DDE7DF", story: "#F1E7DF", foot: "#CDB8A8", ok: "#E3EFE8" }, // sapin et cuivre
  { brick: "#1B6B75", dk: "#134F57", moss: "#2A2E45", text: "#25272E", muted: "#5E6370", stone: "#EEF3F3", line: "#D8E2E3", dash: "#A6C2C6", pic: "#DCE8EA", story: "#E0E3EF", foot: "#B3B8CC", ok: "#E1EEF0" }, // bleu canard et nuit
  { brick: "#8A3A5C", dk: "#6B2B46", moss: "#2E2C3F", text: "#2A2428", muted: "#6A5D66", stone: "#F4EEF0", line: "#E5DADF", dash: "#C9A9B8", pic: "#EBDDE3", story: "#E6E2EE", foot: "#BBB5C9", ok: "#EDE3EA" }, // prune et lin
];

/** Paires de polices. `gras` : graisse des grands titres (certaines polices n'existent qu'en une graisse). */
const POLICES = [
  { url: "Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Nunito+Sans:opsz,wght@6..12,400;6..12,700", titre: "Bricolage Grotesque", texte: "Nunito Sans", gras: 800, gras3: 600 },
  { url: "Fraunces:opsz,wght@9..144,600;9..144,800&family=Mulish:wght@400;700", titre: "Fraunces", texte: "Mulish", gras: 800, gras3: 600 },
  { url: "DM+Serif+Display&family=DM+Sans:opsz,wght@9..40,400;9..40,700", titre: "DM Serif Display", texte: "DM Sans", gras: 400, gras3: 400 },
];

function e(texte: string | null | undefined): string {
  return String(texte ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const aCompleter = (texte: string) => `<span class="todo">${e(texte)}</span>`;

/** Initiales pour le rond du logo : « Plomberie Dupont » → « PD ». */
function initiales(nom: string): string {
  const mots = nom.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter((m) => m.length > 1);
  return (mots.slice(0, 2).map((m) => m[0]).join("") || nom.slice(0, 2)).toUpperCase();
}

export function renderArtisanChaleureux(c: ContenuDemo): string {
  const annee = new Date().getFullYear();
  const services = c.services.slice(0, 6);
  const v = variantes(c, "chaleureux");
  const pal = PALETTES[v.palette];
  const pol = POLICES[v.police];
  const photos = services.slice(0, v.realisations === 1 ? 4 : 5);
  const R = c.reel;
  const telHref = R?.telephone ? lienTel(R.telephone) : "#contact";
  const photoHero = R?.photos[0];
  // Vrai site : la galerie reprend les photos du client, sauf celle de l'en-tête (s'il en reste assez).
  const galerie = R ? R.photos.slice(R.photos.length > 3 ? 1 : 0) : [];
  const texteHero = `<div class="hello">${e(c.metier)} à ${e(c.commune)}</div>
      <h1>${e(c.accroche)}</h1>
      <p class="lead">${e(c.intro)}</p>
      <div class="ctas">
        <a class="btn btn-brick" href="#contact">Demander un devis</a>
        <a class="btn btn-line" href="${ancre(R, "prestations")}">Voir les prestations</a>
      </div>`;
  const badge = !R
    ? `<div class="badge"><div class="stars" aria-hidden="true">☆☆☆☆☆</div><b>${aCompleter("Votre note Google")}</b><span>et vos avis clients</span></div>`
    : R.avisUrl
      ? `<a class="badge" href="${e(R.avisUrl)}" target="_blank" rel="noopener" style="text-decoration:none"><div class="stars" aria-hidden="true">★★★★★</div><b>Nos avis clients</b><span>à lire sur Google</span></a>`
      : "";
  const portrait = !R
    ? `<div class="portrait">
      <div class="pic">Votre photo ici<br>(vous, votre équipe ou votre camionnette)</div>
      ${badge}
    </div>`
    : photoHero
      ? `<div class="portrait">
      ${imgPhoto(photoHero, "pic photo", true)}
      ${badge}
    </div>`
      : "";
  // En-tête : 0 = texte puis portrait ; 1 = portrait à gauche ; 2 = grande photo en bandeau, texte dans une carte.
  const hero = [
    `<div class="hero"><div class="wrap">
    <div>
      ${texteHero}
    </div>
    ${portrait}
  </div></div>`,
    `<div class="hero hero-inverse"><div class="wrap">
    ${portrait}
    <div>
      ${texteHero}
    </div>
  </div></div>`,
    `<div class="hero hero-bandeau"><div class="wrap">
    ${photoHero ? imgPhoto(photoHero, "banniere photo", true) : R ? "" : `<div class="banniere">Votre plus belle photo de chantier ici</div>`}
    <div class="panneau">
      ${texteHero}
      ${badge}
    </div>
  </div></div>`,
  ][v.entete];
  // Prestations : 0 = liste sur deux colonnes ; 1 = tuiles ; 2 = liste numérotée.
  const classeServices = ["svc-list", "svc-list tuiles", "svc-list etapes"][v.prestations];
  // Site Pro : « sur devis » devient un lien vers la page de la prestation.
  const prix = (i: number) => {
    const page = R?.pages.find((p) => p.prestation === i);
    return page ? `<a class="price" href="{{R}}${page.slug}/">en savoir plus →</a>` : `<span class="price">sur devis</span>`;
  };
  const blocService = (s: ContenuDemo["services"][number], i: number) => v.prestations === 2
    ? `<div class="svc"><span class="n">${i + 1}</span><h3>${e(s.titre)}</h3>${prix(i)}<p>${e(s.description)}</p></div>`
    : `<div class="svc"><h3>${e(s.titre)}</h3>${prix(i)}<p>${e(s.description)}</p></div>`;
  const telTexte = R?.telephone ? `<a class="phone" href="${telHref}">${e(R.telephone)}</a>` : R ? "" : `<span class="phone">${aCompleter("Votre numéro")}</span>`;

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
  --brick:${pal.brick};--brick-dk:${pal.dk};--moss:${pal.moss};--text:${pal.text};--muted:${pal.muted};--stone:${pal.stone};--paper:#FFFFFF;--line:${pal.line};
  --dash:${pal.dash};--pic:${pal.pic};--story:${pal.story};--foot:${pal.foot};--ok:${pal.ok};--gras:${pol.gras};--gras3:${pol.gras3};
  --display:"${pol.titre}",system-ui,sans-serif;--body:"${pol.texte}",system-ui,sans-serif;color-scheme:light;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--paper);color:var(--text);font-family:var(--body);font-size:17px;line-height:1.65}
.wrap{max-width:1040px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
h1,h2,h3{font-family:var(--display);line-height:1.1;text-wrap:balance;margin:0;color:var(--moss)}
h2{font-size:clamp(1.7rem,3.4vw,2.4rem);font-weight:var(--gras)}
h3{font-size:1.15rem;font-weight:var(--gras3)}
p{margin:0}
a{color:inherit}
.todo{border-bottom:2px dashed #D9922E}
.demo{background:#FFF6E6;color:#3a2a10;font-size:.86rem;text-align:center;padding:8px 16px;border-bottom:1px solid #F1D9A8}
.demo strong{font-weight:700}
.bricks{height:14px;background-color:var(--brick);background-image:linear-gradient(var(--brick-dk) 1px,transparent 1px),linear-gradient(90deg,var(--brick-dk) 1px,transparent 1px);background-size:28px 7px,28px 14px}
.bar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-block:18px}
.logo{display:flex;align-items:center;gap:12px;min-width:0}
.mono{flex:none;width:44px;height:44px;border-radius:50%;background:var(--brick);color:#fff;display:grid;place-items:center;font-family:var(--display);font-weight:var(--gras);font-size:1.05rem}
.logo b{font-family:var(--display);font-size:1.15rem;color:var(--moss);display:block;line-height:1.15}
.logo span{font-size:.85rem;color:var(--muted)}
.phone{font-family:var(--display);font-weight:var(--gras);font-size:1.1rem;color:var(--brick);text-decoration:none;white-space:nowrap}
.btn{display:inline-flex;align-items:center;justify-content:center;font-family:var(--display);font-weight:600;font-size:1rem;text-decoration:none;border:0;cursor:pointer;border-radius:999px;padding:13px 24px}
.btn-brick{background:var(--brick);color:#fff}
.btn-brick:hover{background:var(--brick-dk)}
.btn-line{color:var(--moss);box-shadow:inset 0 0 0 2px var(--moss);background:transparent}
.btn:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid var(--moss);outline-offset:2px}
.hero{background:var(--stone)}
.hero .wrap{display:grid;grid-template-columns:1.25fr 1fr;gap:44px;align-items:center;padding-block:56px 64px}
.hello{font-family:var(--display);font-weight:600;color:var(--brick);font-size:1.05rem}
.hero h1{font-size:clamp(2rem,5vw,3.2rem);font-weight:var(--gras);margin-top:8px}
.hero .lead{font-size:1.1rem;margin-top:18px;max-width:50ch}
.ctas{display:flex;flex-wrap:wrap;gap:12px;margin-top:26px}
.portrait{position:relative}
.pic{aspect-ratio:4/5;max-width:100%;border-radius:22px 22px 120px 22px;border:2px dashed var(--dash);background:var(--pic);display:grid;place-items:center;color:var(--muted);font-weight:700;text-align:center;padding:16px}
.badge{position:absolute;left:-14px;bottom:28px;background:var(--paper);border-radius:14px;padding:12px 16px;box-shadow:0 8px 24px rgba(42,36,33,.14);display:grid;gap:2px}
.badge b{font-family:var(--display);color:var(--moss)}
.badge span{font-size:.85rem;color:var(--muted)}
.stars{color:#D9922E;letter-spacing:2px}
section{padding-block:72px}
.lead2{color:var(--muted);margin-top:12px;max-width:58ch}
.svc-list{margin-top:32px;display:grid;grid-template-columns:1fr 1fr;gap:0 40px}
.svc{display:grid;grid-template-columns:1fr auto;gap:4px 16px;padding-block:18px;border-bottom:1px dashed var(--line)}
.svc p{grid-column:1/-1;color:var(--muted);font-size:.96rem}
.svc .price{font-weight:700;color:var(--brick);font-size:.92rem;white-space:nowrap}
.story{background:var(--moss);color:var(--story)}
.story .wrap{display:grid;grid-template-columns:1fr 1.3fr;gap:48px;align-items:center}
.story h2{color:#fff}
.story p+p{margin-top:14px}
.story blockquote{margin:0;font-family:var(--display);font-size:clamp(1.25rem,2.6vw,1.7rem);font-weight:600;line-height:1.3;color:#fff;border-left:4px solid var(--brick);padding-left:20px}
.story .todo{border-color:#E8B86A}
.communes{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
.communes span{border:1px solid rgba(255,255,255,.35);border-radius:999px;padding:4px 12px;font-size:.9rem}
.works{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:16px;margin-top:32px}
.ph{border-radius:16px;min-height:180px;border:2px dashed var(--dash);background:var(--stone);display:flex;flex-direction:column;justify-content:flex-end;padding:16px;color:var(--muted)}
.ph b{font-family:var(--display);font-size:1.05rem;color:var(--moss)}
.ph:first-child{grid-row:span 2;min-height:376px}
.reviews{margin-top:32px;background:var(--stone);border:2px dashed var(--dash);border-radius:18px;padding:28px;display:grid;gap:10px;justify-items:start}
.contact{background:var(--stone)}
.contact .wrap{display:grid;grid-template-columns:1fr 1.15fr;gap:48px}
.big-phone{display:block;font-family:var(--display);font-weight:var(--gras);font-size:clamp(1.6rem,4vw,2.2rem);color:var(--brick);margin-top:20px}
.small{color:var(--muted);font-size:.95rem}
form{background:var(--paper);border-radius:20px;padding:26px;display:grid;gap:14px}
label{display:grid;gap:6px;font-weight:700;font-size:.9rem;color:var(--moss)}
input,textarea{font:inherit;font-weight:400;border:1.5px solid var(--line);border-radius:12px;padding:11px 14px;background:var(--paper);color:var(--text);width:100%}
textarea{min-height:110px;resize:vertical}
.ok{background:var(--ok);color:var(--moss);border-radius:12px;padding:12px;font-weight:700}
footer{background:var(--moss);color:var(--foot);font-size:.9rem;padding-block:26px}
footer .wrap{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
.callbar{display:none}
/* En-tête 1 : portrait à gauche */
.hero-inverse .wrap{grid-template-columns:1fr 1.25fr}
.hero-inverse .pic{border-radius:22px 22px 22px 120px}
.hero-inverse .badge{left:auto;right:-14px}
/* En-tête 2 : grande photo en bandeau, texte dans une carte */
.hero-bandeau .wrap{display:block;padding-block:28px 56px}
.banniere{min-height:300px;border-radius:28px;border:2px dashed var(--dash);background:var(--pic);display:grid;place-items:center;color:var(--muted);font-weight:700;text-align:center;padding:16px}
.panneau{position:relative;background:var(--paper);border-radius:22px;padding:30px;margin:-90px 28px 0;box-shadow:0 12px 32px rgba(0,0,0,.10)}
.panneau .badge{position:static;box-shadow:none;background:var(--stone);margin-top:20px;justify-self:start;display:inline-grid}
/* Prestations 1 : tuiles */
.svc-list.tuiles{grid-template-columns:repeat(3,1fr);gap:16px}
.tuiles .svc{background:var(--stone);border:0;border-radius:18px;padding:20px;align-content:start}
/* Prestations 2 : liste numérotée */
.svc-list.etapes{grid-template-columns:1fr;max-width:760px}
.etapes .svc{grid-template-columns:auto 1fr auto;gap:4px 16px;align-items:center}
.etapes .n{grid-row:span 2;align-self:start;width:40px;height:40px;border-radius:50%;background:var(--brick);color:#fff;display:grid;place-items:center;font-family:var(--display);font-weight:700}
.etapes .svc p{grid-column:2/-1}
/* Réalisations 1 : bande de photos qui défile */
.works.bande{display:flex;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:8px}
.bande .ph{flex:0 0 min(280px,78%);min-height:300px;scroll-snap-align:start}
.bande .ph:first-child{min-height:300px}
/* Vrai site (Pedro) : photos, logo, galerie, page de prestation */
.photo{display:block;width:100%;height:auto;object-fit:cover;background:var(--pic)}
img.pic{border:0;padding:0}
img.banniere{border:0;padding:0;height:min(46vw,420px);min-height:220px}
.hero .wrap:has(> :only-child),.story .wrap:has(> :only-child){grid-template-columns:1fr}
.logo img{display:block;height:48px;width:auto;max-width:220px;object-fit:contain}
a.price{text-decoration:none}
a.price:hover{text-decoration:underline}
.works.galerie{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.galerie figure{margin:0}
.galerie .photo{aspect-ratio:4/3;border-radius:16px}
.galerie figcaption{color:var(--muted);font-size:.9rem;margin-top:8px}
.story .photo{aspect-ratio:4/3;border-radius:22px}
.reviews a.btn{margin-top:6px}
.article{max-width:760px}
.article p{margin-top:16px}
.article .photos{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-top:28px}
.article .photo{aspect-ratio:4/3;border-radius:16px}
.mentions h3{margin-top:28px}
.mentions p{color:var(--muted);margin-top:8px}
@media (max-width:820px){
  .works.galerie,.article .photos{grid-template-columns:1fr 1fr}
  .hero-inverse .wrap{grid-template-columns:1fr}
  .hero-inverse .portrait{order:2}
  .hero-inverse .badge{right:auto;left:12px}
  .panneau{margin:-60px 8px 0;padding:22px}
  .banniere{min-height:220px}
  .svc-list.tuiles{grid-template-columns:1fr}
  .hero .wrap,.story .wrap,.contact .wrap{grid-template-columns:1fr;gap:32px}
  .svc-list{grid-template-columns:1fr}
  .works{grid-template-columns:1fr 1fr}
  .ph:first-child{grid-row:auto;grid-column:1/-1;min-height:200px}
  .portrait{max-width:300px}
  .badge{left:12px}
  .phone{display:none}
  section{padding-block:52px}
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
  <div class="bricks" aria-hidden="true"></div>
  <div class="wrap bar">
    <a class="logo" href="${R ? "{{R}}" : "#"}" style="text-decoration:none">${R?.logo
      ? `<img src="${R.logo.src}" width="${R.logo.largeur}" height="${R.logo.hauteur}" alt="${e(c.nom)}">`
      : `<div class="mono">${e(initiales(c.nom))}</div><div><b>${e(c.nom)}</b><span>${e(c.metier)} · ${e(c.commune)}</span></div>`}</a>
    ${telTexte}
  </div>
</header>

<!--principal-->
${hero}

<section id="prestations">
  <div class="wrap">
    <h2>Ce que je fais pour vous</h2>
    <p class="lead2">Chaque chantier commence par un devis.${R ? "" : ` ${aCompleter("Vos prix indicatifs peuvent apparaître ici.")}`}</p>
    <div class="${classeServices}">
      ${services.map(blocService).join("\n      ")}
    </div>
  </div>
</section>

<section class="story">
  <div class="wrap">
    ${!R ? `<blockquote>${aCompleter("« Une phrase qui vous ressemble, sur votre façon de travailler. »")}</blockquote>`
      : R.citation ? `<blockquote>« ${e(R.citation)} »</blockquote>` : ""}
    <div>
      <h2>${e(c.nom)}</h2>
      <p style="margin-top:16px">${e(c.apropos)}</p>
      <p>${e(c.zoneTexte)}</p>
      <div class="communes">${c.zone.map((z) => `<span>${e(z)}</span>`).join("")}</div>
    </div>
  </div>
</section>

${R ? (galerie.length || R.avisUrl ? `<section id="realisations">
  <div class="wrap">
    ${galerie.length ? `<h2>Mes derniers chantiers</h2>
    <div class="works galerie">
      ${galerie.map((p) => `<figure>${imgPhoto(p, "photo")}<figcaption>${e(p.legende ?? p.alt)}</figcaption></figure>`).join("\n      ")}
    </div>` : ""}
    ${R.avisUrl ? `<div class="reviews" id="avis">
      <div class="stars" aria-hidden="true">★★★★★</div>
      <h3>Ils m'ont fait confiance</h3>
      <p class="small">Les avis de mes clients sont publiés sur ma fiche Google.</p>
      <a class="btn btn-brick" href="${e(R.avisUrl)}" target="_blank" rel="noopener">Lire les avis sur Google</a>
    </div>` : ""}
  </div>
</section>` : "") : `<section id="realisations">
  <div class="wrap">
    <h2>Mes derniers chantiers</h2>
    <div class="works${v.realisations === 1 ? " bande" : ""}">
      ${photos.map((s) => `<div class="ph"><b>${e(s.titre)}</b><span>Votre photo de chantier</span></div>`).join("\n      ")}
    </div>
    <div class="reviews">
      <div class="stars" aria-hidden="true">☆☆☆☆☆</div>
      <h3>Ils m'ont fait confiance</h3>
      <p class="small">Vos avis Google peuvent s'afficher ici, pour rassurer ceux qui ne vous connaissent pas encore.</p>
    </div>
  </div>
</section>`}

<!--/principal-->
<!--contact-->
<section id="contact" class="contact">
  <div class="wrap">
    <div>
      <h2>On en parle ?</h2>
      <p class="small" style="margin-top:12px">Le plus simple, c'est d'appeler. Sinon, laissez un message : la demande arrive directement par e-mail.</p>
      ${R ? (R.telephone ? `<a class="big-phone" href="${telHref}" style="text-decoration:none">${e(R.telephone)}</a>` : "")
        : `<span class="big-phone">${aCompleter("Votre numéro")}</span>`}
      ${c.email ? `<p class="small">${e(c.email)}</p>` : R ? "" : `<p class="small">${aCompleter("Votre adresse e-mail")}</p>`}
      ${R ? (R.horaires ? `<p class="small" style="margin-top:6px">${horairesHtml(R.horaires)}</p>` : "")
        : `<p class="small" style="margin-top:6px">${aCompleter("Vos horaires d'ouverture")}</p>`}
    </div>
    <form id="devis" novalidate>
      <label for="nom">Votre nom<input id="nom" name="nom" autocomplete="name" placeholder="Votre nom"></label>
      <label for="tel">Votre téléphone<input id="tel" name="tel" autocomplete="tel" placeholder="06 00 00 00 00"></label>
      ${R ? `<label for="email">Votre e-mail (facultatif)<input id="email" name="email" type="email" autocomplete="email" placeholder="vous@exemple.fr"></label>
      <label for="commune">Votre commune<input id="commune" name="commune" placeholder="${e(c.commune)}"></label>` : ""}
      <label for="msg">Votre besoin<textarea id="msg" name="msg" placeholder="Décrivez votre besoin en quelques mots"></textarea></label>
      <button class="btn btn-brick" type="submit">Envoyer ma demande</button>
      ${R ? champPiege : ""}
      <p class="ok" id="ok" hidden aria-live="polite">Ceci est une démonstration : rien n'a été envoyé.</p>
    </form>
  </div>
</section>
<!--/contact-->

<footer>
  <div class="wrap">${R ? piedReel(c.nom, c.commune) : `<span>© ${annee} ${e(c.nom)} · ${e(c.commune)}</span><span>Démonstration réalisée par Devanture</span>`}</div>
</footer>

<div class="callbar">${R && !R.telephone ? "" : `<a class="btn btn-brick" href="${telHref}">Appeler</a>`}<a class="btn btn-line" style="background:var(--paper)" href="#contact">Devis</a></div>

${R ? scriptDevis(R) : `<script>
document.getElementById("devis").addEventListener("submit", function (ev) { ev.preventDefault(); document.getElementById("ok").hidden = false; });
</script>`}
</body>
</html>`;
}
