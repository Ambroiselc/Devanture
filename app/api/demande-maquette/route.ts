// 25/11 : formulaire « Recevoir ma maquette gratuite » du site vitrine (devanture-artisans.fr). POST sans connexion.
// Corps : JSON envoyé en text/plain (pas de « preflight » CORS) :
//   { commerce, metier, ville, email, tel, message, formule, piege }
// « piege » est un champ caché que seuls les robots remplissent : on leur répond « ok » sans rien enregistrer.
// La fonction SQL public.demande_maquette range la demande dans la boîte mail (comme un e-mail reçu), puis on réveille
// Inès (workflow agent-boite.yml), qui la trie et prépare la réponse.
import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseKey, supabaseUrl } from "@/lib/supabase/config";

const ORIGINES = ["https://devanture-artisans.fr", "https://www.devanture-artisans.fr"];

function cors(req: Request) {
  const o = req.headers.get("origin") ?? "";
  return {
    "access-control-allow-origin": ORIGINES.includes(o) || /^http:\/\/localhost(:\d+)?$/.test(o) ? o : ORIGINES[0],
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

const repondre = (req: Request, corps: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(corps), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store", ...cors(req) },
  });

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cors(req) });
}

const champ = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: Request) {
  if (!isSupabaseConfigured) return repondre(req, { ok: false, raison: "indisponible" }, 503);
  const texte = await req.text();
  if (texte.length > 8_000) return repondre(req, { ok: false, raison: "trop_long" }, 413);
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(texte) as Record<string, unknown>;
  } catch {
    return repondre(req, { ok: false, raison: "invalide" }, 400);
  }
  if (champ(d.piege, 200)) return repondre(req, { ok: true });

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("demande_maquette", {
    p_commerce: champ(d.commerce, 120), p_metier: champ(d.metier, 80), p_ville: champ(d.ville, 120),
    p_email: champ(d.email, 200), p_telephone: champ(d.tel, 40), p_message: champ(d.message, 3000),
    p_formule: champ(d.formule, 20),
  });
  if (error) {
    console.error("demande_maquette :", error.message);
    return repondre(req, { ok: false, raison: "erreur" }, 500);
  }
  const r = (data ?? {}) as { ok?: boolean; raison?: string; reveiller?: boolean };
  if (!r.ok) return repondre(req, { ok: false, raison: r.raison ?? "refus" }, r.raison === "trop" ? 429 : 400);

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
  return repondre(req, { ok: true });
}
