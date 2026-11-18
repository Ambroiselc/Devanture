// Rattrapage du métier des artisans RGE (10/11). Avant cette date, Loïc devinait le métier seulement à partir des
// domaines RGE (un menuisier certifié « fenêtres de toit » devenait couvreur). Ce script recalcule le métier avec la
// nouvelle méthode (lib/metier-artisan.ts : nom de l'entreprise, puis code NAF) pour les artisans PAS ENCORE CONTACTÉS.
//
// Par défaut il ne modifie rien : il liste ce qui changerait. Avec --appliquer, pour chaque artisan qui change :
//   métier et code NAF corrigés ; maquette archivée et e-mails non partis supprimés, pour que Sid refasse la maquette
//   et Valérie un nouvel e-mail (comme le bouton « Refaire la maquette » de Coco) ; note « [Métier corrigé] … ».
// Ne touche jamais : les artisans déjà contactés, écartés ou clients, ceux déjà corrigés par Coco ou Broise
// (« [Coco → Sid] » dans les notes), les fictifs. Faute de domaines RGE en base, un code NAF ambigu (43.22B, 43.32B)
// compatible avec le métier actuel ne le change pas.
// Workflow corriger-metiers.yml : à la main, ou en modifiant tests/metiers.txt (« appliquer » sur la 1re ligne).
//
// 17/11 : 4 métiers ajoutés (Isolation, Panneaux solaires, Façadier, Poêles et cheminées ; lib/metiers.ts). Les domaines
// RGE sont relus dans la liste officielle de l'ADEME (par SIRET) : le métier est recalculé en entier.
// Passent aussi en revue les artisans que Coco a écartés pour un métier douteux (« [Coco] écarté : » dans les notes) :
// ils reviennent « qualifié » avec le bon métier, leurs lignes « [Coco… » sont retirées (compteur de renvois remis à zéro)
// et l'e-mail annulé est supprimé, pour que Sid et Valérie les refassent.
import { appendFileSync } from "node:fs";
import { connecter } from "./lib/db.ts";
import { nafParSiret } from "./lib/annuaire.ts";
import { metierArtisan } from "./lib/metier-artisan.ts";
import { entreprisesRgeParSiret } from "./lib/rge.ts";

/** Les métiers ajoutés le 17/11 : un artisan déjà corrigé (Coco ou 10/11) est revu seulement pour passer à l'un d'eux. */
const NOUVEAUX = new Set(["Isolation", "Panneaux solaires", "Façadier", "Poêles et cheminées"]);

const APPLIQUER = process.argv.includes("--appliquer");
const sql = connecter();

interface Prospect {
  id: string;
  name: string;
  category: string | null;
  naf_code: string | null;
  siret: string;
  status: string;
  notes: string | null;
  maquette: boolean;
  emails_en_attente: number;
}

/** Domaines RGE relus dans la liste officielle (ADEME), par SIRET : ils ne sont pas gardés en base. */
const domainesParSiret = new Map<string, string[]>();
const domainesDe = (p: Prospect) => domainesParSiret.get(p.siret.replace(/\s/g, "")) ?? [];

/** Même règle que Loïc (lib/metier-artisan.ts) ; sans domaines en base, le métier actuel en tient lieu. */
function nouveauMetier(p: Prospect, naf: string | null): { metier: string; source: string } | null {
  const domaines = domainesDe(p);
  const r = metierArtisan({ nom: p.name, naf, domaines, metierRgeActuel: domaines.length ? null : p.category });
  if (!domaines.length && r.source === "rge") return null;
  const dejaCorrige = /\[(Coco → Sid|Métier corrigé)\]/.test(p.notes ?? "");
  if (dejaCorrige && !NOUVEAUX.has(r.metier)) return null;
  if (r.metier === "Artisan du bâtiment" && p.category) return null;
  return { metier: r.metier, source: r.source === "nom" ? "nom" : r.source === "naf" ? `NAF ${naf}` : "domaines RGE" };
}

const lignes: string[] = [];
try {
  const prospects = await sql<Prospect[]>`
    select p.id, p.name, p.category, p.naf_code, p.siret, p.status, p.notes,
      exists (select 1 from public.websites w where w.prospect_id = p.id and w.kind = 'demo' and w.status <> 'archive') as maquette,
      (select count(*)::int from public.emails e where e.prospect_id = p.id and e.sent_at is null) as emails_en_attente
    from public.prospects p
    where p.is_demo = false
      and p.siret is not null
      and p.source like 'Liste officielle des entreprises RGE%'
      and (p.status in ('nouveau', 'qualifie', 'demo_prete')
           or (p.status = 'ecarte' and coalesce(p.notes, '') like '%[Coco] écarté :%'))
      and coalesce(p.notes, '') not like '%, 17/11)%'
      and not exists (select 1 from public.emails e where e.prospect_id = p.id and e.sent_at is not null)
    order by p.created_at`;

  for (const e of await entreprisesRgeParSiret(prospects.map((p) => p.siret))) domainesParSiret.set(e.siret, e.domaines);
  console.log(`Domaines RGE relus pour ${domainesParSiret.size} artisans sur ${prospects.length}.`);
  let changes = 0, nafLus = 0, sansNaf = 0;
  const parPassage: Record<string, number> = {};
  for (const p of prospects) {
    let naf = p.naf_code;
    if (!naf) {
      naf = await nafParSiret(p.siret);
      if (naf) nafLus++; else sansNaf++;
    }
    const nouveau = nouveauMetier(p, naf);
    const restaure = p.status === "ecarte";
    const change = nouveau && (nouveau.metier !== p.category || restaure);

    if (APPLIQUER && naf && naf !== p.naf_code && !change) {
      await sql`update public.prospects set naf_code = ${naf} where id = ${p.id}`;
    }
    if (!change || !nouveau) continue;
    changes++;
    const cle = `${p.category ?? "?"} → ${nouveau.metier}`;
    parPassage[cle] = (parPassage[cle] ?? 0) + 1;
    lignes.push(`${p.name} | ${p.category ?? "?"} → ${nouveau.metier} (${nouveau.source}) | ${restaure ? "écarté par Coco → remis en route" : p.status}${p.maquette ? ", maquette à refaire" : ""}${p.emails_en_attente ? `, ${p.emails_en_attente} e-mail(s) non parti(s) supprimé(s)` : ""}`);

    if (APPLIQUER) {
      const note = `[Métier corrigé] ${p.category ?? "?"} → ${nouveau.metier} (${nouveau.source}, 17/11)`;
      // Un artisan écarté par Coco repart de zéro : ses lignes « [Coco… » (compteur de renvois) sont retirées.
      const notes = (p.notes ?? "").split("\n").filter((l) => !(restaure && l.startsWith("[Coco"))).join("\n").trim();
      await sql.begin(async (t) => {
        // Une maquette faite (« demo_prete ») redevient « qualifie » : Sid la refait, puis Valérie écrit l'e-mail.
        await t`update public.prospects set category = ${nouveau.metier}, naf_code = ${naf},
                  status = case when status in ('demo_prete', 'ecarte') then 'qualifie' else status end,
                  notes = ${notes ? `${notes}\n${note}` : note} where id = ${p.id}`;
        await t`update public.websites set status = 'archive' where prospect_id = ${p.id} and kind = 'demo' and status <> 'archive'`;
        await t`delete from public.emails where prospect_id = ${p.id} and sent_at is null and status in ('a_valider', 'valide', 'annule')`;
      });
    }
  }

  const titre = `${APPLIQUER ? "Appliqué" : "SIMULATION (rien modifié)"} : ${changes} métier(s) à corriger sur ${prospects.length} artisans RGE pas encore contactés`;
  const resume = [
    `## ${titre}`,
    `Codes NAF lus dans l'annuaire : ${nafLus} ; introuvables : ${sansNaf}.`,
    "## Par changement",
    ...Object.entries(parPassage).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} : ${n}`),
    "## Détail",
    ...lignes,
  ];
  console.log(resume.join("\n"));
  for (let i = 0; i < resume.length && i < 9 * 40; i += 40) {
    console.log(`::notice title=Métiers ${i / 40 + 1}::${resume.slice(i, i + 40).join("%0A").replace(/::/g, ": :")}`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, resume.join("\n") + "\n");
} catch (err) {
  console.error((err as Error).message);
  console.log(`::error title=Métiers::${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
