// Retire des ouvertures de maquettes celles des robots (13/11, demande de Broise) : Microsoft 365 ouvre les liens de
// chaque e-mail reçu depuis ses serveurs pour les vérifier, et était compté comme un artisan qui ouvre sa maquette.
// Source : journaux du Worker devanture-app (POST /m/<slug>, réseau cf.asn ; gardés depuis le 7/11 environ).
// Pour chaque groupe d'appels d'un robot sur une maquette (appels à moins de 30 min les uns des autres = une
// « ouverture » au sens de public.maquette_vue) : supprime les visites mesurées de ce moment-là (maquette_visites,
// ± 2 min) et, s'il y en avait, enlève 1 au compteur websites.vues, puis recalcule première et dernière ouverture.
// Relançable sans danger : un groupe déjà nettoyé n'a plus de visite, donc plus rien n'est retiré.
// Rien n'est perdu : chaque groupe retiré est gardé dans maquette_visites_robots (visites + ouverture enlevée) ;
// « remettre » en 2e mot de la 1re ligne de tests/compteur.txt remet tout comme avant.
// Affiche aussi les appels venus de Netskope (proxy de sécurité d'entreprise : vraie personne ou robot, à juger).
// Lancé par diag-compteur.yml (« robots-maquettes » en 1re ligne de tests/compteur.txt).
import { connecter } from "./lib/db.ts";
import { lireReseau } from "../lib/reseau.ts";

if (process.argv[2] === "remettre") {
  const sql0 = connecter();
  try {
    await sql0.begin(async (tx) => {
      const lignes = await tx<{ id: string; website_id: string; vues_retirees: number; visites: { visite: string; debut: string; fin: string; duree_s: number; appareil: string | null }[] }[]>`
        select id, website_id, vues_retirees, visites from public.maquette_visites_robots`;
      for (const l of lignes) {
        for (const v of l.visites) await tx`insert into public.maquette_visites (website_id, visite, debut, fin, duree_s, appareil)
          values (${l.website_id}, ${v.visite}, ${v.debut}, ${v.fin}, ${v.duree_s}, ${v.appareil}) on conflict do nothing`;
        await tx`update public.websites w set vues = w.vues + ${l.vues_retirees},
            premiere_vue = least(coalesce(w.premiere_vue, 'infinity'), (select min(v.debut) from public.maquette_visites v where v.website_id = w.id)),
            derniere_vue = greatest(coalesce(w.derniere_vue, '-infinity'), (select max(v.debut) from public.maquette_visites v where v.website_id = w.id))
          where w.id = ${l.website_id}`;
        await tx`delete from public.maquette_visites_robots where id = ${l.id}`;
      }
      console.log(`::notice title=Robots des maquettes::${lignes.length} ouverture(s) remise(s)`);
    });
  } finally { await sql0.end(); }
  process.exit(0);
}
const cle = process.env.CLOUDFLARE_API_TOKEN, compte = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!cle || !compte) throw new Error("CLOUDFLARE_API_TOKEN ou CLOUDFLARE_ACCOUNT_ID manquant.");
const DEBUT = Date.parse("2026-10-30T00:00:00+01:00");
const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${compte}/workers/observability/telemetry/query`, {
  method: "POST", headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
  body: JSON.stringify({ queryId: "robots-maquettes", view: "events", limit: 2000, timeframe: { from: DEBUT, to: Date.now() },
    parameters: { filters: [
      { key: "$metadata.service", operation: "eq", type: "string", value: "devanture-app" },
      { key: "$workers.event.request.url", operation: "includes", type: "string", value: "/m/" },
    ] } }),
});
const json = (await r.json().catch(() => null)) as any;
if (!json?.success) { console.log(`::error title=Robots des maquettes::journaux indisponibles (${r.status})`); process.exit(1); }
const quand = (t: number | Date) => new Date(t).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const robots = new Map<string, number[]>();
let premierJournal = Date.now();
const netskope: string[] = [];
const reseauDe = new Map<string, string>();
for (const e of (json.result?.events?.events ?? []) as any[]) {
  const req = e.$workers?.event?.request ?? {};
  if ((req.method ?? "") !== "POST") continue;
  const t = Number(e.timestamp ?? e.$metadata?.timestamp ?? 0);
  let slug = "";
  try { slug = new URL(String(req.url)).pathname.replace(/^\/m\//, "").replace(/\/$/, ""); } catch { continue; }
  if (!t || !slug) continue;
  premierJournal = Math.min(premierJournal, t);
  const cf = req.cf ?? {};
  if (Number(cf.asn) === 55256) netskope.push(`${quand(t)} | ${slug} | ${cf.city ?? "?"} ${cf.country ?? ""} | ${String(req.headers?.["user-agent"] ?? "").slice(0, 70)}`);
  if (lireReseau(cf).robot) { robots.set(slug, [...(robots.get(slug) ?? []), t]); reseauDe.set(slug, String(cf.asOrganization ?? cf.asn ?? "?")); }
}
console.log(`Journaux gardés depuis le ${quand(premierJournal)}. Maquettes visitées par des robots : ${robots.size}`);

const sql = connecter();
const bilan: string[] = [];
try {
  for (const [slug, temps] of robots) {
    temps.sort((a, b) => a - b);
    const groupes: number[][] = [];
    for (const t of temps) {
      const g = groupes[groupes.length - 1];
      if (g && t - g[g.length - 1] < 30 * 60_000) g.push(t); else groupes.push([t]);
    }
    await sql.begin(async (tx) => {
      const [w] = await tx<{ id: string; name: string; vues: number }[]>`select w.id, p.name, w.vues from public.websites w
        join public.prospects p on p.id = w.prospect_id where w.slug = ${slug} and w.kind = 'demo'`;
      if (!w) return;
      let retires = 0;
      for (const g of groupes) {
        const sup = await tx`delete from public.maquette_visites where website_id = ${w.id}
          and debut between ${new Date(g[0] - 120_000)} and ${new Date(g[g.length - 1] + 120_000)}
          returning visite, debut, fin, duree_s, appareil`;
        if (sup.length > 0) {
          retires++;
          await tx`insert into public.maquette_visites_robots (website_id, moment, reseau, vues_retirees, visites)
            values (${w.id}, ${new Date(g[0])}, ${reseauDe.get(slug) ?? null}, 1, ${tx.json(sup as never)})`;
        }
      }
      if (!retires) return;
      await tx`update public.websites w set vues = greatest(w.vues - ${retires}, 0) where w.id = ${w.id}`;
      // Première et dernière ouverture : d'après les visites qui restent ; s'il n'en reste aucune mesurée mais que le
      // compteur n'est pas à 0 (ouverture d'avant le 5/11, sans durée), on garde la première date connue.
      await tx`update public.websites w set
          premiere_vue = case when w.vues = 0 then null
            else least(coalesce((select min(v.debut) from public.maquette_visites v where v.website_id = w.id), w.premiere_vue),
                       case when w.premiere_vue < ${new Date(premierJournal)} then w.premiere_vue end) end,
          derniere_vue = case when w.vues = 0 then null
            else coalesce((select max(v.debut) from public.maquette_visites v where v.website_id = w.id), w.premiere_vue) end
        where w.id = ${w.id}`;
      const [apres] = await tx<{ vues: number }[]>`select vues from public.websites where id = ${w.id}`;
      bilan.push(`${w.name} : ${w.vues} → ${apres.vues} ouverture(s) (robot : ${groupes.map((g) => quand(g[0])).join(", ")})`);
    });
  }
  console.log("## Ouvertures retirées");
  for (const b of bilan) console.log(b);
  if (!bilan.length) console.log("Rien à retirer (déjà fait).");
  console.log("## Appels venus de Netskope (proxy de sécurité d'entreprise), laissés comptés");
  for (const n of netskope) console.log(n);
  const [tot] = await sql<{ n: number }[]>`select count(*)::int n from public.websites w join public.prospects p on p.id = w.prospect_id
    where w.kind = 'demo' and w.vues > 0 and w.is_demo = false`;
  console.log(`::notice title=Robots des maquettes::${bilan.length} maquette(s) corrigée(s) ; ${tot.n} maquettes encore ouvertes au moins une fois`);
} catch (err) {
  console.log(`::error title=Robots des maquettes::${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
