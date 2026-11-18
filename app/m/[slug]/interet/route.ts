// « Ce site m'intéresse » (13/11) : POST /m/<slug>/interet depuis le bandeau des maquettes (lib/bandeau-interet.ts),
// sans connexion. Corps JSON en text/plain : { t: téléphone, m: message, s: style, a: appareil }.
// Jamais enregistré pour Broise connecté ni pour un robot (réseau d'hébergeur, lib/reseau.ts).
// Ensuite on réveille Inès (agent-boite.yml), qui prévient Broise par e-mail (agents/interets.ts).
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { isSupabaseConfigured, supabaseKey, supabaseUrl } from "@/lib/supabase/config";
import { estConnecte } from "@/lib/est-connecte";
import { lireReseau } from "@/lib/reseau";

const repondre = (ok: boolean, status = 200) =>
  new Response(JSON.stringify({ ok }), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isSupabaseConfigured || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return repondre(false, 400);
  let cf: Record<string, unknown> | undefined;
  try { cf = getCloudflareContext().cf as Record<string, unknown> | undefined; } catch { cf = undefined; }
  if (lireReseau(cf).robot) return repondre(true);
  if (await estConnecte()) return repondre(true);
  let d: Record<string, unknown>;
  try { d = JSON.parse((await req.text()).slice(0, 3000)) as Record<string, unknown>; } catch { return repondre(false, 400); }
  const champ = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("maquette_interet", {
    p_slug: slug, p_telephone: champ(d.t, 30), p_message: champ(d.m, 1000), p_style: champ(d.s, 20), p_appareil: champ(d.a, 20),
  });
  if (error) {
    console.error(`maquette_interet ${slug} : ${error.message}`);
    return repondre(false, 500);
  }
  if (data !== true) return repondre(false, 429);
  console.log(`maquette ${slug} : intérêt déclaré`);
  const token = process.env.GITHUB_ACTIONS_TOKEN;
  if (token) {
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
  return repondre(true);
}
