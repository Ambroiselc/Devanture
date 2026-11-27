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
import { choisirHabillage, codeHabillageIndep, EXEMPLE_COACH_MENTAL, EXEMPLES_INDEPENDANT, habillageDe, lireCodeHabillageIndep, renderIndependant, SPECIALITES, type HabillageIndep } from "@/agents/lib/demo-independant";
import { MISES_EN_PAGE_COACH } from "@/agents/lib/demo-coach";
import { MISES_EN_PAGE_PHOTOGRAPHE } from "@/agents/lib/demo-photographe";

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
