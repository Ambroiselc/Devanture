// Formulaire « Demander un devis » des sites des clients (Pedro, 30/10) : POST /api/devis, sans connexion.
// Le site du client envoie la demande ici ; la fonction SQL public.devis_deposer la range (avec ses garde-fous),
// puis on réveille Inès (workflow agent-boite.yml), qui la transmet par e-mail à l'artisan (agents/devis.ts).
// Corps : JSON envoyé en text/plain (pas de « preflight » CORS) : { site, nom, tel, email, commune, message }.
import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseKey, supabaseUrl } from "@/lib/supabase/config";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

const repondre = (corps: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS } });

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

const champ = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: Request) {
  if (!isSupabaseConfigured) return repondre({ ok: false, raison: "indisponible" }, 503);
  const texte = await req.text();
  if (texte.length > 12_000) return repondre({ ok: false, raison: "trop_long" }, 413);
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(texte) as Record<string, unknown>;
  } catch {
    return repondre({ ok: false, raison: "invalide" }, 400);
  }
  const email = champ(d.email, 200);
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("devis_deposer", {
    p_site: champ(d.site, 80), p_nom: champ(d.nom, 120), p_telephone: champ(d.tel, 40),
    p_email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "", p_commune: champ(d.commune, 120),
    p_message: champ(d.message, 4000),
  });
  if (error) {
    console.error("devis_deposer :", error.message);
    return repondre({ ok: false, raison: "erreur" }, 500);
  }
  const r = (data ?? {}) as { ok?: boolean; raison?: string; reveiller?: boolean };
  if (!r.ok) return repondre({ ok: false, raison: r.raison ?? "refus" }, r.raison === "trop" ? 429 : 400);

  // Réveiller Inès pour transmettre la demande tout de suite (au plus une fois toutes les 3 minutes).
  const token = process.env.GITHUB_ACTIONS_TOKEN;
  if (r.reveiller && token) {
    const repo = process.env.GITHUB_REPOSITORY_DEVANTURE || "Ambroiselc/Devanture";
    await fetch(`https://api.github.com/repos/${repo}/actions/workflows/agent-boite.yml/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "devanture-tableau-de-bord", "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main" }),
      cache: "no-store",
    }).catch((err) => console.error("Réveil d'Inès impossible :", err));
  }
  return repondre({ ok: true });
}
