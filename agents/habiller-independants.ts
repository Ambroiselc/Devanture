// 27/11 (demande de Broise ; refait l'après-midi : photographes = palette seule, coachs = couleurs + mise en page) : donne aux maquettes « indépendant » déjà faites une spécialité (photos qui ressemblent à ce que
// fait la personne : coach mental, yoga, course à pied… ; mariage, famille, portrait) et une variante loin de celles des
// voisins (même métier, même département). Sans IA : seulement les textes déjà écrits dans la maquette.
// Simulation par défaut ; « appliquer » en 1re ligne de tests/habiller-independants.txt pour enregistrer.
import { connecter } from "./lib/db.ts";
import { ajouterResume } from "./lib/sortie-publique.ts";
import { choisirHabillage, codeHabillageIndep, detecterSpecialite, habillageDe, type ContenuIndependant, type HabillageIndep } from "./lib/demo-independant.ts";
import { readFileSync } from "node:fs";

const appliquer = (() => { try { return /^appliquer/i.test(readFileSync("tests/habiller-independants.txt", "utf8").trim()); } catch { return false; } })();
const sql = connecter();
try {
  const lignes = await sql<{ id: string; content: ContenuIndependant; category: string; dep: string; name: string }[]>`
    select w.id, w.content, p.category, left(coalesce(p.postal_code, ''), 2) as dep, p.name
    from public.websites w join public.prospects p on p.id = w.prospect_id
    where w.kind = 'demo' and w.template = 'independant' and w.status <> 'archive'
    order by w.created_at`;
  // On repart de zéro pour toutes : chacune choisit loin de celles déjà choisies avant elle (même métier, même département).
  const dejaChoisis = new Map<string, HabillageIndep[]>();
  const parSpe = new Map<string, number>();
  const parVariante = new Map<string, number>();
  let modifiees = 0;
  for (const l of lignes) {
    const c = l.content;
    const specialite = detecterSpecialite(c.metier, [l.name, c.accroche, c.intro, ...c.prestations.flatMap((x) => [x.titre, x.description]), c.apropos].join(" "));
    const cle = `${l.category}|${l.dep}`;
    const voisins = dejaChoisis.get(cle) ?? [];
    const habillage = choisirHabillage(c.metier, voisins);
    voisins.push(habillage);
    dejaChoisis.set(cle, voisins);
    parSpe.set(`${c.metier} · ${specialite}`, (parSpe.get(`${c.metier} · ${specialite}`) ?? 0) + 1);
    const code = `${c.metier} ${codeHabillageIndep(c.metier, habillage)}`;
    parVariante.set(code, (parVariante.get(code) ?? 0) + 1);
    const avant = habillageDe(c);
    if (appliquer) {
      const { palette: _ancienne, ...reste } = c;
      await sql`update public.websites set content = ${sql.json({ ...reste, specialite, habillage } as never)} where id = ${l.id}`;
    }
    if (c.specialite !== specialite || JSON.stringify(avant) !== JSON.stringify(habillage)) modifiees++;
  }
  const md = [
    `## Variantes des maquettes photographes et coachs ${appliquer ? "(appliqué)" : "(simulation : rien n'est enregistré)"}`,
    "",
    `${lignes.length} maquette(s), ${modifiees} changée(s).`,
    "",
    "Spécialités : " + [...parSpe.entries()].sort().map(([k, n]) => `${k} ${n}`).join(", "),
    "",
    `Variantes utilisées : ${[...parVariante.entries()].sort().map(([k, n]) => `${k} ×${n}`).join(", ")} (photographes : 4 palettes ; coachs : 4 couleurs × 4 mises en page).`,
  ].join("\n");
  console.log(md);
  ajouterResume(md);
} finally {
  await sql.end();
}
