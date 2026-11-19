// Version « moderne » des maquettes (19/11, essai demandé par Broise) : animations et galerie qui défile toute seule.
// Pour l'instant activée seulement avec « ?moderne=1 » dans le lien (/m/<slug> et /demo/<id>), pour régler avant de
// l'appliquer à toutes les maquettes. Ajoutée PAR-DESSUS la page rendue (une feuille de style + un petit script) :
// les modèles eux-mêmes ne changent pas, et sans JavaScript la page reste exactement la même.
// Respecte « réduire les animations » (prefers-reduced-motion) : alors rien ne bouge.
// Lu par les routes du site : n'importe rien.

const CSS = `
<style id="dv-moderne">
:root{--dv-ease:cubic-bezier(.2,.7,.2,1)}
html{scroll-behavior:smooth}
/* Barre de progression de lecture, tout en haut */
#dv-progres{position:fixed;left:0;top:0;height:3px;width:100%;transform-origin:0 50%;transform:scaleX(0);z-index:9998;
  background:linear-gradient(90deg,var(--brick,var(--amber,#c0563b)),var(--moss,var(--ink,#234)));pointer-events:none}
/* En-tête en verre dépoli */
header{background:rgba(255,255,255,.82)!important;-webkit-backdrop-filter:saturate(1.6) blur(12px);
  backdrop-filter:saturate(1.6) blur(12px);transition:box-shadow .3s}
header.dv-ombre{box-shadow:0 6px 24px rgba(0,0,0,.08)}
/* Arrivée du haut de page, en cascade */
.dv-js .hero h1,.dv-js .hero .lead,.dv-js .hero .ctas,.dv-js .hero .hello,.dv-js .hero .eyebrow{opacity:0;transform:translateY(18px);
  animation:dv-monte .9s var(--dv-ease) forwards}
.dv-js .hero .hello,.dv-js .hero .eyebrow{animation-delay:.05s}
.dv-js .hero h1{animation-delay:.15s}
.dv-js .hero .lead{animation-delay:.3s}
.dv-js .hero .ctas{animation-delay:.45s}
@keyframes dv-monte{to{opacity:1;transform:none}}
/* Photo du haut : léger zoom lent (effet « Ken Burns ») */
.pic-cadre,.banniere-cadre,.photo-metier{overflow:hidden}
.pic-cadre img,.banniere-cadre img,.photo-metier img{animation:dv-zoom 16s ease-in-out infinite alternate;transform-origin:60% 40%}
@keyframes dv-zoom{from{transform:scale(1)}to{transform:scale(1.09)}}
/* Boutons : petit soulèvement */
.btn{transition:transform .25s var(--dv-ease),box-shadow .25s var(--dv-ease),filter .25s}
.btn:hover{transform:translateY(-2px);box-shadow:0 10px 22px rgba(0,0,0,.14)}
/* Apparition au défilement */
.dv-js .dv-rv{opacity:0;transform:translateY(28px);transition:opacity .8s var(--dv-ease) var(--d,0ms),transform .8s var(--dv-ease) var(--d,0ms)}
.dv-js .dv-rv.dv-vu{opacity:1;transform:none}
/* Prestations : cartes qui se soulèvent */
.svc{transition:transform .3s var(--dv-ease),box-shadow .3s var(--dv-ease),background-color .3s}
.svc:hover{transform:translateY(-3px)}
.tuiles .svc:hover,.cartes .svc:hover,.services .svc:hover{box-shadow:0 14px 30px rgba(0,0,0,.08)}
/* Communes : pastilles qui apparaissent une à une */
.communes span{transition:transform .25s var(--dv-ease),background-color .25s}
.communes span:hover{transform:translateY(-2px) scale(1.04)}
/* Galerie des chantiers : défilement automatique sans fin */
.works.dv-defile{display:block!important;overflow:hidden;padding:6px 0 10px;margin-top:28px;
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent);mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent)}
.dv-piste{display:flex;gap:18px;width:max-content;animation:dv-defile var(--dv-duree,45s) linear infinite}
.works.dv-defile:hover .dv-piste,.works.dv-defile.dv-pause .dv-piste{animation-play-state:paused}
@keyframes dv-defile{to{transform:translateX(calc(-50% - 9px))}}
.dv-piste>.ph{flex:0 0 clamp(240px,30vw,320px)!important;height:clamp(300px,34vw,380px);min-height:0!important;grid-row:auto!important;
  border-radius:22px;transition:transform .5s var(--dv-ease),box-shadow .5s var(--dv-ease);background-size:110%!important;
  background-position:center;transition:transform .5s var(--dv-ease),box-shadow .5s var(--dv-ease),background-size .8s var(--dv-ease)}
.dv-piste>.ph:hover{transform:translateY(-6px);box-shadow:0 18px 36px rgba(0,0,0,.18);background-size:120%!important}
.dv-piste>.ph b{transition:transform .5s var(--dv-ease)}
.dv-piste>.ph:hover b{transform:translateY(-4px)}
.dv-piste>figure.work{flex:0 0 clamp(260px,34vw,360px)}
.dv-piste>figure.work .ph{transition:transform .5s var(--dv-ease)}
.dv-piste>figure.work:hover .ph{transform:scale(1.03)}
/* Avis : léger halo */
.reviews{transition:transform .4s var(--dv-ease),box-shadow .4s var(--dv-ease)}
.reviews:hover{transform:translateY(-3px);box-shadow:0 14px 30px rgba(0,0,0,.06)}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation:none!important;transition:none!important}
  .dv-js .dv-rv,.dv-js .hero h1,.dv-js .hero .lead,.dv-js .hero .ctas,.dv-js .hero .hello,.dv-js .hero .eyebrow{opacity:1!important;transform:none!important}
  .works.dv-defile{overflow-x:auto}
}
</style>`;

const JS = `
<script id="dv-moderne-js">(function(){
var reduit=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
document.documentElement.classList.add("dv-js");
/* Barre de progression + ombre de l'en-tête */
var barre=document.createElement("div");barre.id="dv-progres";document.body.appendChild(barre);
var tete=document.querySelector("header");
function auDefilement(){var h=document.documentElement;var max=h.scrollHeight-h.clientHeight;
  barre.style.transform="scaleX("+(max>0?h.scrollTop/max:0)+")";if(tete)tete.classList.toggle("dv-ombre",h.scrollTop>10)}
addEventListener("scroll",auDefilement,{passive:true});auDefilement();
/* Galerie des chantiers qui défile toute seule (les cases sont doublées pour boucler sans saut) */
document.querySelectorAll("#realisations .works").forEach(function(w){
  var cases=[].slice.call(w.children);if(cases.length<2)return;
  var piste=document.createElement("div");piste.className="dv-piste";
  cases.forEach(function(c){piste.appendChild(c)});
  cases.forEach(function(c){var d=c.cloneNode(true);d.setAttribute("aria-hidden","true");piste.appendChild(d)});
  w.textContent="";w.appendChild(piste);w.classList.remove("bande","avap");w.classList.add("dv-defile");
  piste.style.setProperty("--dv-duree",Math.max(30,cases.length*9)+"s");
  /* Sur téléphone : un doigt posé met en pause */
  w.addEventListener("touchstart",function(){w.classList.add("dv-pause")},{passive:true});
  w.addEventListener("touchend",function(){setTimeout(function(){w.classList.remove("dv-pause")},1500)},{passive:true});
});
if(reduit||!("IntersectionObserver" in window))return;
/* Apparition des blocs au défilement, en cascade */
var cibles=document.querySelectorAll("section h2, section .head p, section .lead2, .svc, .works, .reviews, .story .wrap > *, .contact .wrap > *, .communes span, #a-propos .wrap > *, form");
var vus=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add("dv-vu");vus.unobserve(e.target)}})},{rootMargin:"0px 0px -8% 0px",threshold:.12});
[].forEach.call(cibles,function(el){
  if(el.closest(".hero"))return;
  var freres=el.parentElement?[].indexOf.call(el.parentElement.children,el):0;
  el.style.setProperty("--d",Math.min(freres,8)*70+"ms");el.classList.add("dv-rv");vus.observe(el)});
})();</script>`;

/** Ajoute la couche « moderne » à une page de maquette déjà rendue. */
export function moderniser(html: string): string {
  const avecCss = html.includes("</head>") ? html.replace("</head>", `${CSS}\n</head>`) : CSS + html;
  return avecCss.includes("</body>") ? avecCss.replace("</body>", `${JS}\n</body>`) : avecCss + JS;
}
