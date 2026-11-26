// Modèle de maquette « indépendant » (26/11, nouvelle cible choisie par Broise : photographes et coachs sportifs).
// Ces métiers ont déjà un site, mais sans réservation en ligne ni tarifs : la maquette montre surtout ces deux manques
// comblés (bloc « Réserver en ligne » avec des créneaux d'exemple, prestations avec un emplacement de tarif).
// Même règle d'honnêteté que les maquettes d'artisans : aucune info inventée (pas de prix, d'avis, de diplôme,
// d'ancienneté). Ce qu'on ne sait pas s'affiche « à compléter » ; les créneaux et les photos sont marqués « exemple ».
// Ce fichier est lu par l'agent des maquettes ET par le tableau de bord : il n'importe rien.

export type MetierIndependant = "Photographe" | "Coach sportif";

export interface ContenuIndependant {
  modele: "independant";
  nom: string;
  metier: MetierIndependant;
  commune: string;
  /** Phrase d'accroche du haut de page. */
  accroche: string;
  intro: string;
  prestations: { titre: string; description: string }[];
  apropos: string;
  zone: string[];
  telephone?: string | null;
  email?: string | null;
  /** Palette (0 ou 1), pour que deux voisins n'aient pas le même site. */
  palette?: number;
}

/** Photos d'illustration (Unsplash, licence libre). Si une photo ne charge pas, elle s'efface (onerror). */
const PHOTOS: Record<MetierIndependant, string[]> = {
  "Photographe": [
    "1519741497674-611481863552", "1622277430358-f4d134452e2e", "1769540209420-f137f98194e8",
    "1757647630063-dd5cd82271f3", "1758810409996-583f3bad7d51", "1617724975854-70b5d0cedb0a", "1630526720753-aa4e71acf67d", "1519741196428-6a2175fa2557",
  ],
  // 26/11 (avis de Broise : la 1re version « faisait généré par IA ») : photos en extérieur, plus naturelles.
  "Coach sportif": [
    "1775850576250-d4296a7af153", "1759476532444-fa17a7131941", "1600026453194-11ae289732b8",
    "1542354771-435b9f200e57", "1759300642211-4e81a270a358", "1759300642338-c5c7cd576a22",
  ],
};

const photo = (id: string, w: number) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=70`;
const img = (id: string, w: number, alt: string, cls = "") =>
  `<img class="${cls}" src="${photo(id, w)}" alt="${e(alt)}" loading="lazy" onerror="this.remove()">`;

const PALETTES: Record<MetierIndependant, { fond: string; encre: string; doux: string; accent: string; accentTexte: string; carte: string; ligne: string; titre: string; texte: string; url: string }[]> = {
  // Photographe : calme, beaucoup d'air, la photo d'abord.
  "Photographe": [
    { fond: "#FBF8F3", encre: "#1E1B18", doux: "#6E655C", accent: "#1E1B18", accentTexte: "#FBF8F3", carte: "#FFFFFF", ligne: "#E7E0D6",
      titre: "Cormorant Garamond", texte: "Jost", url: "Cormorant+Garamond:wght@500;600&family=Jost:wght@400;500;600" },
    { fond: "#F4F6F5", encre: "#1B2A2A", doux: "#5D6B6A", accent: "#2F5D56", accentTexte: "#FFFFFF", carte: "#FFFFFF", ligne: "#DCE3E1",
      titre: "Playfair Display", texte: "Karla", url: "Playfair+Display:wght@500;600&family=Karla:wght@400;600" },
  ],
  // Coach : énergique, contrasté, gros titres.
  "Coach sportif": [
    { fond: "#F2EFE7", encre: "#1C2420", doux: "#5E655F", accent: "#2E5B44", accentTexte: "#FFFFFF", carte: "#FBFAF6", ligne: "#DDD8CC",
      titre: "Schibsted Grotesk", texte: "Source Sans 3", url: "Schibsted+Grotesk:wght@600;700&family=Source+Sans+3:wght@400;600" },
    { fond: "#F5F3EF", encre: "#22201E", doux: "#66605A", accent: "#7A3E2B", accentTexte: "#FFFFFF", carte: "#FFFFFF", ligne: "#E2DDD5",
      titre: "Libre Franklin", texte: "Libre Franklin", url: "Libre+Franklin:wght@400;600;700" },
  ],
};

function e(texte: string | null | undefined): string {
  return String(texte ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const telHref = (t: string) => `tel:${t.replace(/[^\d+]/g, "")}`;

/** Les 5 prochains jours ouvrés, pour le bloc de réservation d'exemple. */
function prochainsJours(): string[] {
  const noms = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
  const jours: string[] = [];
  const d = new Date();
  while (jours.length < 5) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0) continue;
    jours.push(`${noms[d.getDay()]} ${d.getDate()}`);
  }
  return jours;
}

export function renderIndependant(c: ContenuIndependant): string {
  const photographe = c.metier === "Photographe";
  const pal = PALETTES[c.metier][(c.palette ?? 0) % 2];
  const ph = PHOTOS[c.metier];
  const prestations = c.prestations.slice(0, 4);
  const jours = prochainsJours();
  const creneaux = photographe ? ["10:00", "14:00", "16:30"] : ["07:30", "12:15", "18:00", "19:15"];
  const verbe = photographe ? "Réserver une séance" : "Réserver un créneau";
  const annee = new Date().getFullYear();

  const hero = photographe
    ? `<section class="hero hero-photo">
  <div class="hero-img">${img(ph[0], 1800, `Photo d'illustration : ${c.metier}`)}</div>
  <div class="hero-txt">
    <p class="sur">${e(c.metier)} · ${e(c.commune)}</p>
    <h1>${e(c.accroche)}</h1>
    <p class="lead">${e(c.intro)}</p>
    <div class="ctas"><a class="btn" href="#reserver">${verbe}</a><a class="btn ghost" href="#galerie">Voir des photos</a></div>
  </div>
</section>`
    : `<section class="hero hero-coach">
  <div class="hero-img">${img(ph[0], 1800, `Photo d'illustration : ${c.metier}`)}</div>
  <div class="hero-txt">
    <div><p class="sur">${e(c.metier)} · ${e(c.commune)}</p><h1>${e(c.accroche)}</h1></div>
    <div><p class="lead">${e(c.intro)}</p>
    <div class="ctas"><a class="btn" href="#reserver">${verbe}</a><a class="btn ghost" href="#prestations">Voir les séances</a></div></div>
  </div>
</section>`;

  const cartes = photographe ? prestations.map((p) => `<article class="carte">
    <h3>${e(p.titre)}</h3>
    <p>${e(p.description)}</p>
    <div class="bas"><span class="todo">Votre tarif</span><a href="#reserver" class="lien">Réserver →</a></div>
  </article>`).join("")
    : prestations.map((p) => `<div class="ligne-p"><h3>${e(p.titre)}</h3><p>${e(p.description)}</p>
    <span class="todo">Votre tarif</span><a href="#reserver" class="lien">Réserver</a></div>`).join("");

  const galerie = (photographe ? ph.slice(1, 7) : ph.slice(1, 4))
    .map((id, i) => `<figure class="g g${i}">${img(id, 900, `Photo d'illustration ${i + 1}`)}</figure>`).join("");

  const resa = `<section id="reserver" class="band resa">
  <div class="resa-txt">
    <h2>${photographe ? "Réservez votre séance en ligne" : "Réservez votre séance en ligne"}</h2>
    <p>${photographe
      ? "Vos clients choisissent la prestation et le jour qui leur conviennent, à toute heure, sans attendre votre rappel."
      : "Vos clients choisissent leur créneau en deux clics, même à 23 h, et reçoivent un rappel la veille."}</p>
    <ol class="etapes"><li>Choisir la prestation</li><li>Choisir le créneau</li><li>Confirmer, c'est réservé</li></ol>
  </div>
  <div class="agenda" aria-label="Exemple de réservation en ligne">
    <div class="ag-tete"><b>${e(prestations[0]?.titre ?? "Séance")}</b><span>Exemple</span></div>
    <div class="jours">${jours.map((j, i) => `<button type="button" class="jour${i === 1 ? " on" : ""}">${j}</button>`).join("")}</div>
    <div class="creneaux">${creneaux.map((h, i) => `<button type="button" class="cr${i === 1 ? " on" : ""}">${h}</button>`).join("")}</div>
    <button type="button" class="btn plein">Confirmer la réservation</button>
    <p class="note">Créneaux d'exemple : vos vraies disponibilités s'afficheront ici.</p>
  </div>
</section>`;

  const contact = [
    c.telephone ? `<a class="btn" href="${telHref(c.telephone)}">Appeler · ${e(c.telephone)}</a>` : "",
    c.email ? `<a class="btn ghost" href="mailto:${e(c.email)}">${e(c.email)}</a>` : "",
  ].join("");

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(c.nom)} · ${e(c.metier)} à ${e(c.commune)}</title>
<meta name="description" content="${e(c.intro)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=${pal.url}&display=swap" rel="stylesheet">
<style>
:root{--fond:${pal.fond};--encre:${pal.encre};--doux:${pal.doux};--acc:${pal.accent};--acct:${pal.accentTexte};--carte:${pal.carte};--ligne:${pal.ligne}}
*{box-sizing:border-box;min-width:0}html{scroll-behavior:smooth;scroll-padding-top:72px}
body{margin:0;background:var(--fond);color:var(--encre);font:17px/1.6 "${pal.texte}",system-ui,sans-serif;overflow-x:clip}
img{display:block;width:100%;height:100%;object-fit:cover}
h1,h2,h3{font-family:"${pal.titre}",Georgia,serif;line-height:1.08;margin:0;text-wrap:balance;font-weight:${photographe ? 600 : 700}}
${photographe ? "" : "h1,h2{letter-spacing:-.015em}"}
a{color:inherit}
header{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px max(5vw,16px);
  background:color-mix(in srgb,var(--fond) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--ligne)}
.logo{font-family:"${pal.titre}",serif;font-size:22px;font-weight:700;text-decoration:none}
nav{display:flex;gap:22px;flex-wrap:wrap}nav a{text-decoration:none;color:var(--doux);font-size:15px}nav a:hover{color:var(--encre)}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 22px;border-radius:${photographe ? "2px" : "6px"};
  background:var(--acc);color:var(--acct);text-decoration:none;font-weight:600;border:1.5px solid var(--acc);font:600 16px/1 "${pal.texte}",sans-serif;cursor:pointer}
.btn.ghost{background:transparent;color:var(--encre);border-color:var(--encre)}
.band{padding:clamp(48px,7vw,104px) max(5vw,16px)}
.sur{margin:0 0 14px;color:var(--doux);font-size:15px;letter-spacing:.04em}
.lead{font-size:19px;color:var(--doux);max-width:34em;margin:18px 0 28px}
.ctas{display:flex;gap:12px;flex-wrap:wrap}
.hero-photo{position:relative;min-height:min(88vh,760px);display:grid;align-items:end}
.hero-photo .hero-img{position:absolute;inset:0;background:#2a2622}
.hero-photo .hero-img::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 35%,rgba(0,0,0,.62))}
.hero-photo .hero-txt{position:relative;color:#fff;padding:clamp(28px,5vw,72px) max(5vw,16px);max-width:900px}
.hero-photo h1{font-size:clamp(40px,6vw,76px)}.hero-photo .lead,.hero-photo .sur{color:rgba(255,255,255,.86)}
.hero-photo .btn{background:#fff;color:#1e1b18;border-color:#fff}.hero-photo .btn.ghost{background:transparent;color:#fff;border-color:#fff}
.hero-coach .hero-img{height:min(62vh,560px);background:var(--ligne)}.hero-coach .hero-img img{object-position:50% 35%}
.hero-coach .hero-txt{display:grid;grid-template-columns:1.1fr .9fr;gap:clamp(24px,5vw,72px);align-items:end;padding:clamp(28px,4vw,56px) max(5vw,16px) 0}
.hero-coach h1{font-size:clamp(38px,5vw,64px)}.hero-coach .lead{margin-top:0}
.liste-p{border-top:1px solid var(--encre)}
.ligne-p{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.6fr) auto auto;gap:12px 28px;align-items:center;padding:22px 0;border-bottom:1px solid var(--ligne)}
.ligne-p h3{font-size:22px}.ligne-p p{margin:0;color:var(--doux)}
h2{font-size:clamp(32px,4vw,50px);margin-bottom:12px}
.intro2{color:var(--doux);max-width:40em;margin:0 0 36px}
.cartes{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:18px}
.carte{background:var(--carte);border:1px solid var(--ligne);border-radius:${photographe ? "4px" : "18px"};padding:26px;display:flex;flex-direction:column;gap:10px}
.carte h3{font-size:${photographe ? "26px" : "24px"}}.carte p{margin:0;color:var(--doux);flex:1}
.num{width:38px;height:38px;border-radius:50%;background:var(--acc);color:var(--acct);display:grid;place-items:center;font-weight:700}
.bas{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:8px;padding-top:14px;border-top:1px solid var(--ligne)}
.todo{border:1.5px dashed var(--doux);border-radius:6px;padding:3px 10px;font-size:14px;color:var(--doux)}
.lien{font-weight:600;text-decoration:none;color:var(--acc)}
.galerie{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:clamp(160px,22vw,300px);gap:10px}
${photographe ? "" : ".g0{grid-column:span 2;grid-row:span 2}"}
.g{margin:0;overflow:hidden;background:var(--ligne);border-radius:${photographe ? "2px" : "14px"}}
.g img{transition:transform .8s ease;object-position:50% 22%}.g:hover img{transform:scale(1.05)}
${photographe ? ".g0{grid-row:span 2}.g3,.g5{grid-column:span 2}" : ""}
.legende{color:var(--doux);font-size:14px;margin-top:12px}
.resa{display:grid;grid-template-columns:1fr minmax(0,420px);gap:clamp(28px,5vw,72px);align-items:center;background:var(--carte);color:var(--encre);border-block:1px solid var(--ligne)}
.resa p{color:var(--doux);max-width:34em}
.etapes{padding-left:22px;margin:18px 0 0;display:grid;gap:6px}
.agenda{background:#fff;color:#1b1b1b;border-radius:18px;padding:22px;box-shadow:0 20px 50px rgba(0,0,0,.16);border:1px solid var(--ligne)}
.ag-tete{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.ag-tete span{font-size:12px;background:#eee;border-radius:99px;padding:3px 10px;color:#555}
.jours,.creneaux{display:grid;gap:8px;margin-bottom:12px}.jours{grid-template-columns:repeat(5,minmax(0,1fr))}.creneaux{grid-template-columns:repeat(auto-fit,minmax(78px,1fr))}
.jour,.cr{min-height:44px;border:1px solid #ddd;border-radius:10px;background:#fafafa;font:600 14px/1.1 "${pal.texte}",sans-serif;cursor:pointer;color:#222}
.jour.on,.cr.on{background:var(--acc);border-color:var(--acc);color:var(--acct)}
.btn.plein{width:100%;margin-top:4px}
.resa .agenda .note{font-size:13px;color:#777;margin:12px 0 0}
.apropos{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:clamp(28px,5vw,64px);align-items:center}
.apropos .portrait{margin:0;max-width:420px}.apropos .portrait div{aspect-ratio:4/5;border-radius:${photographe ? "2px" : "24px"};overflow:hidden;background:var(--ligne)}
.apropos .portrait figcaption{font-size:13px;color:var(--doux);margin-top:8px}
.zone{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}.zone span{border:1px solid var(--ligne);border-radius:99px;padding:5px 14px;font-size:14px;background:var(--carte)}
.contact{text-align:center}.contact .ctas{justify-content:center;margin-top:24px}
footer{padding:28px max(5vw,16px);color:var(--doux);font-size:14px;border-top:1px solid var(--ligne);display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
@media(max-width:820px){nav{display:none}.hero-coach .hero-txt,.resa,.apropos{grid-template-columns:1fr}.g5{grid-column:auto}
  .ligne-p{grid-template-columns:1fr auto}.ligne-p p{grid-column:1/-1}.hero-coach .hero-img{height:46vh}
  .galerie{grid-template-columns:repeat(2,minmax(0,1fr))}.g0,.g3{grid-row:auto;grid-column:auto}.galerie .g3{grid-column:1/-1}}
@media(prefers-reduced-motion:no-preference){.hero-txt>*{animation:monte .8s cubic-bezier(.2,.7,.2,1) both}.hero-txt>*:nth-child(2){animation-delay:.1s}
  .hero-txt>*:nth-child(3){animation-delay:.2s}.hero-txt>*:nth-child(4){animation-delay:.3s}@keyframes monte{from{opacity:0;transform:translateY(16px)}}}
</style></head>
<body>
<header><a class="logo" href="#">${e(c.nom)}</a>
<nav><a href="#prestations">${photographe ? "Prestations" : "Formules"}</a><a href="#galerie">${photographe ? "Portfolio" : "En images"}</a><a href="#apropos">À propos</a><a href="#contact">Contact</a></nav>
<a class="btn" href="#reserver">${verbe}</a></header>
<!--principal-->
${hero}
<section id="prestations" class="band">
  <h2>${photographe ? "Prestations" : "Les formules"}</h2>
  <p class="intro2">${photographe ? "Chaque séance est préparée avec vous : le lieu, la lumière, le moment." : "Des séances adaptées à votre niveau et à votre objectif, au rythme qui vous convient."}</p>
  <div class="${photographe ? "cartes" : "liste-p"}">${cartes}</div>
</section>
<section id="galerie" class="band" style="padding-top:0">
  <h2>${photographe ? "Portfolio" : "En images"}</h2>
  <div class="galerie">${galerie}</div>
  <p class="legende">Photos d'illustration : ${photographe ? "vos propres photos prendront leur place." : "vos propres photos de séances prendront leur place."}</p>
</section>
${resa}
<section id="apropos" class="band apropos">
  <figure class="portrait"><div>${img(ph[ph.length - 1], 800, "Photo d'illustration")}</div><figcaption>Photo d'illustration : votre portrait prendra sa place.</figcaption></figure>
  <div><h2>À propos</h2><p>${e(c.apropos)}</p>
  <div class="zone">${c.zone.map((z) => `<span>${e(z)}</span>`).join("")}</div></div>
</section>
<!--contact-->
<section id="contact" class="band contact" style="padding-top:0">
  <h2>${photographe ? "Parlons de votre projet" : "Prêt à commencer ?"}</h2>
  <p class="intro2" style="margin-inline:auto">${photographe ? "Réservez directement en ligne, ou écrivez-moi pour une demande particulière." : "Réservez votre première séance en ligne, ou contactez-moi pour en parler."}</p>
  <div class="ctas"><a class="btn" href="#reserver">${verbe}</a>${contact}</div>
</section>
<footer><span>© ${annee} ${e(c.nom)} · ${e(c.metier)} à ${e(c.commune)}</span><span>Mentions légales</span></footer>
</body></html>`;
}

/** Exemples fictifs pour le tableau de bord (/demo/exemple-photographe, /demo/exemple-coach). */
export const EXEMPLES_INDEPENDANT: Record<"photographe" | "coach", ContenuIndependant> = {
  photographe: {
    modele: "independant",
    nom: "Camille Verhaeghe Photographie",
    metier: "Photographe",
    commune: "Lille",
    accroche: "Des photos qui vous ressemblent, pour les moments qui comptent",
    intro: "Mariages, portraits et séances en famille à Lille et dans la métropole, en lumière naturelle.",
    prestations: [
      { titre: "Mariage", description: "Des préparatifs à la soirée, un reportage discret qui raconte votre journée." },
      { titre: "Séance couple", description: "Une heure en extérieur, à Lille ou au bord de la mer, pour des images naturelles." },
      { titre: "Famille et naissance", description: "À la maison ou en extérieur, des photos simples et vraies de votre famille." },
      { titre: "Portrait professionnel", description: "Des portraits soignés pour votre site, LinkedIn ou votre équipe." },
    ],
    apropos: "Photographe installée à Lille, je photographie les gens tels qu'ils sont, sans poses figées. Je prends le temps de vous rencontrer avant chaque séance pour préparer les lieux et l'ambiance.",
    zone: ["Lille", "Lambersart", "Marcq-en-Barœul", "La Madeleine", "Villeneuve-d'Ascq", "Côte d'Opale"],
    telephone: null,
    email: null,
  },
  coach: {
    modele: "independant",
    nom: "Julien Dewaele Coaching",
    metier: "Coach sportif",
    commune: "Roubaix",
    accroche: "Coach sportif à Roubaix, chez vous ou au parc",
    intro: "Je vous accompagne en individuel ou en petit groupe, que vous repreniez le sport ou prépariez une course.",
    prestations: [
      { titre: "Séance découverte", description: "Un premier rendez-vous pour faire le point sur votre forme et votre objectif." },
      { titre: "Coaching individuel", description: "Un programme construit pour vous, chez vous, au parc ou en salle." },
      { titre: "Duo ou petit groupe", description: "Entraînez-vous à deux ou à quatre, motivation garantie, coût partagé." },
      { titre: "Remise en forme", description: "Reprendre le sport en douceur après une pause, une grossesse ou une blessure guérie." },
    ],
    apropos: "Coach sportif à Roubaix, j'accompagne des débutants comme des sportifs confirmés. Mon idée : des séances efficaces, adaptées à votre emploi du temps, et un suivi entre deux séances.",
    zone: ["Roubaix", "Tourcoing", "Croix", "Wasquehal", "Lys-lez-Lannoy", "Villeneuve-d'Ascq"],
    telephone: null,
    email: null,
  },
};
