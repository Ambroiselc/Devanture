// Vrai si la personne qui fait la requête est connectée au tableau de bord (Broise). En cas de doute : faux.
// Sert à ne jamais compter ses propres visites (maquettes /m/<slug>, site vitrine via /api/visite).
import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function estConnecte(): Promise<boolean> {
  try {
    const { data } = await (await createClient()).auth.getClaims();
    return Boolean(data?.claims?.sub);
  } catch {
    return false;
  }
}
