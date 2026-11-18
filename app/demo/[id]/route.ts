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

const page = (html: string, status = 200) =>
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
  const demande = new URL(req.url).searchParams.get("style");
  const style = estStyle(demande) ? demande : "pro";
  const lien = (s: string) => `/demo/${id}?style=${s}`;
  if (id === "exemple") {
    const habillage = lireCodeHabillage(new URL(req.url).searchParams.get("v")) ?? habillageAuHasard();
    const code = codeHabillage(habillage);
    return page(renderAvecSelecteur({ ...EXEMPLE_DEMO, habillage }, style, (s) => `/demo/exemple?style=${s}&v=${code}`,
      `/demo/exemple?style=${style}`));
  }
  if (!isSupabaseConfigured || !/^[0-9a-f-]{36}$/i.test(id)) return page("<p>Démo introuvable.</p>", 404);

  const supabase = await createClient();
  const { data } = await supabase.from("websites").select("content").eq("id", id).maybeSingle();
  const contenu = data?.content as ContenuDemo | null | undefined;
  if (!contenu) return page("<p>Démo introuvable (ou pas encore rédigée).</p>", 404);
  return page(renderAvecSelecteur(contenu, style, lien));
}
