// Affiche une démo de site en plein écran : /demo/<identifiant>, ou /demo/exemple pour voir le modèle.
// ?style=pro | chaleureux : les deux styles, avec un sélecteur en haut de la page.
// /demo/exemple tire un habillage au hasard (bouton « Autre combinaison » pour en voir un autre) ;
// ?v=<code> en garde un précis : les boutons de style le gardent, pour comparer les deux styles d'une même combinaison.
// Réservé aux administrateurs connectés (le proxy et la RLS de Supabase s'en chargent).
import { EXEMPLE_DEMO, type ContenuDemo } from "@/agents/lib/demo-artisan-pro";
import { estStyle, renderAvecSelecteur } from "@/agents/lib/demo-styles";
import { codeHabillage, habillageAuHasard, lireCodeHabillage } from "@/agents/lib/habillage";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { moderniser } from "@/agents/lib/moderne";
import { choisirHabillage, codeHabillageIndep, EXEMPLE_COACH_MENTAL, PHOTOS_INDEPENDANTS, EXEMPLES_INDEPENDANT, habillageDe, lireCodeHabillageIndep, renderIndependant, SPECIALITES, type HabillageIndep } from "@/agents/lib/demo-independant";
import { MISES_EN_PAGE_COACH } from "@/agents/lib/demo-coach";
import { MISES_EN_PAGE_PHOTOGRAPHE } from "@/agents/lib/demo-photographe";
import { CADRAGE, pointDe } from "@/agents/lib/cadrage";
import { PHOTOS_METIERS_PAR_GROUPE } from "@/agents/lib/photo-metier";

const pageBrute = (html: string, status = 200) =>
  new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // 19/11 : version « moderne » par défaut (validée par Broise) ; ?moderne=0 montre l'ancienne.
  const moderne = new URL(req.url).searchParams.get("moderne") !== "0";
  const m = moderne ? "" : "&moderne=0";
  const page = (html: string, status = 200) => pageBrute(moderne && status === 200 ? moderniser(html) : html, status);
  const demande = new URL(req.url).searchParams.get("style");
  const style = estStyle(demande) ? demande : "chaleureux"; // 19/11 : chaleureux d'abord
  const lien = (s: string) => `/demo/${id}?style=${s}${m}`;
  if (id === "exemple") {
    const habillage = lireCodeHabillage(new URL(req.url).searchParams.get("v")) ?? habillageAuHasard();
    const code = codeHabillage(habillage);
    return page(renderAvecSelecteur({ ...EXEMPLE_DEMO, habillage }, style, (s) => `/demo/exemple?style=${s}&v=${code}${m}`,
      `/demo/exemple?style=${style}${m}`));
  }
  // 27/11 : planche de cadrage de toutes les photos d'illustration (agents/lib/cadrage.ts).
  if (id === "planche") {
    const groupes: [string, string[]][] = [
      ...Object.entries(PHOTOS_INDEPENDANTS).map(([s, l]) => [`Indépendants · ${s}`, l] as [string, string[]]),
      ...Object.entries(PHOTOS_METIERS_PAR_GROUPE),
    ];
    const vus = new Set<string>();
    const url = (id: string, w: number) => `https://images.unsplash.com/photo-${id}?auto=format&w=${w}&q=60`;
    const carte = (id: string, n: number) => {
      const [x, y] = pointDe(id);
      const regle = Object.prototype.hasOwnProperty.call(CADRAGE, id);
      const cadre = (r: string, l: number) => `<div style="width:${l}px;aspect-ratio:${r};overflow:hidden;background:#ddd"><img src="${url(id, 500)}" style="width:100%;height:100%;object-fit:cover;object-position:${x}% ${y}%"></div>`;
      return `<div style="display:flex;gap:8px;align-items:flex-start;padding:8px;background:#fff;border:1px solid #ddd">
<div style="position:relative;width:240px"><img src="${url(id, 480)}" style="width:100%;display:block">
${[10, 20, 30, 40, 50, 60, 70, 80, 90].map((p) => `<span style="position:absolute;left:${p}%;top:0;bottom:0;border-left:1px dashed rgba(255,0,0,.45)"></span><span style="position:absolute;top:${p}%;left:0;right:0;border-top:1px dashed rgba(255,0,0,.45)"></span>`).join("")}
<span style="position:absolute;left:${x}%;top:${y}%;width:14px;height:14px;margin:-7px;border-radius:50%;background:${regle ? "#0c0" : "#f00"};border:2px solid #fff"></span></div>
<div style="display:grid;gap:6px">${cadre("16/7", 230)}<div style="display:flex;gap:6px">${cadre("4/5", 100)}${cadre("1/1", 120)}</div></div>
<div style="font:12px/1.3 monospace;width:120px;word-break:break-all"><b style="font-size:16px">${n}</b><br>${id}<br>point ${x} ${y}${regle ? "" : "<br>(pas réglé)"}</div></div>`;
    };
    let n = 0;
    const corps = groupes.map(([titre, ids]) => {
      const nouveaux = ids.filter((i) => !vus.has(i));
      nouveaux.forEach((i) => vus.add(i));
      return nouveaux.length ? `<h2 style="font:600 18px system-ui;margin:18px 0 8px">${titre}</h2><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(640px,1fr));gap:8px">${nouveaux.map((i) => carte(i, ++n)).join("")}</div>` : "";
    }).join("");
    return pageBrute(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Planche de cadrage</title></head><body style="margin:0;padding:12px;background:#f2f2f2;font-family:system-ui">
<h1 style="font:700 22px system-ui;margin:0">Planche de cadrage · ${n} photos</h1><p style="margin:4px 0 0;color:#555">Point vert = réglé, rouge = centré par défaut. Lignes tous les 10 %.</p>${corps}</body></html>`);
  }
  // 26/11 (nouvelle cible) : exemples du modèle « indépendant ».
  // 27/11 après-midi : ?v= = palette (photographe, ex. « 2 ») ou couleurs + mise en page (coach, ex. « 13 ») ; ?spe=… pour les photos.
  // Barre noire : spécialités, mises en page des coachs, palettes, et « Autre variante » (tirage loin de celle affichée).
  if (id === "exemple-photographe" || id === "exemple-coach") {
    const ex = EXEMPLES_INDEPENDANT[id === "exemple-coach" ? "coach" : "photographe"];
    const q = new URL(req.url).searchParams;
    const habillage = lireCodeHabillageIndep(ex.metier, q.get("v")) ?? habillageDe(ex);
    const specs = SPECIALITES[ex.metier];
    const spe = specs.includes(q.get("spe") as never) ? (q.get("spe") as (typeof specs)[number]) : specs[0];
    const code = (h: HabillageIndep) => codeHabillageIndep(ex.metier, h);
    const bouton = (h: HabillageIndep, s: string, txt: string, actif = false) =>
      `<a href="/demo/${id}?v=${code(h)}&spe=${s}" style="color:${actif ? "#111" : "#fff"};background:${actif ? "#FFD866" : "transparent"};border:1px solid #FFD866;text-decoration:none;border-radius:999px;padding:5px 12px">${txt}</a>`;
    const groupe = (titre: string, liens: string) => `<span style="display:inline-flex;flex-wrap:wrap;align-items:center;gap:6px"><span style="opacity:.7">${titre}</span>${liens}</span>`;
    const mises = groupe("Mise en page :",
      (ex.metier === "Photographe" ? MISES_EN_PAGE_PHOTOGRAPHE : MISES_EN_PAGE_COACH).map((nom, m) => bouton({ ...habillage, m }, spe, nom, (habillage.m ?? 0) === m)).join(""));
    const palettes = groupe(ex.metier === "Photographe" ? "Palette :" : "Couleurs :",
      [0, 1, 2, 3].map((p) => bouton({ ...habillage, p }, spe, String(p + 1), habillage.p === p)).join(""));
    const barre = `<div style="position:relative;z-index:50;background:#111;color:#fff;font:600 14px/1.2 system-ui,sans-serif;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px 18px;padding:8px 16px">`
      + `<span style="opacity:.75">Exemple fictif · variante ${code(habillage)}</span>`
      + groupe("Spécialité :", specs.map((x) => bouton(habillage, x, x, x === spe)).join(""))
      + mises + palettes
      + bouton(choisirHabillage(ex.metier, [habillage]), spe, "Autre variante →") + `</div>`;
    const contenu = spe === "mental" ? EXEMPLE_COACH_MENTAL : ex;
    return pageBrute(renderIndependant({ ...contenu, habillage, specialite: spe }).replace(/<body[^>]*>/, (b) => `${b}\n${barre}`));
  }
  if (!isSupabaseConfigured || !/^[0-9a-f-]{36}$/i.test(id)) return page("<p>Démo introuvable.</p>", 404);

  const supabase = await createClient();
  const { data } = await supabase.from("websites").select("content").eq("id", id).maybeSingle();
  const contenu = data?.content as ContenuDemo | null | undefined;
  if (!contenu) return page("<p>Démo introuvable (ou pas encore rédigée).</p>", 404);
  if ((contenu as unknown as { modele?: string }).modele === "independant") return pageBrute(renderIndependant(contenu as never));
  return page(renderAvecSelecteur(contenu, style, lien));
}
