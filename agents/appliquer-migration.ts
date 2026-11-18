// Applique UNE migration du dossier supabase/migrations/ sur la base Supabase (workflow « Appliquer une migration »),
// pour ne plus avoir à la coller à la main dans le SQL Editor. Seuls les fichiers déjà dans le dépôt sont acceptés.
// Les migrations de Devanture sont écrites pour pouvoir être rejouées sans dégât (« if not exists », « drop … if exists »).
// Le tout passe en une seule transaction : en cas d'erreur, rien n'est changé.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { connecter } from "./lib/db.ts";
import { ajouterResume } from "./lib/sortie-publique.ts";

const nom = basename(process.argv[2] ?? "");
if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(nom)) {
  console.error(`Nom de migration invalide : « ${process.argv[2] ?? ""} » (ex. 20261028000000_boites_envoi.sql).`);
  process.exit(1);
}
const texte = readFileSync(new URL(`../supabase/migrations/${nom}`, import.meta.url), "utf8");
const sql = connecter();
try {
  await sql.begin((tx) => tx.unsafe(texte));
  const bilan = `## Migration appliquée\n\n${nom}`;
  console.log(bilan);
  ajouterResume(`${bilan}\n`);
} catch (err) {
  console.error(`Migration ${nom} refusée, rien n'a été changé : ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
