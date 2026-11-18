// 18/11, EN LECTURE SEULE (demande de Broise) : quel type d'e-mail (version A, B, C, avec ou sans photo, relance) a amené
// chaque ouverture de maquette. L'e-mail retenu = le dernier parti vers l'artisan avant l'ouverture.
// Dépôt PUBLIC : uniquement des chiffres, jamais un nom, une ville ou une adresse dans ce journal.
// Lancé par « ouvertures-type » en 1re ligne de tests/compteur.txt.
import { connecter } from "./lib/db.ts";

const TRENTE_MIN = 30 * 60 * 1000;
const sql = connecter();
try {
  const envois = await sql<{ prospect_id: string; sent_at: Date; variant: string | null; relance: boolean; photo: boolean }[]>`
    select prospect_id, sent_at, variant, relance_de is not null relance, coalesce(with_image, false) photo
    from public.emails where sent_at is not null and is_demo = false order by sent_at`;
  const visites = await sql<{ prospect_id: string; debut: Date }[]>`
    select w.prospect_id, v.debut from public.maquette_visites v join public.websites w on w.id = v.website_id
    where w.kind = 'demo' and w.is_demo = false order by v.debut`;
  // Ouvertures d'avant le 5/11 (sans visite mesurée) : seule la 1re est datée.
  const anciennes = await sql<{ prospect_id: string; premiere_vue: Date }[]>`
    select w.prospect_id, w.premiere_vue from public.websites w
    where w.kind = 'demo' and w.is_demo = false and w.premiere_vue is not null and w.premiere_vue < '2026-11-05'
      and not exists (select 1 from public.maquette_visites v where v.website_id = w.id and v.debut <= w.premiere_vue + interval '30 minutes')`;

  const type = (e: { variant: string | null; relance: boolean; photo: boolean }) =>
    e.relance ? "relance" : `version ${e.variant ?? "?"}${e.photo ? " + photo" : ""}`;
  const parProspect = new Map<string, (typeof envois)[number][]>();
  for (const e of envois) parProspect.set(e.prospect_id, [...(parProspect.get(e.prospect_id) ?? []), e]);

  // Ouvertures = visites regroupées par 30 min (comme le compteur), par artisan.
  const ouvertures: { prospect_id: string; t: number }[] = [];
  const dernier = new Map<string, number>();
  for (const v of visites) {
    const t = v.debut.getTime();
    if (t - (dernier.get(v.prospect_id) ?? -Infinity) >= TRENTE_MIN) ouvertures.push({ prospect_id: v.prospect_id, t });
    dernier.set(v.prospect_id, t);
  }
  for (const a of anciennes) ouvertures.push({ prospect_id: a.prospect_id, t: a.premiere_vue.getTime() });

  const stats = new Map<string, { envoyes: number; ouvertures: number; artisans: Set<string> }>();
  const s = (k: string) => stats.get(k) ?? (stats.set(k, { envoyes: 0, ouvertures: 0, artisans: new Set() }), stats.get(k)!);
  for (const e of envois) s(type(e)).envoyes++;
  let sansEmail = 0;
  for (const o of ouvertures) {
    const avant = (parProspect.get(o.prospect_id) ?? []).filter((e) => e.sent_at.getTime() <= o.t).at(-1);
    if (!avant) { sansEmail++; continue; }
    const x = s(type(avant));
    x.ouvertures++;
    x.artisans.add(o.prospect_id);
  }
  console.log("type d'e-mail | e-mails partis | ouvertures amenées | artisans différents | taux (artisans / e-mails)");
  for (const [k, v] of [...stats].sort()) {
    console.log(`${k} | ${v.envoyes} | ${v.ouvertures} | ${v.artisans.size} | ${v.envoyes ? ((100 * v.artisans.size) / v.envoyes).toFixed(1) : "-"} %`);
  }
  console.log(`ouvertures sans e-mail parti avant (essais, liens copiés) | ${sansEmail}`);
  console.log(`total ouvertures | ${ouvertures.length} | artisans | ${new Set(ouvertures.map((o) => o.prospect_id)).size}`);
  // Relances : combien sont parties depuis assez longtemps, et parmi les artisans relancés, combien ont ouvert après.
  const relances = envois.filter((e) => e.relance);
  console.log(`relances parties | ${relances.length} | dont avant le ${new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10)} | ${relances.filter((e) => e.sent_at.getTime() < Date.now() - 2 * 864e5).length}`);
} finally { await sql.end(); }
