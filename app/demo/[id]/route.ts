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
import { EXEMPLES_INDEPENDANT, renderIndependant } from "@/agents/lib/demo-independant";

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
  // 26/11 (nouvelle cible) : exemples du modèle « indépendant », palette 0 ou 1 avec ?p=1.
  if (id === "exemple-photographe" || id === "exemple-coach") {
    const ex = EXEMPLES_INDEPENDANT[id === "exemple-coach" ? "coach" : "photographe"];
    const p = new URL(req.url).searchParams.get("p") === "1" ? 1 : 0;
    const autre = `<a href="/demo/${id}?p=${1 - p}" style="color:#111;background:#FFD866;text-decoration:none;border-radius:999px;padding:6px 14px;font-weight:700">Autre palette</a>`;
    const barre = `<div style="position:relative;z-index:50;background:#111;color:#fff;font:600 14px/1.2 system-ui,sans-serif;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px;padding:8px 16px"><span style="opacity:.75">Exemple fictif · nouvelle cible</span>${autre}</div>`;
    return pageBrute(renderIndependant({ ...ex, palette: p }).replace("<body>", `<body>\n${barre}`));
  }
  if (!isSupabaseConfigured || !/^[0-9a-f-]{36}$/i.test(id)) return page("<p>Démo introuvable.</p>", 404);

  const supabase = await createClient();
  const { data } = await supabase.from("websites").select("content").eq("id", id).maybeSingle();
  const contenu = data?.content as ContenuDemo | null | undefined;
  if (!contenu) return page("<p>Démo introuvable (ou pas encore rédigée).</p>", 404);
  if ((contenu as unknown as { modele?: string }).modele === "independant") return pageBrute(renderIndependant(contenu as never));
  return page(renderAvecSelecteur(contenu, style, lien));
}
