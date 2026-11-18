// Images d'une maquette, faites par Sid : /demo/<identifiant>/capture (?style=pro | chaleureux | duo)
// Réservé aux administrateurs connectés (le proxy et la RLS de Supabase s'en chargent).
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** Supabase renvoie les colonnes « bytea » sous forme de texte hexadécimal : « \x89504e… ». */
function versOctets(valeur: unknown): Buffer | null {
  if (typeof valeur !== "string") return null;
  return valeur.startsWith("\\x") ? Buffer.from(valeur.slice(2), "hex") : Buffer.from(valeur, "base64");
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // ?style=pro | chaleureux | duo (par défaut : duo, les deux côte à côte ; à défaut, le style sobre)
  const demande = new URL(req.url).searchParams.get("style");
  const style = demande === "pro" || demande === "chaleureux" ? demande : "duo";
  if (!isSupabaseConfigured || !/^[0-9a-f-]{36}$/i.test(id)) return new Response("Introuvable", { status: 404 });

  const supabase = await createClient();
  const { data: lignes } = await supabase.from("website_captures").select("image, mime, style").eq("website_id", id);
  const data = (lignes ?? []).find((l) => l.style === style) ?? (lignes ?? []).find((l) => l.style === "pro") ?? null;
  const octets = versOctets(data?.image);
  if (!octets) return new Response("Pas encore de capture pour cette maquette.", { status: 404 });

  return new Response(new Uint8Array(octets), {
    headers: { "content-type": data?.mime ?? "image/jpeg", "cache-control": "private, max-age=3600" },
  });
}
