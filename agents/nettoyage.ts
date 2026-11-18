// Nettoyage quotidien de la base (lancé après chaque vague de Loïc) : voir la fonction SQL public.nettoyer_base()
// dans supabase/migrations/20261026020000_styles_et_nettoyage.sql. N'efface jamais la liste d'opposition.
import { appendFileSync } from "node:fs";
import { connecter } from "./lib/db.ts";

const sql = connecter();
try {
  const [{ nettoye }] = await sql<{ nettoye: Record<string, number> }[]>`select public.nettoyer_base() as nettoye`;
  // Boîte mail (migration 20261027000000_boite_mail.sql) : ignorée si la migration n'est pas encore lancée.
  try {
    const [{ boite }] = await sql<{ boite: Record<string, number> }[]>`select public.nettoyer_boite() as boite`;
    Object.assign(nettoye, boite);
  } catch {
    /* pas encore de boîte mail */
  }
  const [{ taille }] = await sql<{ taille: Record<string, string | number> }[]>`select public.taille_base() as taille`;
  const pourcent = Math.round((100 * Number(taille.total_octets)) / (500 * 1024 * 1024));
  const texte = [
    "## Nettoyage de la base",
    "",
    `Supprimé : ${Object.entries(nettoye).map(([k, v]) => `${k.replaceAll("_", " ")} ${v}`).join(" · ")}`,
    `Place utilisée : **${taille.total}** (${pourcent} % des 500 Mo gratuits) · captures ${taille.captures} · prospects ${taille.prospects} · e-mails ${taille.emails}`,
  ].join("\n");
  console.log(texte);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${texte}\n`);
} catch (err) {
  // La migration n'est peut-être pas encore lancée : on le signale sans faire échouer la vague.
  console.log(`Nettoyage impossible : ${(err as Error).message}`);
} finally {
  await sql.end();
}
