// =====================================================================
// Coco, l'agente superviseuse (30/10).
//   • Pilote automatique (lib/coco.ts) : elle relit les e-mails de Valérie juste après leur rédaction (3/11 ; agents/emails.ts)
//     et les relances juste après leur préparation, au début de chaque vague
//     d'envoi (agents/envoi.ts) ; ce qui est propre est validé, le reste attend Broise sur la page /coco.
//   • Bilan quotidien (ce script, workflow agent-coco.yml, chaque soir vers 18 h 15) : envois, réponses, STOP,
//     rebonds, maquettes ouvertes, ce qu'elle a relu, et des ALERTES classées (urgent / à regarder / pour info).
//     Rangé dans coco_rapports et affiché sur /coco. Ne change rien, sauf avec --relire.
//   • --relire N : relit tout de suite N e-mails « à valider » (au plus 300), sans attendre la vague suivante.
// =====================================================================
import { parseArgs } from "node:util";
import { appendFileSync } from "node:fs";
import { connecter, type Sql } from "./lib/db.ts";
import { SIMULATION } from "./lib/http.ts";
import { relire, renvois } from "./lib/coco.ts";

const { values: args } = parseArgs({ options: { relire: { type: "string", default: "" }, "revoir-gardes": { type: "boolean", default: false } } });

type Niveau = "urgent" | "attention" | "info";
interface Alerte { niveau: Niveau; texte: string; lien?: string }

/** Une requête qui peut échouer si une migration n'est pas encore appliquée : on garde la valeur par défaut. */
async function ou<T>(q: PromiseLike<readonly T[]>, defaut: T[]): Promise<readonly T[]> {
  try { return await q; } catch { return defaut; }
}

async function bilanDuJour(sql: Sql) {
  const debut = sql`(date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')`;
  const demo = SIMULATION;

  const [envois] = await sql<{ aujourdhui: number; total: number; j7: number; rebonds7: number; plaintes7: number }[]>`
    select count(*) filter (where sent_at >= ${debut})::int aujourdhui, count(*)::int total,
           count(*) filter (where sent_at > now() - interval '7 days')::int j7,
           count(*) filter (where sent_at > now() - interval '7 days' and delivery_status in ('bounced', 'adresse_invalide'))::int rebonds7,
           count(*) filter (where sent_at > now() - interval '7 days' and delivery_status = 'complained')::int plaintes7
    from public.emails where sent_at is not null and is_demo = ${demo}`;
  const [reponses] = await sql<{ aujourdhui: number; total: number; interesses: number }[]>`
    select count(*) filter (where created_at >= ${debut})::int aujourdhui, count(*)::int total,
           count(*) filter (where category in ('interesse', 'rendez_vous', 'question', 'client'))::int interesses
    from public.mailbox_messages
    where direction = 'entrant' and prospect_id is not null and not auto_submitted
      and coalesce(category, '') not in ('automatique', 'spam', 'chauffe') and is_demo = ${demo}`;
  const [opp] = await sql<{ stop: number; rebonds: number }[]>`
    select count(*) filter (where reason in ('desinscription', 'refus'))::int stop,
           count(*) filter (where reason = 'adresse_invalide')::int rebonds
    from public.opposition_list where created_at >= ${debut}`;
  const [stock] = await sql<{ valides: number; relances: number; a_valider: number; gardes: number }[]>`
    select count(*) filter (where status = 'valide' and relance_de is null)::int valides,
           count(*) filter (where status = 'valide' and relance_de is not null)::int relances,
           count(*) filter (where status = 'a_valider' and coco_le is null)::int a_valider,
           count(*) filter (where status = 'a_valider' and coco_verdict = 'garde')::int gardes
    from public.emails where is_demo = ${demo}`;
  const coco = await sql<{ verdict: string; n: number }[]>`
    select coco_verdict verdict, count(*)::int n from public.emails
    where coco_le >= ${debut} and is_demo = ${demo} group by 1`;
  const relus = Object.fromEntries(coco.map((c) => [c.verdict, c.n])) as Record<string, number>;
  const [ines] = await sql<{ a_traiter: number; brouillons: number }[]>`
    select count(*) filter (where direction = 'entrant' and status = 'a_traiter')::int a_traiter,
           count(*) filter (where direction = 'sortant' and status = 'a_valider')::int brouillons
    from public.mailbox_messages where is_demo = ${demo}`;
  const [vues] = await ou(sql<{ ouvertes: number; total: number }[]>`
    select count(*) filter (where derniere_vue >= ${debut})::int ouvertes, count(*) filter (where vues > 0)::int total
    from public.websites where kind = 'demo' and is_demo = ${demo}`, [{ ouvertes: 0, total: 0 }]);
  const echecs = await sql<{ agent: string; n: number; message: string | null }[]>`
    select agent, count(*)::int n, max(error_message) message from public.tasks
    where status = 'echouee' and created_at > now() - interval '24 hours' and is_demo = ${demo} group by 1`;
  const [budget] = await sql<{ budget_eur: number; spent_eur: number; depasse: boolean; alert_ratio: number }[]>`
    select budget_eur::float budget_eur, spent_eur::float spent_eur, depasse, alert_ratio::float alert_ratio from public.ai_budget_status`;
  const [reglages] = await sql<{ send_enabled: boolean; enabled: boolean }[]>`
    select send_enabled, enabled from public.agent_settings where agent = 'email'`;
  const [derniereVague] = await sql<{ output: { quota?: number } | null }[]>`
    select output from public.tasks where agent = 'email' and input->>'envoi' = 'true' and created_at >= ${debut}
    order by created_at desc limit 1`;
  const quota = derniereVague?.output?.quota ?? 0;
  const [paiements] = await ou(sql<{ a_rattacher: number }[]>`
    select count(*)::int a_rattacher from public.paiements_stripe where statut = 'a_rattacher'`, [{ a_rattacher: 0 }]);
  const [migr] = await sql<{ relances: boolean; clients: boolean }[]>`
    select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'emails' and column_name = 'relance_de') relances,
           exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'clients') clients`;

  const jourOuvre = (() => {
    const j = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", weekday: "short" }).format(new Date());
    return !["Sat", "Sun"].includes(j);
  })();

  const alertes: Alerte[] = [];
  // Urgent : ce qui coûte un client ou la réputation des boîtes.
  if (ines.a_traiter + ines.brouillons > 0) {
    alertes.push({ niveau: "urgent", lien: "/ines",
      texte: `${ines.a_traiter + ines.brouillons} message(s) d'artisans t'attendent (${ines.brouillons} réponse(s) d'Inès à valider, ${ines.a_traiter} à traiter). Une réponse rapide compte beaucoup.` });
  }
  // 13/11 : artisans qui ont cliqué « Ce site m'intéresse » et que Broise n'a pas encore marqués traités.
  const interesses = await sql<{ n: number }[]>`select count(*)::int n from public.maquette_interets where traite_le is null`
    .catch(() => [{ n: 0 }]);
  if (interesses[0].n > 0) alertes.push({ niveau: "urgent", lien: "/#interesses",
    texte: `${interesses[0].n} artisan(s) ont cliqué « Ce site m'intéresse » sur leur maquette : recontacte-les (puis « Marquer traité »).` });
  if (envois.plaintes7 > 0) alertes.push({ niveau: "urgent", lien: "/valerie", texte: `${envois.plaintes7} signalement(s) de spam en 7 jours : relis le message et ralentis si ça se répète.` });
  const tauxRebonds = envois.j7 >= 20 ? envois.rebonds7 / envois.j7 : 0;
  if (tauxRebonds > 0.03) alertes.push({ niveau: "urgent", lien: "/valerie", texte: `Rebonds à ${(tauxRebonds * 100).toFixed(1)} % sur 7 jours (au-dessus de 3 %) : le rythme est divisé par deux, vérifie la qualité des adresses de Loïc.` });
  if (budget?.depasse) alertes.push({ niveau: "urgent", lien: "/", texte: "Budget IA du mois atteint : les agents (et Coco) sont à l'arrêt jusqu'au 1er du mois, ou jusqu'à ce que tu montes le budget." });

  // À regarder.
  if (stock.gardes > 0) alertes.push({ niveau: "attention", lien: "/coco", texte: `${stock.gardes} e-mail(s) gardé(s) par Coco : un doute à trancher (valider, corriger ou rejeter).` });
  for (const e of echecs) {
    alertes.push({ niveau: "attention", lien: "/taches", texte: `${e.n} échec(s) en 24 h pour l'agent « ${e.agent} »${e.message ? ` : ${e.message.slice(0, 140)}` : ""}.` });
  }
  if (jourOuvre && reglages?.send_enabled && reglages.enabled && envois.aujourdhui === 0 && stock.valides + stock.relances > 0) {
    alertes.push({ niveau: "attention", lien: "/valerie", texte: "Aucun e-mail parti aujourd'hui alors qu'il y en a de validés : regarde les vagues d'envoi (page Tâches)." });
  }
  if (!reglages?.send_enabled) alertes.push({ niveau: "attention", lien: "/valerie", texte: "L'envoi est coupé sur la page Valérie." });
  if (quota > 0 && stock.valides + stock.a_valider < quota * 2) {
    alertes.push({ niveau: "attention", lien: "/loic", texte: `Il reste moins de 2 jours d'e-mails prêts (${stock.valides} validés, ${stock.a_valider} à relire, quota ${quota}/jour) : Loïc doit trouver de nouveaux artisans.` });
  }
  if (budget && !budget.depasse && budget.spent_eur >= budget.budget_eur * (budget.alert_ratio || 0.8)) {
    alertes.push({ niveau: "attention", lien: "/", texte: `Budget IA : ${budget.spent_eur.toFixed(2)} € dépensés sur ${budget.budget_eur} € ce mois-ci.` });
  }
  if (paiements.a_rattacher > 0) alertes.push({ niveau: "attention", lien: "/clients", texte: `${paiements.a_rattacher} paiement(s) Stripe à rattacher à un client.` });
  if (!migr.relances) alertes.push({ niveau: "attention", texte: "Migration 20261030010000_relances_et_vues.sql pas encore appliquée : pas de relances ni de compteur de visites." });
  if (!migr.clients) alertes.push({ niveau: "attention", texte: "Migrations des clients (20261029…) pas encore appliquées : les paiements ne créent pas de fiche client." });

  // Pour info.
  if (vues.ouvertes > 0) alertes.push({ niveau: "info", lien: "/valerie", texte: `${vues.ouvertes} maquette(s) ouverte(s) aujourd'hui : ces artisans ont regardé, leur relance partira en priorité.` });
  if (opp.stop > 0) alertes.push({ niveau: "info", texte: `${opp.stop} STOP aujourd'hui (mis sur la liste d'opposition).` });

  const chiffres = {
    envoyes_aujourdhui: envois.aujourdhui, envoyes_total: envois.total, quota,
    reponses_aujourdhui: reponses.aujourdhui, reponses_total: reponses.total, reponses_utiles: reponses.interesses,
    stop_aujourdhui: opp.stop, rebonds_7j: envois.rebonds7, envoyes_7j: envois.j7, plaintes_7j: envois.plaintes7,
    maquettes_ouvertes_aujourdhui: vues.ouvertes, maquettes_ouvertes_total: vues.total,
    coco_ok: relus.ok ?? 0, coco_corriges: relus.corrige ?? 0, coco_gardes: relus.garde ?? 0,
    stock_valides: stock.valides, stock_relances: stock.relances, stock_a_relire: stock.a_valider, gardes_en_attente: stock.gardes,
    ines_a_traiter: ines.a_traiter, ines_brouillons: ines.brouillons,
    budget_ia_depense: budget?.spent_eur ?? 0, budget_ia: budget?.budget_eur ?? 0,
  };
  const urgent = alertes.filter((a) => a.niveau === "urgent").length;
  const resume = [
    `${envois.aujourdhui} e-mail(s) envoyé(s) aujourd'hui${quota ? ` sur ${quota}` : ""}, ${reponses.aujourdhui} réponse(s) d'artisans.`,
    `Coco a validé ${chiffres.coco_ok + chiffres.coco_corriges} e-mail(s) (dont ${chiffres.coco_corriges} corrigé(s)) et en a gardé ${chiffres.coco_gardes}.`,
    urgent ? `${urgent} point(s) urgent(s).` : alertes.length ? "Rien d'urgent." : "Tout roule.",
  ].join(" ");
  return { chiffres, alertes, resume };
}

async function main() {
  const sql = connecter();
  let taskId: string | null = null;
  try {
    const [r] = await sql<{ enabled: boolean; instructions: string | null }[]>`
      select enabled, instructions from public.agent_settings where agent = 'coco'`;
    if (!r) throw new Error("Réglages de Coco introuvables : applique la migration 20261030020000_coco.sql (workflow « Appliquer une migration »).");

    const n = Math.min(300, Number.parseInt(args.relire ?? "", 10) || 0);
    const [t] = await sql<{ id: string }[]>`
      insert into public.tasks (agent, title, status, input, attempts, started_at, is_demo)
      values ('coco', ${n ? `Coco : relecture de ${n} e-mail(s)` : "Coco : bilan du jour"}, 'en_cours',
              ${sql.json({ relire: n || null, bilan: !n })}, 1, now(), ${SIMULATION})
      returning id`;
    taskId = t.id;
    const journal = async (niveau: "info" | "warning" | "error", message: string) => {
      console.log(`[${niveau}] ${message}`);
      await sql`insert into public.task_events (task_id, level, message, is_demo) values (${taskId}, ${niveau}, ${message}, ${SIMULATION})`;
    };

    // --revoir-gardes (30/10) : les e-mails qu'elle a gardés repassent dans sa relecture (après un changement de ses consignes).
    if (args["revoir-gardes"]) {
      const remis = await sql`update public.emails set coco_verdict = null, coco_avis = null, coco_le = null
                              where status = 'a_valider' and coco_verdict = 'garde' and is_demo = ${SIMULATION}`;
      await journal("info", `${remis.count} e-mail(s) gardé(s) remis en relecture.`);
    }
    if (n) {
      if (!r.enabled) {
        await journal("warning", "Pilote automatique en pause (page Coco) : rien n'est relu.");
      } else {
        const b = await relire(sql, { max: n, taskId, consignes: r.instructions, finAuPlusTard: Date.now() + 40 * 60_000, journal });
        await journal("info", `${b.relus} relu(s) : ${b.ok} validé(s), ${b.corriges} corrigé(s) puis validé(s), ${b.gardes} gardé(s) pour Broise${renvois(b)}. Coût IA : ${b.cout_ia_eur.toFixed(4)} €.`);
        if (b.arret) await journal("warning", b.arret);
        await sql`update public.tasks set output = ${sql.json(b as never)} where id = ${taskId}`;
      }
    }

    const { chiffres, alertes, resume } = await bilanDuJour(sql);
    await sql`
      insert into public.coco_rapports (jour, chiffres, alertes, resume, is_demo)
      values ((now() at time zone 'Europe/Paris')::date, ${sql.json(chiffres)}, ${sql.json(alertes as never)}, ${resume}, ${SIMULATION})
      on conflict (jour) do update set chiffres = excluded.chiffres, alertes = excluded.alertes, resume = excluded.resume, updated_at = now()`;
    await sql`update public.tasks set status = 'terminee', finished_at = now(),
              output = coalesce(output, '{}'::jsonb) || ${sql.json({ resume, alertes: alertes.length })} where id = ${taskId}`;

    const icone: Record<Niveau, string> = { urgent: "🔴", attention: "🟠", info: "🔵" };
    const texte = [
      "## Coco : bilan du jour", "", resume, "",
      ...(alertes.length ? alertes.map((a) => `- ${icone[a.niveau]} ${a.texte}`) : ["Aucune alerte."]),
    ].join("\n");
    console.log(texte);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${texte}\n`);
  } catch (err) {
    const message = (err as Error).message;
    console.error(message);
    if (taskId) await sql`update public.tasks set status = 'echouee', finished_at = now(), error_message = ${message} where id = ${taskId}`;
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

await main();
