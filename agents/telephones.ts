// Rattrapage des téléphones (19/11, demande de Broise : « plus aucun trou visible en haut de la maquette »).
// Avant ce jour, Loïc ne gardait pas le téléphone de la liste RGE. Ce script le relit à l'ADEME par SIRET pour les
// artisans pas encore écartés, le range dans prospects.phone et l'ajoute au contenu de leur maquette
// (websites.content.telephone) : il apparaît aussitôt en haut de /m/<slug>, sans refaire la maquette ni l'e-mail.
// Ne touche jamais aux sites définitifs (Pedro) ni aux artisans opposés, refusés ou écartés.
// Par défaut : SIMULATION (compte, ne modifie rien). « --appliquer » : enregistre.
// Workflow telephones.yml : à la main, ou en modifiant tests/telephones.txt (« appliquer » sur la 1re ligne).
import { connecter } from "./lib/db.ts";
import { entreprisesRgeParSiret } from "./lib/rge.ts";
import { ajouterResume } from "./lib/sortie-publique.ts";

const APPLIQUER = process.argv.includes("--appliquer");
const sql = connecter();

try {
  const prospects = await sql<{ id: string; siret: string }[]>`
    select p.id, p.siret
    from public.prospects p
    where p.is_demo = false
      and p.siret is not null
      and p.phone is null
      and p.status not in ('refuse', 'ecarte')
      and not public.is_opposed(p.email)`;

  const telParSiret = new Map<string, string>();
  for (const e of await entreprisesRgeParSiret(prospects.map((p) => p.siret))) {
    if (e.telephone) telParSiret.set(e.siret, e.telephone);
  }

  let trouves = 0, maquettes = 0;
  for (const p of prospects) {
    const tel = telParSiret.get(p.siret.replace(/\s/g, ""));
    if (!tel) continue;
    trouves++;
    if (!APPLIQUER) continue;
    await sql.begin(async (t) => {
      await t`update public.prospects set phone = ${tel} where id = ${p.id} and phone is null`;
      const r = await t`update public.websites
                        set content = content || ${t.json({ telephone: tel })}
                        where prospect_id = ${p.id} and kind = 'demo' and status <> 'archive' and content is not null`;
      maquettes += r.count;
    });
  }

  const resume = [
    `## ${APPLIQUER ? "Appliqué" : "SIMULATION (rien modifié)"} : téléphone trouvé pour ${trouves} artisan(s) sur ${prospects.length}`,
    APPLIQUER ? `Maquettes complétées : ${maquettes}.` : "Relancer avec « appliquer » pour enregistrer.",
    telParSiret.size === 0 && prospects.length > 0
      ? "Aucun téléphone lu : l'ADEME n'a peut-être pas de champ « telephone » (voir l'avertissement plus haut)."
      : "",
  ].filter(Boolean);
  console.log(resume.join("\n"));
  console.log(`::notice title=Téléphones::${resume.join("%0A").replace(/::/g, ": :")}`);
  ajouterResume(resume.join("\n") + "\n");
} catch (err) {
  console.error((err as Error).message);
  console.log(`::error title=Téléphones::${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
