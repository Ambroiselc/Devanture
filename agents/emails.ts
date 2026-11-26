// =====================================================================
// Valérie, l'agente qui rédige les e-mails de prospection (phase 4)
//
// Pour chaque prospect qui a sa maquette (Sid) et une adresse e-mail, et qu'on n'a jamais contacté :
//   1. vérifie qu'il n'est pas sur la liste d'opposition ;
//   2. fait rédiger le premier e-mail par Claude Haiku, en version A ou C (test des approches ; B arrêtée le 13/11) ;
//   3. ajoute la signature et les mentions obligatoires (d'où vient l'adresse, « répondez STOP ») ;
//   4. enregistre l'e-mail « à valider » dans la table « emails ».
// RIEN N'EST ENVOYÉ : Broise relit, corrige et valide chaque e-mail sur la page « Valérie ».
//
// Lancement : page « Valérie » du tableau de bord, ou GitHub > Actions > « Valérie ».
// Test sans Internet ni clés : DEVANTURE_SIMULATION=1 sur une base locale.
// =====================================================================
import { parseArgs } from "node:util";
import { connecter, type Sql } from "./lib/db.ts";
import { MODELE } from "./lib/haiku.ts";
import { SIMULATION } from "./lib/http.ts";
import { assemblerEmail, redigerEmail, type Variante } from "./lib/redaction-email.ts";
import { METIERS_INDEPENDANTS } from "./lib/cible.ts";
import { VARIANTES_ACTIVES } from "./lib/variantes-email.ts";
import { relire as relireCoco, renvois } from "./lib/coco.ts";
import { ajouterResume } from "./lib/sortie-publique.ts";

const PLAFOND = 30; // e-mails rédigés au maximum par lancement à la main
// « --tout » (chaîne automatique après Loïc et Sid, 28/10) : toutes les maquettes prêtes sans e-mail, sans limite de nombre,
// mais Valérie ne commence plus de nouvel e-mail après DUREE_MAX_TOUT_MIN minutes (le reste au passage suivant).
// Le budget IA reste vérifié avant chaque e-mail. Rien n'est envoyé : l'envoi garde son propre rythme.
const PLAFOND_TOUT = 500;
const DUREE_MAX_TOUT_MIN = 15;
const MAX_ERREURS_DE_SUITE = 3;

const { values: args } = parseArgs({
  options: {
    limite: { type: "string", default: "" },
    // Chaîne automatique : tous les e-mails à rédiger (limité en temps, voir DUREE_MAX_TOUT_MIN).
    tout: { type: "boolean", default: false },
    // Facultatif : rédiger seulement l'e-mail de ce prospect (son identifiant).
    prospect: { type: "string", default: "" },
    // Réécrit, avec les consignes actuelles, tous les e-mails encore « à valider » (même version A/B, même image).
    reecrire: { type: "boolean", default: false },
    // Avec --reecrire : prend aussi les e-mails validés pas encore envoyés ; ils repassent « à valider ».
    valides: { type: "boolean", default: false },
    // 13/11 : réécrit en version C les e-mails en version B pas encore envoyés (à valider ou validés), sans photo.
    "b-en-c": { type: "boolean", default: false },
  },
});

const PLAFOND_REECRITURE = 200;
// --b-en-c : tous les B en attente (environ 300 le 13/11), en s'arrêtant après DUREE_MAX_B_EN_C_MIN (reprise au lancement suivant).
const PLAFOND_B_EN_C = 1000;
const DUREE_MAX_B_EN_C_MIN = 35;

interface Reglages {
  display_name: string;
  enabled: boolean;
  default_limit: number;
  instructions: string | null;
  signature: string | null;
}

interface ProspectEmail {
  id: string;
  campaign_id: string | null;
  name: string;
  category: string | null;
  city: string | null;
  email: string;
  email_source: string | null;
  current_website: string | null;
  website_quality: string | null;
  score_reason: string | null;
  website_id: string;
  /** Nom affiché sur la maquette (nettoyé par Sid), à reprendre dans l'e-mail. */
  nom_affiche: string | null;
  notes?: string | null;
}

async function journal(sql: Sql, taskId: string, level: "info" | "warning" | "error", message: string) {
  console.log(`[${level}] ${message}`);
  await sql`insert into public.task_events (task_id, level, message, is_demo)
            values (${taskId}, ${level}, ${message}, ${SIMULATION})`;
}

/**
 * Réécriture (27/10) : chaque e-mail encore « à valider » est rédigé à nouveau avec les consignes actuelles,
 * pour la même maquette, dans la même version (A/B) et avec le même choix d'image. Il reste « à valider ».
 * Avec --valides, les e-mails validés mais pas encore envoyés sont réécrits aussi et repassent « à valider ».
 * Les e-mails envoyés ou rejetés ne sont jamais touchés.
 */
/**
 * 3/11 : Coco relit les e-mails « à valider » juste après leur rédaction (plutôt qu'au début de chaque vague d'envoi).
 * Elle prend aussi ceux qu'elle n'a pas encore lus (rédigés avant, ou laissés au passage précédent faute de temps).
 * Si elle est en pause (interrupteur « Pilote automatique » sur /coco) ou échoue, les e-mails attendent Broise.
 */
async function relectureCoco(sql: Sql, taskId: string): Promise<number> {
  try {
    const [coco] = await sql<{ enabled: boolean; instructions: string | null }[]>`
      select enabled, instructions from public.agent_settings where agent = 'coco'`;
    if (!coco?.enabled) return 0;
    const rel = await relireCoco(sql, {
      max: 80, taskId, consignes: coco.instructions, finAuPlusTard: Date.now() + 8 * 60_000,
      journal: (niveau, message) => journal(sql, taskId, niveau, message),
    });
    if (rel.relus) {
      await journal(sql, taskId, "info", `Coco a relu ${rel.relus} e-mail(s) : ${rel.ok} validé(s), ${rel.corriges} corrigé(s) puis validé(s), ${rel.gardes} gardé(s) pour Broise${renvois(rel)}.`);
    }
    if (rel.arret) await journal(sql, taskId, "warning", rel.arret);
    const texte = `## Coco : relecture\n\nRelus : **${rel.relus}** · Validés : ${rel.ok} · Corrigés puis validés : ${rel.corriges} · Gardés pour Broise : ${rel.gardes} · Coût IA : ${rel.cout_ia_eur.toFixed(4)} €${rel.arret ? `\n\n**Arrêt :** ${rel.arret}` : ""}`;
    console.log(texte);
    ajouterResume(`${texte}\n`);
    return rel.renvoyes_valerie ?? 0;
  } catch (err) {
    await journal(sql, taskId, "warning", `Coco n'a pas pu relire : ${(err as Error).message}`);
    return 0;
  }
}

/**
 * 19/11 (demande de Broise) : quand Coco renvoie des e-mails à Valérie, Valérie les réécrit tout de suite et Coco les
 * relit aussitôt, dans le même passage, au lieu d'attendre le passage suivant (6 h plus tard). Au plus 2 tours de plus :
 * de toute façon, au 3e renvoi pour le même artisan, Coco l'écarte (MAX_RENVOIS dans lib/coco.ts).
 */
const TOURS_REECRITURE = 2;

async function reecrire(sql: Sql, r: Reglages, signature: string) {
  const bEnC = Boolean(args["b-en-c"]);
  const bilan = { reecrits: 0, opposes: 0, erreurs: 0, cout_ia_eur: 0, arret: undefined as string | undefined };
  let tokensEntree = 0;
  let tokensSortie = 0;
  const liste = await sql<(ProspectEmail & { email_id: string; variant: Variante | null })[]>`
    select e.id as email_id, e.variant, p.id, p.campaign_id, p.name, p.category, p.city, p.email, p.email_source,
           p.current_website, p.website_quality, p.score_reason, e.website_id, w.content->>'nom' as nom_affiche
    from public.emails e
    join public.prospects p on p.id = e.prospect_id
    left join public.websites w on w.id = e.website_id
    where e.status in ${sql(args.valides || bEnC ? ["a_valider", "valide"] : ["a_valider"])} and p.email is not null
      and e.sent_at is null and e.relance_de is null
      ${bEnC ? sql`and e.variant = 'B'` : sql``}
    order by e.created_at
    limit ${bEnC ? PLAFOND_B_EN_C : PLAFOND_REECRITURE}`;
  if (liste.length === 0) {
    console.log(bEnC ? "Aucun e-mail en version B à réécrire." : "Aucun e-mail « à valider » : rien à réécrire.");
    return;
  }
  const [tache] = await sql<{ id: string }[]>`
    insert into public.tasks (agent, title, status, input, attempts, started_at, is_demo)
    values ('email', ${bEnC ? `${r.display_name} : ${liste.length} e-mail(s) B réécrits en version C` : `${r.display_name} : réécriture de ${liste.length} e-mail(s) à valider`}, 'en_cours',
            ${sql.json({ reecrire: true, b_en_c: bEnC, modele: MODELE })}, 1, now(), ${SIMULATION})
    returning id`;
  const taskId = tache.id;
  let erreursDeSuite = 0;
  const finAuPlusTard = bEnC ? Date.now() + DUREE_MAX_B_EN_C_MIN * 60_000 : Infinity;
  try {
    for (const [i, p] of liste.entries()) {
      if (Date.now() > finAuPlusTard) {
        bilan.arret = `Temps maximum atteint : ${liste.length - i} e-mail(s) B restent à réécrire (relancer « B en C »).`;
        await journal(sql, taskId, "info", bilan.arret);
        break;
      }
      const [budget] = await sql<{ depasse: boolean }[]>`select depasse from public.ai_budget_status`;
      if (budget?.depasse) {
        bilan.arret = "Budget IA du mois atteint : arrêt.";
        await journal(sql, taskId, "warning", bilan.arret);
        break;
      }
      const [{ oppose }] = await sql<{ oppose: boolean }[]>`select public.is_opposed(${p.email}) as oppose`;
      if (oppose) { bilan.opposes++; continue; }
      try {
        const red = await redigerEmail(
          {
            nom: p.nom_affiche || p.name,
            metier: p.category ?? "artisan",
            commune: p.city ?? "votre secteur",
            qualiteSite: p.website_quality,
            siteActuel: p.current_website,
            raison: p.score_reason,
          },
          bEnC ? "C" : p.variant === "B" ? "C" : p.variant ?? "A",
          r.instructions,
        );
        tokensEntree += red.tokensEntree;
        tokensSortie += red.tokensSortie;
        bilan.cout_ia_eur = Math.round((bilan.cout_ia_eur + red.coutEur) * 1e6) / 1e6;
        const corps = assemblerEmail(red.texte, signature, p.email, p.email_source);
        const variante: Variante = bEnC || p.variant === "B" ? "C" : p.variant ?? "A";
        await sql.begin(async (tx) => {
          // Un e-mail validé dont le texte change doit être relu : il repasse « à valider ». Plus de photo (13/11).
          await tx`update public.emails set subject = ${red.objet}, body = ${corps}, status = 'a_valider',
                     variant = ${variante}, with_image = false
                   where id = ${p.email_id} and status in ('a_valider', 'valide') and sent_at is null`;
          await tx`insert into public.costs (task_id, campaign_id, provider, category, amount_eur, description, is_demo)
                   values (${taskId}, ${p.campaign_id}, 'anthropic', 'api', ${red.coutEur},
                           ${`Réécriture d'e-mail (${MODELE}) : ${p.name}`}, ${SIMULATION})`;
        });
        bilan.reecrits++;
        erreursDeSuite = 0;
      } catch (err) {
        bilan.erreurs++;
        erreursDeSuite++;
        await journal(sql, taskId, "error", `${p.name} : ${(err as Error).message}`);
        if (erreursDeSuite >= MAX_ERREURS_DE_SUITE) throw new Error(`${MAX_ERREURS_DE_SUITE} erreurs de suite : arrêt par sécurité.`);
      }
      await sql`update public.tasks set output = ${sql.json(bilan as never)}, tokens_input = ${tokensEntree},
                tokens_output = ${tokensSortie} where id = ${taskId}`;
    }
    await sql`update public.tasks set status = 'terminee', finished_at = now(), output = ${sql.json(bilan as never)},
              tokens_input = ${tokensEntree}, tokens_output = ${tokensSortie} where id = ${taskId}`;
    await journal(sql, taskId, "info", `${bilan.reecrits} e-mail(s) réécrit(s), toujours à valider.`);
    await relectureCoco(sql, taskId);
  } catch (err) {
    const message = (err as Error).message;
    await sql`update public.tasks set status = 'echouee', finished_at = now(), error_message = ${message},
              output = ${sql.json(bilan as never)} where id = ${taskId}`;
    throw err;
  } finally {
    const texte = `## ${r.display_name} : réécriture\n\nRéécrits : **${bilan.reecrits}** sur ${liste.length} · Erreurs : ${bilan.erreurs} · Coût IA : ${bilan.cout_ia_eur.toFixed(4)} €${bilan.arret ? `\n\n**Arrêt :** ${bilan.arret}` : ""}`;
    console.log(texte);
    ajouterResume(`${texte}\n`);
  }
}

async function main() {
  const sql = connecter();
  const bilan = { emails: 0, version_a: 0, version_c: 0, opposes: 0, erreurs: 0, cout_ia_eur: 0, arret: undefined as string | undefined };
  let taskId: string | null = null;
  let tokensEntree = 0;
  let tokensSortie = 0;
  let nom = "Valérie";

  try {
    const [r] = await sql<Reglages[]>`
      select display_name, enabled, default_limit, instructions, signature
      from public.agent_settings where agent = 'email'`;
    if (!r) throw new Error("Réglages de Valérie introuvables : exécute la migration 20261023010000_valerie.sql dans Supabase.");
    nom = r.display_name;
    if (!r.enabled) {
      console.log(`${nom} est en pause (page « ${nom} » du tableau de bord) : rien à faire.`);
      return;
    }
    const signature = r.signature?.trim() || "Devanture";
    if (args.reecrire || args["b-en-c"]) {
      await reecrire(sql, r, signature);
      return;
    }
    const limite = args.tout ? PLAFOND_TOUT : Math.min(PLAFOND, Math.max(1, Number.parseInt(args.limite!, 10) || r.default_limit));
    const finAuPlusTard = args.tout ? Date.now() + DUREE_MAX_TOUT_MIN * 60_000 : Infinity;

    // Prospects avec maquette prête et e-mail, jamais contactés (aucun e-mail en dehors des erreurs).
    // Tours suivants (19/11) : seulement ceux que Coco vient de renvoyer (note « [Coco] » sans e-mail en cours).
    const choisir = (renvoyesSeulement: boolean) => sql<ProspectEmail[]>`
      select p.id, p.campaign_id, p.name, p.category, p.city, p.email, p.email_source,
             p.current_website, p.website_quality, p.score_reason, p.notes, w.id as website_id, w.nom_affiche
      from public.prospects p
      join lateral (
        select id, content->>'nom' as nom_affiche from public.websites
        where prospect_id = p.id and kind = 'demo' and status in ('pret', 'publie') and content is not null
        order by created_at desc limit 1
      ) w on true
      where p.status = 'demo_prete' and p.email is not null
        and not exists (select 1 from public.emails e where e.prospect_id = p.id and e.status <> 'erreur')
        ${args.prospect ? sql`and p.id = ${args.prospect}` : sql``}
        ${renvoyesSeulement ? sql`and p.notes like '%[Coco] %'` : sql``}
      order by (p.category = any(${[...METIERS_INDEPENDANTS]})) desc, p.score desc nulls last, p.created_at
      limit ${limite}`;
    let prospects = await choisir(false);

    if (prospects.length === 0) {
      console.log("Aucun prospect avec maquette prête à contacter : rien à faire.");
      return;
    }

    // Versions déjà utilisées : on équilibre les versions actives (A et C depuis le 13/11). Plus aucune photo (13/11 :
    // 0 maquette ouverte sur 105 premiers e-mails avec photo, contre 10 sur 120 sans).
    const compte: Record<Variante, number> = { A: 0, B: 0, C: 0 };
    for (const v of await sql<{ variant: Variante; n: number }[]>`
      select variant, count(*)::int as n from public.emails
      where variant is not null and relance_de is null and created_at >= '2026-11-13' group by 1`) {
      compte[v.variant] += v.n;
    }

    const [tache] = await sql<{ id: string }[]>`
      insert into public.tasks (agent, title, status, input, attempts, started_at, is_demo)
      values ('email', ${`${nom} : ${prospects.length} e-mail(s) à rédiger`}, 'en_cours',
              ${sql.json({ limite, modele: MODELE })}, 1, now(), ${SIMULATION})
      returning id`;
    taskId = tache.id;

    let erreursDeSuite = 0;
    for (let tour = 0; ; tour++) {
    for (const [i, p] of prospects.entries()) {
      if (Date.now() > finAuPlusTard) {
        bilan.arret = `Temps maximum atteint (${DUREE_MAX_TOUT_MIN} min) : ${prospects.length - i} e-mail(s) au prochain passage.`;
        await journal(sql, taskId, "info", bilan.arret);
        break;
      }
      const [budget] = await sql<{ depasse: boolean }[]>`select depasse from public.ai_budget_status`;
      if (budget?.depasse) {
        bilan.arret = "Budget IA du mois atteint : arrêt.";
        await journal(sql, taskId, "warning", bilan.arret);
        break;
      }
      const [{ oppose }] = await sql<{ oppose: boolean }[]>`select public.is_opposed(${p.email}) as oppose`;
      if (oppose) {
        bilan.opposes++;
        await journal(sql, taskId, "info", `${p.name} : sur la liste d'opposition, pas d'e-mail.`);
        continue;
      }

      try {
        const variante: Variante = VARIANTES_ACTIVES.reduce((m, v) => (compte[v] < compte[m] ? v : m), VARIANTES_ACTIVES[0]);
        const image = false;
        const red = await redigerEmail(
          {
            nom: p.nom_affiche || p.name,
            metier: p.category ?? "artisan",
            commune: p.city ?? "votre secteur",
            qualiteSite: p.website_quality,
            siteActuel: p.current_website,
            raison: p.score_reason,
            // 30/10 : remarque de Coco quand elle a renvoyé l'e-mail précédent à Valérie (ligne « [Coco] … » des notes).
            remarque: p.notes?.split("\n").filter((l) => l.startsWith("[Coco]")).pop()?.replace("[Coco]", "").trim() || null,
          },
          variante,
          r.instructions,
        );
        tokensEntree += red.tokensEntree;
        tokensSortie += red.tokensSortie;
        bilan.cout_ia_eur = Math.round((bilan.cout_ia_eur + red.coutEur) * 1e6) / 1e6;

        const corps = assemblerEmail(red.texte, signature, p.email, p.email_source);
        await sql.begin(async (tx) => {
          await tx`insert into public.emails (prospect_id, campaign_id, website_id, subject, body, status, variant, with_image, is_demo)
                   values (${p.id}, ${p.campaign_id}, ${p.website_id}, ${red.objet}, ${corps}, 'a_valider', ${variante}, ${image}, ${SIMULATION})`;
          await tx`insert into public.costs (task_id, campaign_id, provider, category, amount_eur, description, is_demo)
                   values (${taskId}, ${p.campaign_id}, 'anthropic', 'api', ${red.coutEur},
                           ${`E-mail de prospection (${MODELE}) : ${p.name}`}, ${SIMULATION})`;
        });
        compte[variante]++;
        bilan.emails++;
        if (variante === "A") bilan.version_a++;
        else bilan.version_c++;
        erreursDeSuite = 0;
        await journal(sql, taskId, "info", `${p.name} : e-mail rédigé (version ${variante}, ${image ? "avec" : "sans"} image), à valider.`);
      } catch (err) {
        bilan.erreurs++;
        erreursDeSuite++;
        await journal(sql, taskId, "error", `${p.name} : ${(err as Error).message}`);
        if (erreursDeSuite >= MAX_ERREURS_DE_SUITE) throw new Error(`${MAX_ERREURS_DE_SUITE} erreurs de suite : arrêt par sécurité.`);
      }
      await sql`update public.tasks set output = ${sql.json(bilan as never)}, tokens_input = ${tokensEntree},
                tokens_output = ${tokensSortie} where id = ${taskId}`;
    }

    // Coco relit ce qui vient d'être écrit ; ce qu'elle renvoie à Valérie est réécrit puis relu dans la foulée.
    const renvoyes = await relectureCoco(sql, taskId);
    if (!renvoyes || tour >= TOURS_REECRITURE || bilan.arret || Date.now() > finAuPlusTard) break;
    prospects = await choisir(true);
    if (prospects.length === 0) break;
    await journal(sql, taskId, "info", `Coco a renvoyé ${renvoyes} e-mail(s) : ${nom} réécrit ${prospects.length} e-mail(s) tout de suite (tour ${tour + 2}).`);
    }

    await sql`update public.tasks set status = 'terminee', finished_at = now(), output = ${sql.json(bilan as never)},
              tokens_input = ${tokensEntree}, tokens_output = ${tokensSortie} where id = ${taskId}`;
  } catch (err) {
    const message = (err as Error).message;
    console.error(message);
    if (taskId) {
      await sql`update public.tasks set status = 'echouee', finished_at = now(), error_message = ${message},
                output = ${sql.json(bilan as never)} where id = ${taskId}`;
    }
    process.exitCode = 1;
  } finally {
    const texte = [
      `## ${nom} : e-mails${SIMULATION ? " (simulation)" : ""}`,
      "",
      `E-mails rédigés : **${bilan.emails}** (A : ${bilan.version_a}, C : ${bilan.version_c}) · Sur liste d'opposition : ${bilan.opposes} · Erreurs : ${bilan.erreurs} · Coût IA : ${bilan.cout_ia_eur.toFixed(4)} €`,
      bilan.arret ? `\n**Arrêt :** ${bilan.arret}` : "",
      "",
      `Rien n'est envoyé : les e-mails attendent ta validation sur la page « ${nom} ».`,
    ].join("\n");
    console.log(texte);
    ajouterResume(`${texte}\n`);
    await sql.end();
  }
}

await main();
