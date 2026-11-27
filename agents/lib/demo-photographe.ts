// Mises en page des maquettes de photographes (27/11, demande de Broise : « refais la même démarche » qu'avec les coachs).
// La mise en page 0 (« Classique ») est celle d'origine, rendue dans demo-independant.ts (Broise l'aime).
// Les autres reprennent les codes de photographes connus, sans rien copier (ni texte, ni image, ni logo) :
//   1 « Galerie » : Jose Villa (blanc, nom centré, grande photo sans texte, titres fins centrés, photos pleine largeur / par deux).
//   2 « Studio »  : Peter Hurley et Elena S Blair (gros titres capitales serrés, haut de page coupé en deux avec une grille
//                   de photos, une section par prestation, alternance clair / noir).
//   3 « Carnet »  : Corbin Gurkin (feuille blanche encadrée posée sur un fond teinté, monogramme, accroche en italique,
//                   repères « 1 · 2 · 3 », portrait en arche).
// Les couleurs viennent de la palette choisie ; les polices vont avec la mise en page.
import type { ContenuIndependant, Specialite } from "./demo-independant.ts";
import { EN_HAUTEUR, repartir, secondePhoto } from "./cadrage.ts";

export const MISES_EN_PAGE_PHOTOGRAPHE = ["Classique", "Galerie", "Studio", "Carnet"] as const;

export interface CouleursPhoto { fond: string; encre: string; doux: string; accent: string; accentTexte: string; carte: string; ligne: string }

export interface DonneesPhotographe {
  c: ContenuIndependant;
  spe: Specialite;
  /** Photos de la spécialité : [0] haut de page, [1..6] galerie, dernière = portrait. */
  ph: string[];
  m: number;
  couleurs: CouleursPhoto;
  jours: string[];
  creneaux: string[];
}

const POLICES = [
  null,
  { titre: "Cormorant Garamond", texte: "Jost", url: "Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Jost:wght@300;400;500" },
  { titre: "Bebas Neue", texte: "Montserrat", url: "Bebas+Neue&family=Montserrat:wght@300;400;600" },
  { titre: "Cormorant Garamond", texte: "Lora", url: "Cormorant+Garamond:ital,wght@0,400;0,500;1,400;1,500&family=Lora:wght@400;500" },
] as const;

function e(texte: string | null | undefined): string {
  return String(texte ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const photo = (id: string, w: number) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=70`;
const img = (id: string | undefined, w: number, alt: string) =>
  id ? `<img src="${photo(id, w)}" alt="${e(alt)}" loading="lazy" onerror="this.remove()">` : "";
const telHref = (t: string) => `tel:${t.replace(/[^\d+]/g, "")}`;

/** Initiales du nom (sans « Photographie », « Photo »…), pour le monogramme de « Carnet ». */
function initiales(nom: string): string {
  const mots = nom.replace(/\b(photograph\w*|photos?|studio|wedding|weddings)\b/gi, " ").split(/[\s&'-]+/).filter((m) => /^\p{L}/u.test(m));
  return (mots.slice(0, 2).map((m) => m[0]).join("") || nom.slice(0, 1)).toUpperCase();
}

export function renderPhotographe(d: DonneesPhotographe): string {
  const { c, ph, couleurs: col } = d;
  const m = Math.min(3, Math.max(1, d.m));
  const pol = POLICES[m]!;
  const prestations = c.prestations.slice(0, 4);
  const verbe = "Réserver une séance";
  const annee = new Date().getFullYear();
  const posHero = d.spe === "portrait" ? "50% 25%" : "50% 40%";
  // 27/11 : cases larges (bandeaux de « Galerie ») → photos horizontales ; cases hautes → photos en hauteur.
  // « Galerie » : la grande photo du haut doit être horizontale ; si celle de la spécialité est en hauteur, on prend la
  // première horizontale, qui ne revient alors pas dans la galerie.
  const hautDePage = m === 1 && EN_HAUTEUR.has(ph[0]) ? (ph.slice(1).find((id) => !EN_HAUTEUR.has(id)) ?? ph[0]) : ph[0];
  const sansHaut = [ph[0], ...ph.slice(1, 8)].filter((id) => id !== hautDePage).slice(0, 6);
  const galerie = m === 1 ? repartir(sansHaut, ["large", "haute", "haute", "large", "haute", "haute"])
    : m === 2 ? repartir(ph.slice(1, 7), ["haute", "haute", "haute", "haute", "haute", "haute"]) : ph.slice(1, 7);
  const portrait = ph[ph.length - 1];
  const tarif = `<span class="todo">Votre tarif</span>`;
  const legende = `<p class="legende">Photos d'illustration : vos propres photos prendront leur place.</p>`;

  const resa = `<section id="reserver" class="band resa">
  <div class="resa-txt">
    <p class="sur">Réservation en ligne</p>
    <h2>Réservez votre séance en ligne</h2>
    <p>Vos clients choisissent la prestation et le jour qui leur conviennent, à toute heure, sans attendre votre rappel.</p>
    <ol class="etapes"><li>Choisir la prestation</li><li>Choisir le créneau</li><li>Confirmer, c'est réservé</li></ol>
  </div>
  <div class="agenda" aria-label="Exemple de réservation en ligne">
    <div class="ag-tete"><b>${e(prestations[0]?.titre ?? "Séance")}</b><span>Exemple</span></div>
    <div class="jours">${d.jours.map((j, i) => `<button type="button" class="jour${i === 1 ? " on" : ""}">${j}</button>`).join("")}</div>
    <div class="creneaux">${d.creneaux.map((h, i) => `<button type="button" class="cr${i === 1 ? " on" : ""}">${h}</button>`).join("")}</div>
    <button type="button" class="btn plein">Confirmer la réservation</button>
    <p class="note">Créneaux d'exemple : vos vraies disponibilités s'afficheront ici.</p>
  </div>
</section>`;
  const zone = `<div class="zone">${c.zone.map((z) => `<span>${e(z)}</span>`).join("")}</div>`;
  const apropos = `<section id="apropos" class="band apropos">
  <figure class="portrait"><div>${img(portrait, 800, "Photo d'illustration")}</div><figcaption>Photo d'illustration : votre portrait prendra sa place.</figcaption></figure>
  <div><p class="sur">À propos</p><h2>${m === 2 ? "Derrière l'objectif" : "Qui suis-je ?"}</h2><p>${e(c.apropos)}</p>${zone}</div>
</section>`;
  const boutonsContact = [
    c.telephone ? `<a class="btn ghost" href="${telHref(c.telephone)}">Appeler · ${e(c.telephone)}</a>` : "",
    c.email ? `<a class="btn ghost" href="mailto:${e(c.email)}">${e(c.email)}</a>` : "",
  ].join("");
  const contact = `<!--contact-->
<section id="contact" class="band contact">
  <p class="sur">Contact</p>
  <h2>Parlons de votre projet</h2>
  <p>Réservez directement en ligne, ou écrivez-moi pour une demande particulière.</p>
  <div class="ctas"><a class="btn" href="#reserver">${verbe}</a>${boutonsContact}</div>
</section>`;
  const pied = `<footer><span>© ${annee} ${e(c.nom)} · ${e(c.metier)} à ${e(c.commune)}</span><span>Mentions légales</span></footer>`;
  const nav = `<nav><a href="#prestations">Prestations</a>${m === 2 ? "" : `<a href="#galerie">Portfolio</a>`}<a href="#reserver">Réserver</a><a href="#apropos">À propos</a><a href="#contact">Contact</a></nav>`;

  // Bandeau large de « Galerie » : une photo horizontale, sinon deux photos en hauteur côte à côte (jamais une tranche de visage).
  const bandeau = (id: string, classe: string, n: number) => {
    const deux = secondePhoto(id, galerie, [portrait, ph[0]]);
    return deux
      ? `<div class="paire">${[id, deux].map((x, k) => `<figure>${img(x, 1000, `Photo d'illustration ${n}${k ? " bis" : ""}`)}</figure>`).join("")}</div>`
      : `<figure class="${classe}">${img(id, 2000, `Photo d'illustration ${n}`)}</figure>`;
  };
  let corps = "";
  if (m === 1) {
    // « Galerie » (codes de Jose Villa)
    corps = `<header><a class="logo" href="#">${e(c.nom)}</a>${nav}</header>
<!--principal-->
<section class="hero-img">${img(hautDePage, 2000, `Photo d'illustration : ${c.metier}`)}</section>
<section class="band intro">
  <p class="sur">${e(c.metier)} · ${e(c.commune)}</p>
  <h1>${e(c.accroche)}</h1>
  <p class="lead">${e(c.intro)}</p>
  <div class="ctas"><a class="btn" href="#reserver">${verbe}</a></div>
</section>
<section id="galerie" class="galerie">
  ${bandeau(galerie[0], "large", 1)}
  <div class="paire"><figure>${img(galerie[1], 1000, "Photo d'illustration 2")}</figure><figure>${img(galerie[2], 1000, "Photo d'illustration 3")}</figure></div>
  ${bandeau(galerie[3], "moyenne", 4)}
  <div class="paire"><figure>${img(galerie[4], 1000, "Photo d'illustration 5")}</figure><figure>${img(galerie[5], 1000, "Photo d'illustration 6")}</figure></div>
  ${legende}
</section>
<section id="prestations" class="band prest">
  <h2>Prestations</h2>
  <p class="intro2">Chaque séance est préparée avec vous : le lieu, la lumière, le moment.</p>
  <div class="liste">${prestations.map((x) => `<div class="item"><h3>${e(x.titre)}</h3><p>${e(x.description)}</p><div class="bas">${tarif}<a href="#reserver" class="lien">Réserver</a></div></div>`).join("")}</div>
</section>`;
  } else if (m === 2) {
    // « Studio » (codes de Peter Hurley et Elena S Blair)
    corps = `<header><a class="logo" href="#">${e(c.nom)}</a>${nav}<a class="btn ghost" href="#reserver">${verbe}</a></header>
<!--principal-->
<section class="hero">
  <div class="hero-txt">
    <p class="sur">${e(c.metier)} · ${e(c.commune)}</p>
    <h1>${e(c.accroche)}</h1>
    <p class="lead">${e(c.intro)}</p>
    <div class="ctas"><a class="btn" href="#reserver">${verbe}</a><a class="btn ghost" href="#prestations">Les prestations</a></div>
  </div>
  <div class="mosaique">${[ph[0], galerie[0], galerie[1], galerie[2]].map((id, i) => `<figure>${img(id, 700, `Photo d'illustration ${i + 1}`)}</figure>`).join("")}</div>
</section>
<div id="prestations">${prestations.map((x, i) => `<section class="band prest${i % 2 ? " sombre" : ""}">
  <div class="p-txt"><p class="sur">Prestation ${String(i + 1).padStart(2, "0")}</p><h2>${e(x.titre)}</h2><p>${e(x.description)}</p>
    <div class="ctas"><a class="btn" href="#reserver">Réserver</a>${tarif}</div></div>
  <div class="p-photos"><figure>${img(galerie[(2 * i + 3) % galerie.length], 800, "Photo d'illustration")}</figure><figure>${img(galerie[(2 * i + 4) % galerie.length], 800, "Photo d'illustration")}</figure></div>
</section>`).join("")}</div>
<p class="legende band" style="padding-block:14px 0">Photos d'illustration : vos propres photos prendront leur place.</p>`;
  } else {
    // « Carnet » (codes de Corbin Gurkin)
    corps = `<div class="feuille">
<header><span class="mono">${e(initiales(c.nom))}</span><a class="logo" href="#">${e(c.nom)}</a>${nav}</header>
<!--principal-->
<section class="hero">
  <div class="cadre">${img(ph[0], 1400, `Photo d'illustration : ${c.metier}`)}</div>
  <h1>${e(c.accroche)}</h1>
  <span class="filet"></span>
  <p class="lead">${e(c.intro)}</p>
  <div class="trois"><a href="#prestations"><b>1</b>Prestations</a><a href="#galerie"><b>2</b>Portfolio</a><a href="#reserver"><b>3</b>Réserver</a></div>
</section>
<section id="prestations" class="band prest">
  <h2>Prestations</h2>
  <div class="cartes">${prestations.map((x) => `<div class="carte"><h3>${e(x.titre)}</h3><p>${e(x.description)}</p><div class="bas">${tarif}<a href="#reserver" class="lien">Réserver</a></div></div>`).join("")}</div>
</section>
<section id="galerie" class="band" style="padding-top:0">
  <h2>Portfolio</h2>
  <div class="grille">${galerie.map((id, i) => `<figure>${img(id, 700, `Photo d'illustration ${i + 1}`)}</figure>`).join("")}</div>
  ${legende}
</section>`;
  }

  const css = `
:root{--fond:${col.fond};--encre:${col.encre};--doux:${col.doux};--acc:${col.accent};--acct:${col.accentTexte};--carte:${col.carte};--ligne:${col.ligne};--pos:${posHero}}
*{box-sizing:border-box;min-width:0}html{scroll-behavior:smooth;scroll-padding-top:76px}
body{margin:0;background:var(--fond);color:var(--encre);font:17px/1.65 "${pol.texte}",system-ui,sans-serif;overflow-x:clip}
img{display:block;width:100%;height:100%;object-fit:cover}
figure{margin:0;overflow:hidden;background:var(--ligne)}
h1,h2,h3{font-family:"${pol.titre}",Georgia,serif;line-height:1.1;margin:0;text-wrap:balance;font-weight:500}
a{color:inherit}
header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px max(5vw,16px)}
.logo{font-family:"${pol.titre}",serif;font-size:24px;text-decoration:none}
nav{display:flex;gap:22px;flex-wrap:wrap}nav a{text-decoration:none;color:var(--doux);font-size:13px;letter-spacing:.14em;text-transform:uppercase}nav a:hover{color:var(--encre)}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 24px;border-radius:0;background:var(--acc);color:var(--acct);text-decoration:none;border:1px solid var(--acc);
  font:500 13px/1 "${pol.texte}",sans-serif;letter-spacing:.14em;text-transform:uppercase;cursor:pointer}
.btn.ghost{background:transparent;color:var(--encre);border-color:var(--encre)}
.band{padding:clamp(52px,7vw,108px) max(5vw,16px)}
.sur{margin:0 0 14px;color:var(--doux);font-size:12px;letter-spacing:.2em;text-transform:uppercase}
.lead{font-size:18px;color:var(--doux);max-width:34em;margin:18px 0 28px}
.ctas{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
h2{font-size:clamp(32px,4vw,50px);margin-bottom:14px}
.intro2{color:var(--doux);max-width:38em;margin:0 0 34px}
.todo{border:1px dashed currentColor;padding:3px 12px;font-size:13px;opacity:.8;white-space:nowrap}
.lien{text-decoration:underline;text-underline-offset:4px;font-size:13px;letter-spacing:.14em;text-transform:uppercase}
.legende{color:var(--doux);font-size:14px;margin-top:14px}
.bas{display:flex;justify-content:space-between;align-items:center;gap:12px}
.resa{display:grid;grid-template-columns:1fr minmax(0,420px);gap:clamp(28px,5vw,72px);align-items:center;background:var(--carte);border-block:1px solid var(--ligne)}
.resa p{color:var(--doux);max-width:34em}.etapes{padding-left:22px;margin:18px 0 0;display:grid;gap:6px}
.agenda{background:#fff;color:#1b1b1b;border-radius:14px;padding:22px;box-shadow:0 20px 50px rgba(0,0,0,.12);border:1px solid var(--ligne)}
.ag-tete{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.ag-tete span{font-size:12px;background:#eee;border-radius:99px;padding:3px 10px;color:#555}
.jours,.creneaux{display:grid;gap:8px;margin-bottom:12px}.jours{grid-template-columns:repeat(5,minmax(0,1fr))}.creneaux{grid-template-columns:repeat(auto-fit,minmax(78px,1fr))}
.jour,.cr{min-height:44px;border:1px solid #ddd;border-radius:8px;background:#fafafa;font:500 14px/1.1 "${pol.texte}",sans-serif;cursor:pointer;color:#222}
.jour.on,.cr.on{background:var(--acc);border-color:var(--acc);color:var(--acct)}
.btn.plein{width:100%;margin-top:4px}.agenda .note{font-size:13px;color:#777;margin:12px 0 0}
.apropos{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:clamp(28px,5vw,64px);align-items:center}
.apropos .portrait{max-width:420px;background:none}.apropos .portrait div{aspect-ratio:4/5;overflow:hidden;background:var(--ligne)}
.apropos .portrait figcaption{font-size:13px;color:var(--doux);margin-top:8px}
.zone{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}.zone span{border:1px solid var(--ligne);padding:5px 14px;font-size:14px;background:var(--carte)}
.contact{text-align:center}.contact p{color:var(--doux);max-width:36em;margin:0 auto}.contact .ctas{justify-content:center;margin-top:26px}
footer{padding:28px max(5vw,16px);color:var(--doux);font-size:13px;border-top:1px solid var(--ligne);display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
@media(prefers-reduced-motion:no-preference){h1,.lead,.hero-txt>*{animation:monte .9s cubic-bezier(.2,.7,.2,1) both}.lead{animation-delay:.12s}@keyframes monte{from{opacity:0;transform:translateY(14px)}}}
@media(max-width:820px){nav{display:none}.resa,.apropos{grid-template-columns:1fr}}
` + [
    "",
    // 1 Galerie
    `body{background:#fff}header{flex-direction:column;gap:10px;padding-top:26px}.logo{font-size:clamp(28px,3vw,36px);letter-spacing:.04em}
h1,h2{font-weight:400}
.hero-img{height:min(78vh,720px);background:var(--ligne)}.hero-img img{object-position:var(--pos)}
.intro{text-align:center}.intro h1{font-size:clamp(34px,4.2vw,56px);max-width:18em;margin:0 auto}.intro .lead{margin-inline:auto}.intro .ctas{justify-content:center}
.btn{background:var(--encre);border-color:var(--encre);color:#fff}
.galerie{display:grid;gap:12px;padding:0 12px}.galerie .large{aspect-ratio:16/7}.galerie .moyenne{aspect-ratio:16/9;width:min(100%,1100px);justify-self:center}
.paire{display:grid;grid-template-columns:1fr 1fr;gap:12px}.paire figure{aspect-ratio:4/5}.galerie .legende{text-align:center;margin-bottom:0}
.galerie img{object-position:50% 30%}
.prest{text-align:center}.prest .intro2{margin-inline:auto}
.liste{max-width:720px;margin:0 auto;border-top:1px solid var(--ligne)}
.item{padding:28px 0;border-bottom:1px solid var(--ligne);display:grid;gap:8px;justify-items:center}.item h3{font-size:30px;font-weight:400}.item p{margin:0;color:var(--doux);max-width:32em}
.item .bas{justify-content:center;gap:20px;margin-top:6px}
.resa{background:var(--fond)}
@media(max-width:820px){.galerie .large{aspect-ratio:4/3}}`,
    // 2 Studio
    `h1,h2,h3{font-weight:400;text-transform:uppercase;letter-spacing:.01em;line-height:.95}
.logo{text-transform:uppercase;font-size:30px;letter-spacing:.03em}
body{font-weight:400}
.hero{display:grid;grid-template-columns:1fr 1fr;gap:clamp(28px,5vw,80px);align-items:center;padding:clamp(28px,4vw,64px) max(5vw,16px) clamp(52px,6vw,96px)}
.hero h1{font-size:clamp(56px,7.5vw,112px)}
.sur{color:var(--acc);font-weight:600}
.mosaique{display:grid;grid-template-columns:1fr 1fr;gap:10px}.mosaique figure{aspect-ratio:4/5}.mosaique img{object-position:50% 30%}
.prest{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:clamp(28px,5vw,80px);align-items:center}
.prest h2{font-size:clamp(46px,5.5vw,80px)}.prest .p-txt>p:not(.sur){color:var(--doux);max-width:30em}
.prest .ctas{margin-top:24px}
.p-photos{display:grid;grid-template-columns:1fr 1fr;gap:10px}.p-photos figure{aspect-ratio:3/4}.p-photos img{object-position:50% 30%}
.prest.sombre{background:#111;color:#f4f1ec}.prest.sombre .p-txt>p:not(.sur){color:rgba(244,241,236,.72)}
.prest.sombre .p-txt{order:2}.prest.sombre .btn{background:#f4f1ec;color:#111;border-color:#f4f1ec}
@media(max-width:820px){.hero,.prest{grid-template-columns:1fr}.prest.sombre .p-txt{order:0}}`,
    // 3 Carnet
    `body{background:radial-gradient(circle at 20% 10%,color-mix(in srgb,var(--ligne) 70%,#fff),transparent 60%),color-mix(in srgb,var(--ligne) 80%,var(--fond));padding:clamp(16px,4vw,56px) 12px}
.feuille{max-width:980px;margin:0 auto;background:#fff;outline:1px solid var(--ligne);outline-offset:-16px;box-shadow:0 30px 80px rgba(0,0,0,.08);padding:clamp(20px,3vw,40px) 0}
header{flex-direction:column;gap:8px;padding-top:28px}
.mono{width:74px;height:74px;border-radius:50%;border:1px solid var(--doux);display:grid;place-items:center;font:italic 500 28px/1 "${pol.titre}",serif;color:var(--doux)}
.logo{font-size:15px;letter-spacing:.32em;text-transform:uppercase;font-family:"${pol.texte}",serif}
nav a{font-size:11px;letter-spacing:.24em}
.hero{text-align:center;padding:24px clamp(20px,6vw,72px) 12px}
.cadre{aspect-ratio:3/2;max-width:640px;margin:0 auto 34px;overflow:hidden;background:var(--ligne)}.cadre img{object-position:var(--pos)}
.hero h1{font-style:italic;font-weight:400;font-size:clamp(30px,3.6vw,46px);max-width:20em;margin:0 auto}
.filet{display:block;width:70px;height:1px;background:var(--doux);margin:22px auto}
.hero .lead{margin:0 auto;font-size:16px}
.trois{display:grid;grid-template-columns:repeat(3,1fr);max-width:560px;margin:40px auto 0;border-top:1px solid var(--ligne);padding-top:26px}
.trois a{text-decoration:none;font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--doux);display:grid;gap:6px;justify-items:center}
.trois a+a{border-left:1px solid var(--ligne)}.trois b{font:400 30px/1 "${pol.titre}",serif;color:var(--encre)}
h2{text-align:center;font-weight:400;font-size:clamp(30px,3.4vw,42px);margin-bottom:28px}
.band{padding-inline:clamp(20px,6vw,72px)}
.cartes{display:grid;grid-template-columns:1fr 1fr;gap:0}.carte{padding:26px;text-align:center;display:grid;gap:8px;border:1px solid var(--ligne);margin:-1px 0 0 -1px}
.carte h3{font-size:24px;font-style:italic;font-weight:400}.carte p{margin:0;color:var(--doux);font-size:15px}.carte .bas{justify-content:center;gap:18px}
.grille{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.grille figure{aspect-ratio:1}.grille img{object-position:50% 30%}.legende{text-align:center}
.btn{background:var(--encre);border-color:var(--encre);color:#fff}
.resa{background:#fff;border:0}.apropos .portrait div{border-radius:220px 220px 0 0}
footer{border:0;justify-content:center;text-align:center;letter-spacing:.14em;text-transform:uppercase;font-size:11px}
@media(max-width:820px){.cartes{grid-template-columns:1fr}.grille{grid-template-columns:1fr 1fr}}`,
  ][m];

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(c.nom)} · ${e(c.metier)} à ${e(c.commune)}</title>
<meta name="description" content="${e(c.intro)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=${pol.url}&display=swap" rel="stylesheet">
<style>${css}</style></head>
<body>
${corps}
${resa}
${apropos}
${contact}
${pied}${m === 3 ? "\n</div>" : ""}
</body></html>`;
}
