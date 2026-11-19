// Connexion directe à la base Supabase, côté serveur uniquement (GitHub Actions).
// On réutilise le secret SUPABASE_DB_URL, déjà en place pour la sauvegarde.
// Cette connexion a tous les droits : elle ne doit JAMAIS servir dans le navigateur.
import postgres from "postgres";
import { colonneSensible, masquer } from "./sortie-publique.ts";

export function connecter() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL manquante (secret GitHub, voir docs/sauvegardes.md).");
  if (process.env.DEVANTURE_SIMULATION === "1" && /supabase\.(co|com)/.test(url)) {
    throw new Error("Simulation refusée sur la vraie base Supabase : utiliser une base de test locale.");
  }
  return postgres(url, {
    prepare: false, // nécessaire avec le « pooler » de Supabase
    max: 1,
    idle_timeout: 20,
    connect_timeout: 30,
    onnotice: () => {},
    // 18/11 (dépôt public) : toute valeur « artisan » lue dans la base est masquée dans les journaux GitHub.
    transform: { value: { from: (v: unknown, col: { name: string }) => { if (colonneSensible(col.name)) masquer(v); return v; } } },
  });
}

export type Sql = ReturnType<typeof connecter>;

/**
 * 13/11 : PostgreSQL refuse le caractère nul (\u0000) dans un texte (« invalid byte sequence for encoding UTF8: 0x00 ») :
 * certains sites d'artisans en contiennent. On l'enlève de toutes les chaînes d'une ligne avant de l'écrire.
 */
export function sansNul<T>(valeur: T): T {
  if (typeof valeur === "string") return valeur.replace(/\u0000/g, "") as T;
  if (Array.isArray(valeur)) return valeur.map(sansNul) as T;
  if (valeur && typeof valeur === "object" && !(valeur instanceof Date)) {
    return Object.fromEntries(Object.entries(valeur).map(([k, v]) => [k, sansNul(v)])) as T;
  }
  return valeur;
}

/**
 * 19/11 (demande de Broise) : une tâche reste « en cours » pour toujours quand son lancement GitHub est annulé ou coupé
 * (le script n'a pas le temps de la clore). Toute tâche « en cours » depuis plus de 70 min (les workflows s'arrêtent
 * au plus tard à 60 min) passe « annulée ». Appelée au début de l'envoi et d'Inès ; ne fait jamais échouer l'agent.
 */
export async function fermerTachesInterrompues(sql: Sql): Promise<number> {
  try {
    const r = await sql`
      update public.tasks set status = 'annulee', finished_at = coalesce(finished_at, now()),
             error_message = coalesce(error_message, 'Arrêtée avant la fin (lancement annulé ou coupé sur GitHub).')
      where status = 'en_cours' and coalesce(started_at, created_at) < now() - interval '70 minutes'`;
    return r.count;
  } catch {
    return 0;
  }
}
