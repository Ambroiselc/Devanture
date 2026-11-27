// Mises en page des maquettes de coachs (27/11, demande de Broise : « inspire-toi des codes des coachs connus »).
// Chaque mise en page reprend les codes d'un site de coach connu, sans rien copier (ni texte, ni image, ni logo) :
//   0 « Dynamique » : Lucile Woodward (menu en pastille, titre en deux couleurs, repères en gros chiffres, cartes-photos).
//   1 « Douceur »   : Yoga with Adriene (crème, titres à empattements, texte à gauche / photo arrondie à droite, pied noir).
//   2 « Affirmé »   : Mel Robbins (haut de page sombre, photo à gauche, mots surlignés, grande phrase centrée).
//   3 « Méthode »   : Jeff Nippard / The Body Coach (grille éditoriale, étiquettes en police machine, trois colonnes, lignes numérotées).
// La palette (couleurs) se choisit à part ; les polices vont avec la mise en page.
// Même règle d'honnêteté que le reste : aucun chiffre, avis ou diplôme inventé ; les « repères » ne montrent que ce que
// dit la maquette (nombre de formules, de communes) et la réservation en ligne qu'on propose.
// Importé seulement par demo-independant.ts (types uniquement dans ce sens-là) : pas d'import circulaire à l'exécution.
import type { ContenuIndependant, Specialite } from "./demo-independant.ts";

export const MISES_EN_PAGE_COACH = ["Dynamique", "Douceur", "Affirmé", "Méthode"] as const;

/** Couleurs seulement (les polices dépendent de la mise en page). */
export const COULEURS_COACH = [
  { nom: "Forêt", fond: "#F2EFE7", encre: "#1C2420", doux: "#5E655F", accent: "#2E5B44", accentTexte: "#FFFFFF", carte: "#FBFAF6", ligne: "#DDD8CC" },
  { nom: "Terracotta", fond: "#F8F4EF", encre: "#2A2421", doux: "#6E645C", accent: "#C4643F", accentTexte: "#FFFFFF", carte: "#FFFFFF", ligne: "#EAE1D8" },
  { nom: "Bleu nuit", fond: "#F3F5F8", encre: "#16202B", doux: "#5A6573", accent: "#2F5E8C", accentTexte: "#FFFFFF", carte: "#FFFFFF", ligne: "#DCE2EA" },
  { nom: "Noir et or", fond: "#F4F3EE", encre: "#161616", doux: "#626058", accent: "#D9A916", accentTexte: "#161616", carte: "#FFFFFF", ligne: "#E2DFD5" },
] as const;

const POLICES = [
  { titre: "Hanken Grotesk", texte: "Hanken Grotesk", url: "Hanken+Grotesk:wght@400;500;600;700" },
  { titre: "Fraunces", texte: "Inter", url: "Fraunces:opsz,wght@9..144,400;9..144,500&family=Inter:wght@400;500;600" },
  { titre: "Sora", texte: "Inter", url: "Sora:wght@500;600;700&family=Inter:wght@400;500;600" },
  { titre: "Inter Tight", texte: "Inter", url: "Inter+Tight:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500" },
] as const;

export interface DonneesCoach {
  c: ContenuIndependant;
  spe: Specialite;
  /** Photos de la spécialité : [0] haut de page, dernière = portrait. */
  ph: string[];
  m: number;
  p: number;
  metierAffiche: string;
  jours: string[];
  creneaux: string[];
}

function e(texte: string | null | undefined): string {
  return String(texte ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const photo = (id: string, w: number) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=70`;
const img = (id: string | undefined, w: number, alt: string) =>
  id ? `<img src="${photo(id, w)}" alt="${e(alt)}" loading="lazy" onerror="this.remove()">` : "";
const telHref = (t: string) => `tel:${t.replace(/[^\d+]/g, "")}`;

/** Les derniers mots de l'accroche, mis en valeur (couleur ou surligné) selon la mise en page. */
function accrocheEnDeux(accroche: string): [string, string] {
  const mots = accroche.trim().split(/\s+/);
  if (mots.length < 4) return [accroche, ""];
  const n = Math.max(2, Math.round(mots.length / 3));
  return [mots.slice(0, -n).join(" "), mots.slice(-n).join(" ")];
}

export function renderCoach(d: DonneesCoach): string {
  const { c, spe, ph } = d;
  const m = ((d.m % 4) + 4) % 4;
  const col = COULEURS_COACH[((d.p % 4) + 4) % 4];
  const pol = POLICES[m];
  const mental = spe === "mental";
  const prestations = c.prestations.slice(0, 4);
  const motFormules = mental ? "Accompagnements" : "Formules";
  const titreFormules = mental ? "Les accompagnements" : "Les formules";
  const introFormules = mental
    ? "Un accompagnement adapté à votre situation et à vos objectifs, à votre rythme."
    : "Des séances adaptées à votre niveau et à votre objectif, au rythme qui vous convient.";
  const verbe = "Réserver un créneau";
  const [debut, fin] = accrocheEnDeux(c.accroche);
  const sur = `${e(d.metierAffiche)} · ${e(c.commune)}`;
  const posHero = spe === "fitness" ? "50% 72%" : "50% 35%";
  const annee = new Date().getFullYear();
  const galerie = ph.slice(1, 5);
  const portrait = ph[ph.length - 1];

  const agenda = `<div class="agenda" aria-label="Exemple de réservation en ligne">
    <div class="ag-tete"><b>${e(prestations[0]?.titre ?? "Séance")}</b><span>Exemple</span></div>
    <div class="jours">${d.jours.map((j, i) => `<button type="button" class="jour${i === 1 ? " on" : ""}">${j}</button>`).join("")}</div>
    <div class="creneaux">${d.creneaux.map((h, i) => `<button type="button" class="cr${i === 1 ? " on" : ""}">${h}</button>`).join("")}</div>
    <button type="button" class="btn plein">Confirmer la réservation</button>
    <p class="note">Créneaux d'exemple : vos vraies disponibilités s'afficheront ici.</p>
  </div>`;
  const resa = `<section id="reserver" class="band resa">
  <div class="resa-txt">
    ${m === 3 ? `<p class="lab">// Réservation</p>` : m === 0 || m === 2 ? `<p class="sur">Réservation en ligne</p>` : ""}
    <h2>Réservez votre séance en ligne</h2>
    <p>Vos clients choisissent leur créneau en deux clics, même à 23 h, et reçoivent un rappel la veille.</p>
    <ol class="etapes"><li>Choisir ${mental ? "l'accompagnement" : "la formule"}</li><li>Choisir le créneau</li><li>Confirmer, c'est réservé</li></ol>
  </div>
  ${agenda}
</section>`;
  const contactBoutons = [
    c.telephone ? `<a class="btn ghost" href="${telHref(c.telephone)}">Appeler · ${e(c.telephone)}</a>` : "",
    c.email ? `<a class="btn ghost" href="mailto:${e(c.email)}">${e(c.email)}</a>` : "",
  ].join("");
  const zone = `<div class="zone">${c.zone.map((z) => `<span>${e(z)}</span>`).join("")}</div>`;
  const apropos = `<section id="apropos" class="band apropos">
  <figure class="portrait"><div>${img(portrait, 800, "Photo d'illustration")}</div><figcaption>Photo d'illustration : votre portrait prendra sa place.</figcaption></figure>
  <div>${m === 3 ? `<p class="lab">// À propos</p>` : m === 0 || m === 2 ? `<p class="sur">À propos</p>` : ""}<h2>${m === 1 ? "Qui suis-je ?" : "À propos"}</h2><p>${e(c.apropos)}</p>${zone}</div>
</section>`;
  const contact = `<!--contact-->
<section id="contact" class="band contact">
  <h2>${mental ? "On en parle ?" : "Prêt à commencer ?"}</h2>
  <p>${mental ? "Réservez un premier échange en ligne, ou contactez-moi pour en parler." : "Réservez votre première séance en ligne, ou contactez-moi pour en parler."}</p>
  <div class="ctas"><a class="btn" href="#reserver">${verbe}</a>${contactBoutons}</div>
</section>`;
  const pied = `<footer><span>© ${annee} ${e(c.nom)} · ${e(d.metierAffiche)} à ${e(c.commune)}</span><span>Mentions légales</span></footer>`;
  const legende = `<p class="legende">Photos d'illustration : vos propres photos prendront leur place.</p>`;
  const nav = (avecGalerie: boolean) => `<nav><a href="#prestations">${motFormules}</a>${avecGalerie ? `<a href="#galerie">En images</a>` : ""}<a href="#reserver">Réserver</a><a href="#apropos">À propos</a><a href="#contact">Contact</a></nav>`;
  const tarif = `<span class="todo">Votre tarif</span>`;

  let header = "";
  let corps = "";
  if (m === 0) {
    // « Dynamique » (codes de Lucile Woodward)
    header = `<header><a class="logo" href="#">${e(c.nom)}</a>${nav(false)}<a class="btn" href="#reserver">${verbe}</a></header>`;
    const reperes = [
      [String(prestations.length), mental ? "accompagnements au choix" : "formules au choix"],
      c.zone.length > 1 ? [String(c.zone.length), "communes où j'interviens"] : [e(c.commune), "et alentours"],
      ["24 h/24", "réservation en ligne"],
    ];
    corps = `<section class="hero">
  <div class="hero-txt">
    <p class="sur trait">${sur}</p>
    <h1>${e(debut)} ${fin ? `<span class="acc">${e(fin)}</span>` : ""}</h1>
    <p class="lead">${e(c.intro)}</p>
    <div class="ctas"><a class="btn" href="#reserver">${verbe}</a><a class="btn ghost" href="#prestations">Voir les ${motFormules.toLowerCase()}</a></div>
  </div>
  <div class="cadre"><div class="photo">${img(ph[0], 1100, `Photo d'illustration : ${c.metier}`)}</div></div>
</section>
<section class="reperes">${reperes.map(([n, t]) => `<div><b>${n}</b><span>${t}</span></div>`).join("")}</section>
<section id="prestations" class="band">
  <p class="sur">${motFormules}</p>
  <h2>${mental ? "Avancer à votre rythme," : "Tout pour progresser,"} <span class="acc">${mental ? "avec un cadre clair" : "au même endroit"}</span></h2>
  <p class="intro2">${introFormules}</p>
  <div class="fcartes">${prestations.map((x, i) => `<article class="fcarte">${img(galerie[i % Math.max(1, galerie.length)], 900, "Photo d'illustration")}
    <div class="fc-txt">${tarif}<h3>${e(x.titre)}</h3><p>${e(x.description)}</p><a href="#reserver" class="lien">Réserver →</a></div></article>`).join("")}</div>
  ${legende}
</section>`;
  } else if (m === 1) {
    // « Douceur » (codes de Yoga with Adriene)
    header = `<header><a class="logo" href="#">${e(c.nom)}</a>${nav(true)}<a class="btn" href="#reserver">${verbe}</a></header>`;
    corps = `<section class="hero band">
  <div class="hero-txt">
    <p class="sur">${sur}</p>
    <h1>${e(c.accroche)}</h1>
    <p class="lead">${e(c.intro)}</p>
    <div class="ctas"><a class="btn" href="#reserver">${verbe}</a></div>
  </div>
  <div class="photo">${img(ph[0], 1100, `Photo d'illustration : ${c.metier}`)}</div>
</section>
<section id="prestations" class="band deux">
  <div class="colle"><h2>${titreFormules}</h2><p class="intro2">${introFormules}</p></div>
  <div class="liste">${prestations.map((x) => `<div class="item"><h3>${e(x.titre)}</h3><p>${e(x.description)}</p><div class="bas">${tarif}<a href="#reserver" class="lien">Réserver</a></div></div>`).join("")}</div>
</section>
<section id="galerie" class="band" style="padding-top:0">
  <h2>En images</h2>
  <div class="trois">${galerie.slice(0, 3).map((id, i) => `<figure>${img(id, 800, `Photo d'illustration ${i + 1}`)}</figure>`).join("")}</div>
  ${legende}
</section>`;
  } else if (m === 2) {
    // « Affirmé » (codes de Mel Robbins)
    header = `<header><a class="logo" href="#">${e(c.nom)}</a>${nav(true)}<a class="btn" href="#reserver">${verbe}</a></header>`;
    corps = `<section class="hero">
  <div class="photo">${img(ph[0], 1200, `Photo d'illustration : ${c.metier}`)}</div>
  <div class="hero-txt">
    <p class="sur">${sur}</p>
    <h1>${e(debut)} ${fin ? `<mark>${e(fin)}</mark>` : ""}</h1>
    <div class="ctas"><a class="btn" href="#reserver">${verbe}</a><a class="btn ghost" href="#prestations">${motFormules}</a></div>
  </div>
</section>
<section class="phrase"><p>${e(c.intro)}</p></section>
<section id="prestations" class="band">
  <p class="sur">${motFormules}</p>
  <h2>${titreFormules}</h2>
  <div class="ncartes">${prestations.map((x, i) => `<article class="ncarte"><span class="n">${String(i + 1).padStart(2, "0")}</span><h3>${e(x.titre)}</h3><p>${e(x.description)}</p><div class="bas">${tarif}<a href="#reserver" class="lien">Réserver →</a></div></article>`).join("")}</div>
</section>
<section id="galerie" class="band" style="padding-top:0">
  <p class="sur">En images</p>
  <div class="rangee">${galerie.map((id, i) => `<figure>${img(id, 700, `Photo d'illustration ${i + 1}`)}</figure>`).join("")}</div>
  ${legende}
</section>`;
  } else {
    // « Méthode » (codes de Jeff Nippard et The Body Coach)
    header = `<header><a class="logo" href="#">${e(c.nom)}</a>${nav(true)}<a class="btn" href="#reserver">${verbe}</a></header>`;
    const trio = [
      ["Votre objectif", e(c.intro)],
      ["Où", e(c.zone.length ? c.zone.join(", ") : c.commune)],
      ["Réservation", "En ligne, 24 h/24, avec un rappel la veille de la séance."],
    ];
    corps = `<section class="hero">
  <div class="gauche">
    <div class="petite">${img(galerie[0], 600, "Photo d'illustration")}</div>
    <p>${e(c.intro)}</p>
    <a class="btn" href="#reserver">${verbe}</a>
  </div>
  <div class="droite">
    <div class="grande">${img(ph[0], 1600, `Photo d'illustration : ${c.metier}`)}</div>
    <p class="lab">// ${sur}</p>
    <h1>${e(c.accroche)}</h1>
    <div class="trio">${trio.map(([t, x]) => `<div><h3>${t}</h3><p>${x}</p></div>`).join("")}</div>
  </div>
</section>
<hr class="regle">
<section id="prestations" class="band">
  <p class="lab">// ${motFormules}</p>
  <h2>${titreFormules}</h2>
  <p class="intro2">${introFormules}</p>
  <div class="lignes">${prestations.map((x, i) => `<div class="ligne"><span class="n">${String(i + 1).padStart(2, "0")}</span><h3>${e(x.titre)}</h3><p>${e(x.description)}</p>${tarif}<a href="#reserver" class="lien">Réserver</a></div>`).join("")}</div>
</section>
<section id="galerie" class="band" style="padding-top:0">
  <p class="lab">// En images</p>
  <div class="cadres">${galerie.slice(1).map((id, i) => `<figure><div>${img(id, 700, `Photo d'illustration ${i + 1}`)}</div><figcaption>Exemple ${i + 1}</figcaption></figure>`).join("")}</div>
  ${legende}
</section>`;
  }

  const rayon = [26, 22, 14, 8][m];
  const css = `
:root{--fond:${col.fond};--encre:${col.encre};--doux:${col.doux};--acc:${col.accent};--acct:${col.accentTexte};--carte:${col.carte};--ligne:${col.ligne};--r:${rayon}px;--pos:${posHero}}
*{box-sizing:border-box;min-width:0}html{scroll-behavior:smooth;scroll-padding-top:76px}
body{margin:0;background:var(--fond);color:var(--encre);font:17px/1.6 "${pol.texte}",system-ui,sans-serif;overflow-x:clip}
img{display:block;width:100%;height:100%;object-fit:cover}
h1,h2,h3{font-family:"${pol.titre}",system-ui,sans-serif;line-height:1.08;margin:0;text-wrap:balance}
a{color:inherit}
header{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px max(5vw,16px);background:color-mix(in srgb,var(--fond) 90%,transparent);backdrop-filter:blur(10px)}
.logo{font-family:"${pol.titre}",sans-serif;font-size:21px;font-weight:700;text-decoration:none}
nav{display:flex;gap:6px;flex-wrap:wrap}nav a{text-decoration:none;color:var(--doux);font-size:15px;padding:8px 12px;border-radius:99px}nav a:hover{color:var(--encre)}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 22px;border-radius:99px;background:var(--acc);color:var(--acct);text-decoration:none;border:1.5px solid var(--acc);font:600 16px/1 "${pol.texte}",sans-serif;cursor:pointer}
.btn.ghost{background:transparent;color:var(--encre);border-color:var(--encre)}
.band{padding:clamp(52px,7vw,108px) max(5vw,16px)}
.sur{margin:0 0 14px;color:var(--acc);font-size:13px;font-weight:600;letter-spacing:.16em;text-transform:uppercase}
.lead{font-size:19px;color:var(--doux);max-width:32em;margin:20px 0 30px}
.ctas{display:flex;gap:12px;flex-wrap:wrap}
h2{font-size:clamp(32px,4vw,52px);margin-bottom:14px;letter-spacing:-.015em}
.intro2{color:var(--doux);max-width:38em;margin:0 0 36px}
.todo{border:1.5px dashed currentColor;border-radius:99px;padding:3px 12px;font-size:13px;opacity:.85;white-space:nowrap}
.lien{font-weight:600;text-decoration:none;color:var(--acc)}
.legende{color:var(--doux);font-size:14px;margin-top:14px}
.bas{display:flex;justify-content:space-between;align-items:center;gap:10px}
.resa{display:grid;grid-template-columns:1fr minmax(0,420px);gap:clamp(28px,5vw,72px);align-items:center;background:var(--carte);border-block:1px solid var(--ligne)}
.resa p{color:var(--doux);max-width:34em}.resa .sur,.resa .lab{color:var(--acc)}
.etapes{padding-left:22px;margin:18px 0 0;display:grid;gap:6px}
.agenda{background:#fff;color:#1b1b1b;border-radius:min(var(--r),20px);padding:22px;box-shadow:0 20px 50px rgba(0,0,0,.14);border:1px solid var(--ligne)}
.ag-tete{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.ag-tete span{font-size:12px;background:#eee;border-radius:99px;padding:3px 10px;color:#555}
.jours,.creneaux{display:grid;gap:8px;margin-bottom:12px}.jours{grid-template-columns:repeat(5,minmax(0,1fr))}.creneaux{grid-template-columns:repeat(auto-fit,minmax(78px,1fr))}
.jour,.cr{min-height:44px;border:1px solid #ddd;border-radius:10px;background:#fafafa;font:600 14px/1.1 "${pol.texte}",sans-serif;cursor:pointer;color:#222}
.jour.on,.cr.on{background:var(--acc);border-color:var(--acc);color:var(--acct)}
.btn.plein{width:100%;margin-top:4px}.agenda .note{font-size:13px;color:#777;margin:12px 0 0}
.apropos{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:clamp(28px,5vw,64px);align-items:center}
.apropos .portrait{margin:0;max-width:420px}.apropos .portrait div{aspect-ratio:4/5;border-radius:var(--r);overflow:hidden;background:var(--ligne)}
.apropos .portrait figcaption{font-size:13px;color:var(--doux);margin-top:8px}
.zone{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}.zone span{border:1px solid var(--ligne);border-radius:99px;padding:5px 14px;font-size:14px;background:var(--carte)}
.contact{text-align:center}.contact p{color:var(--doux);max-width:36em;margin:0 auto}.contact .ctas{justify-content:center;margin-top:26px}
footer{padding:28px max(5vw,16px);color:var(--doux);font-size:14px;border-top:1px solid var(--ligne);display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
@media(prefers-reduced-motion:no-preference){.hero-txt>*,.droite>*{animation:monte .8s cubic-bezier(.2,.7,.2,1) both}.hero-txt>*:nth-child(2),.droite>*:nth-child(2){animation-delay:.1s}
  .hero-txt>*:nth-child(3),.droite>*:nth-child(3){animation-delay:.2s}.hero-txt>*:nth-child(4),.droite>*:nth-child(4){animation-delay:.3s}@keyframes monte{from{opacity:0;transform:translateY(16px)}}}
@media(max-width:820px){nav{display:none}.resa,.apropos{grid-template-columns:1fr}}
` + [
    // 0 Dynamique
    `nav{background:var(--carte);border:1px solid var(--ligne);border-radius:99px;padding:4px}
h1,h2{font-weight:700;letter-spacing:-.025em}.acc{color:var(--acc)}
.hero{display:grid;grid-template-columns:1.05fr .95fr;gap:clamp(28px,5vw,80px);align-items:center;padding:clamp(36px,5vw,80px) max(5vw,16px) clamp(48px,6vw,96px)}
.hero h1{font-size:clamp(42px,5.4vw,74px)}
.sur.trait{display:flex;align-items:center;gap:14px}.sur.trait::after{content:"";width:48px;height:1.5px;background:currentColor;opacity:.5}
.cadre{position:relative;justify-self:center;width:min(100%,460px)}
.cadre::before{content:"";position:absolute;width:62%;aspect-ratio:1;border-radius:50%;background:var(--acc);right:-14%;top:-8%;opacity:.9}
.cadre::after{content:"";position:absolute;width:30%;aspect-ratio:1;border-radius:50%;background:var(--encre);left:-10%;bottom:-6%;opacity:.12}
.cadre .photo{position:relative;z-index:1;aspect-ratio:4/5;border-radius:34px;overflow:hidden;background:var(--ligne);box-shadow:0 30px 60px rgba(0,0,0,.18)}
.cadre img{object-position:var(--pos)}
.reperes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;padding:clamp(32px,4vw,56px) max(5vw,16px);background:var(--carte);border-block:1px solid var(--ligne);text-align:center}
.reperes b{display:block;font:700 clamp(36px,5vw,64px)/1 "${pol.titre}",sans-serif;letter-spacing:-.03em}.reperes span{color:var(--doux);font-size:15px}
.fcartes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
.fcarte{position:relative;min-height:clamp(280px,26vw,360px);border-radius:var(--r);overflow:hidden;background:var(--encre);color:#fff;display:flex;align-items:flex-end}
.fcarte img{position:absolute;inset:0;object-position:50% 35%;transition:transform .8s ease}.fcarte:hover img{transform:scale(1.05)}
.fcarte::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.05) 25%,rgba(0,0,0,.72))}
.fc-txt{position:relative;z-index:1;padding:26px;display:grid;gap:8px;justify-items:start}.fc-txt h3{font-size:28px}.fc-txt p{margin:0;opacity:.88;max-width:30em}
.fcarte .lien{color:#fff;text-decoration:underline;text-underline-offset:4px}.fcarte .todo{color:#fff}
@media(max-width:820px){.hero{grid-template-columns:1fr}.cadre{width:min(86%,420px)}.fcartes{grid-template-columns:1fr}.reperes{grid-template-columns:1fr}}`,
    // 1 Douceur
    `h1,h2,h3{font-weight:400;letter-spacing:-.01em}.btn{background:var(--encre);border-color:var(--encre);color:var(--fond)}.btn.ghost{background:transparent;color:var(--encre)}
.jour.on,.cr.on{background:var(--encre);border-color:var(--encre);color:var(--fond)}
.sur{color:var(--doux);letter-spacing:.06em;text-transform:none;font-weight:500;font-size:15px}
.hero{display:grid;grid-template-columns:1fr 1fr;gap:clamp(28px,6vw,96px);align-items:center}
.hero h1{font-size:clamp(44px,5.6vw,80px)}
.hero .photo{aspect-ratio:5/6;border-radius:var(--r);overflow:hidden;background:var(--ligne)}.hero .photo img{object-position:var(--pos)}
.deux{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:clamp(28px,6vw,96px);border-top:1px solid var(--ligne)}
.colle{align-self:start;position:sticky;top:96px}
.item{padding:26px 0;border-bottom:1px solid var(--ligne);display:grid;gap:8px}.item:first-child{padding-top:0}
.item h3{font-size:30px}.item p{margin:0;color:var(--doux)}.item .bas{justify-content:flex-start;gap:18px;margin-top:6px}.item .lien{color:var(--encre);text-decoration:underline;text-underline-offset:4px}
.trois{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.trois figure{margin:0;aspect-ratio:3/4;border-radius:var(--r);overflow:hidden;background:var(--ligne)}
footer{background:#121110;color:#cfcac2;border:0;padding-block:40px}
@media(max-width:820px){.hero,.deux{grid-template-columns:1fr}.colle{position:static}.trois{grid-template-columns:1fr 1fr}.trois figure:last-child{display:none}}`,
    // 2 Affirmé
    `h1,h2{font-weight:600;letter-spacing:-.02em}
header{background:var(--encre);color:var(--fond)}header nav a{color:color-mix(in srgb,var(--fond) 70%,transparent)}header nav a:hover{color:var(--fond)}
.logo{text-transform:uppercase;letter-spacing:.08em;font-size:17px}
.hero{display:grid;grid-template-columns:.95fr 1.05fr;background:var(--encre);color:var(--fond);min-height:min(86vh,720px)}
.hero .photo{background:#000}.hero .photo img{object-position:var(--pos)}
.hero-txt{align-self:center;padding:clamp(32px,6vw,96px) max(5vw,16px)}
.hero h1{font-size:clamp(42px,5.2vw,76px)}
mark{background:var(--acc);color:var(--acct);padding:0 .16em;border-radius:6px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.hero .sur{color:color-mix(in srgb,var(--fond) 70%,transparent)}.hero .ctas{margin-top:34px}.hero .btn.ghost{color:var(--fond);border-color:var(--fond)}
.phrase{background:var(--encre);color:var(--fond);text-align:center;padding:clamp(48px,6vw,88px) max(5vw,16px);border-top:1px solid color-mix(in srgb,var(--fond) 14%,transparent)}
.phrase p{margin:0 auto;max-width:24em;font:600 clamp(24px,3vw,38px)/1.25 "${pol.titre}",sans-serif;letter-spacing:-.01em}
.ncartes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-top:28px}
.ncarte{background:var(--carte);border:1px solid var(--ligne);border-radius:var(--r);padding:28px;display:grid;gap:10px;align-content:start}
.ncarte .n{font:700 46px/1 "${pol.titre}",sans-serif;color:var(--acc)}.ncarte h3{font-size:24px}.ncarte p{margin:0;color:var(--doux)}.ncarte .bas{margin-top:8px;padding-top:14px;border-top:1px solid var(--ligne)}
.rangee{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.rangee figure{margin:0;aspect-ratio:4/3;border-radius:var(--r);overflow:hidden;background:var(--ligne)}
.contact{background:var(--acc);color:var(--acct)}.contact p{color:inherit;opacity:.85}.contact .btn{background:var(--acct);color:var(--acc);border-color:var(--acct)}.contact .btn.ghost{background:transparent;color:var(--acct)}
@media(max-width:820px){.hero{grid-template-columns:1fr;min-height:0}.hero .photo{height:52vh}.ncartes{grid-template-columns:1fr}.rangee{grid-template-columns:1fr 1fr}}`,
    // 3 Méthode
    `h1,h2,h3{font-weight:600;letter-spacing:-.025em}
.lab,.ag-tete span,.todo{font-family:"JetBrains Mono",ui-monospace,monospace;letter-spacing:.02em}
.lab{margin:0 0 12px;font-size:12px;text-transform:uppercase;color:var(--doux)}
.btn{border-radius:6px;font:500 13px/1 "JetBrains Mono",ui-monospace,monospace;text-transform:uppercase;letter-spacing:.04em;min-height:44px;background:var(--encre);border-color:var(--encre);color:var(--fond)}
.btn.ghost{background:transparent;color:var(--encre)}.jour.on,.cr.on{background:var(--encre);border-color:var(--encre);color:var(--fond)}
header nav{background:var(--encre);border-radius:10px;padding:4px}header nav a{color:color-mix(in srgb,var(--fond) 78%,transparent);font-size:14px;border-radius:7px}header nav a:hover{color:var(--fond)}
.hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,3fr);gap:14px;padding:14px max(2vw,12px) clamp(36px,4vw,64px)}
.gauche{display:grid;gap:16px;align-content:start}.gauche .petite{aspect-ratio:3/4;border-radius:var(--r);overflow:hidden;background:var(--ligne)}.gauche p{margin:0;font-size:15px;color:var(--doux)}.gauche .btn{justify-self:start}
.grande{height:min(62vh,560px);border-radius:var(--r);overflow:hidden;background:var(--ligne)}.grande img{object-position:var(--pos)}
.droite .lab{margin-top:26px}.droite h1{font-size:clamp(38px,4.6vw,66px);max-width:16em}
.trio{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;margin-top:34px}.trio div{border-top:1.5px solid var(--encre);padding-top:14px}
.trio h3{font-size:17px;margin-bottom:6px}.trio p{margin:0;font-size:15px;color:var(--doux)}
.regle{border:0;border-top:1px solid var(--ligne);margin:0 max(2vw,12px)}
.lignes{border-top:1.5px solid var(--encre)}
.ligne{display:grid;grid-template-columns:56px minmax(0,1fr) minmax(0,1.5fr) auto auto;gap:12px 26px;align-items:center;padding:22px 0;border-bottom:1px solid var(--ligne)}
.ligne .n{font:500 14px/1 "JetBrains Mono",ui-monospace,monospace;color:var(--doux)}.ligne h3{font-size:22px}.ligne p{margin:0;color:var(--doux)}.ligne .lien{color:var(--encre);text-decoration:underline;text-underline-offset:4px}
.cadres{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(220px,1fr);gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:6px}
.cadres figure{margin:0;background:var(--carte);border-radius:12px;padding:10px;scroll-snap-align:start;border:1px solid var(--ligne)}
.cadres figure div{aspect-ratio:4/5;border-radius:6px;overflow:hidden;background:var(--ligne)}.cadres figcaption{font:500 12px/1 "JetBrains Mono",monospace;color:var(--doux);margin:10px 2px 2px;text-transform:uppercase}
@media(max-width:820px){.hero{grid-template-columns:1fr}.gauche{order:2}.gauche .petite{display:none}.grande{height:46vh}.trio{grid-template-columns:1fr}
  .ligne{grid-template-columns:40px 1fr auto}.ligne p{grid-column:2/-1}.ligne .todo{grid-column:2}.cadres{grid-auto-columns:72%}}`,
  ][m];

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(c.nom)} · ${e(d.metierAffiche)} à ${e(c.commune)}</title>
<meta name="description" content="${e(c.intro)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=${pol.url}&display=swap" rel="stylesheet">
<style>${css}</style></head>
<body>
${header}
<!--principal-->
${corps}
${resa}
${apropos}
${contact}
${pied}
</body></html>`;
}
