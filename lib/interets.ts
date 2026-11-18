// Artisans intéressés (13/11, table maquette_interets) : les 20 derniers, pour la vue d'ensemble.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Interet {
  id: string; cree_le: string; telephone: string | null; message: string | null; traite_le: string | null;
  nom: string | null; ville: string | null; metier: string | null; email: string | null; slug: string | null;
}

/** Liste vide si la migration 20261113030000 n'est pas encore appliquée. */
export async function interetsRecents(supabase: SupabaseClient): Promise<Interet[]> {
  const { data, error } = await supabase.from("maquette_interets")
    .select("id, cree_le, telephone, message, traite_le, prospects(name, city, category, email), websites(slug)")
    .order("cree_le", { ascending: false }).limit(20);
  if (error) return [];
  const un = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] ?? null : x);
  return (data ?? []).map((r) => {
    const p = un(r.prospects as unknown as { name: string; city: string | null; category: string | null; email: string | null } | null);
    const w = un(r.websites as unknown as { slug: string | null } | null);
    return { id: r.id as string, cree_le: r.cree_le as string, telephone: r.telephone as string | null, message: r.message as string | null,
      traite_le: r.traite_le as string | null, nom: p?.name ?? null, ville: p?.city ?? null, metier: p?.category ?? null,
      email: p?.email ?? null, slug: w?.slug ?? null };
  });
}
