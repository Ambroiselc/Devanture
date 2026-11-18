// =====================================================================
// Loïc, l'agent de prospection (phase 2)
//
// Pour un métier (plombier, électricien, couvreur…) et une commune de la métropole lilloise :
//   1. cherche les artisans visibles sur Google (« plombier Tourcoing »… : 20 fiches par requête) ;
//   2. saute ceux déjà connus, vérifie les autres dans l'annuaire officiel des entreprises (SIRET) ;
//   3. visite leur site actuel pour juger son âge et trouver leur e-mail ;
//   4. fait noter chaque artisan par Claude Haiku ;
//   5. enregistre le résultat dans la table « prospects ».
// Rien n'est envoyé à personne : l'agent prépare une liste que tu valides.
//
// Lancement : page « Loïc » du tableau de bord, ou GitHub > Actions > « Loïc ».
// Ses réglages (pause, plafonds, seuils, consignes) se changent sur la page « Loïc ».
// Test sans Internet ni clés : DEVANTURE_SIMULATION=1 (voir docs/agent-prospection.md).
// =====================================================================
import { parseArgs } from "node:util";
import { appendFileSync } from "node:fs";
import { chercherDansAnnuaire, nafParSiret, type EntrepriseAnnuaire } from "./lib/annuaire.ts";
import { connecter, type Sql, sansNul } from "./lib/db.ts";
import { MODELE, noter } from "./lib/haiku.ts";
import { SIMULATION } from "./lib/http.ts";
import { lireCommune, type Commune } from "./lib/geo.ts";
import { findMetier } from "./lib/metiers.ts";
import { metierArtisan } from "./lib/metier-artisan.ts";
import { dansLaCommune, detailsFiche, rechercherIds, type FicheGoogle } from "./lib/places.ts";
import { choisirAutomatiquement, lireReglages, PLAFOND_PAR_LANCEMENT, type Reglages } from "./lib/reglages.ts";
import { analyserSite } from "./lib/site.ts";
import { entreprisesRge, entreprisesRgeDepartement, estArtisanRge, SOURCE_EMAIL_RGE, type EntrepriseRge } from "./lib/rge.ts";
import { COMMUNES_PLUS_TARD, LISTE_COMMUNES, TOUTES_COMMUNES_MEL } from "./lib/metiers.ts";

// Garde-fous fixes (les autres se règlent sur la page « Loïc », dans des limites dures).
const MAX_ERREURS_DE_SUITE = 3;
const PAGES_PAR_RECHERCHE = 3; // Google ne donne pas plus de 3 pages de 20 résultats

const { values: args } = parseArgs({
  options: {
    metier: { type: "string", default: "plombier" },
    commune: { type: "string", default: "59599" },
    limite: { type: "string", default: "" },
    campagne: { type: "string", default: "" },
    // Lancement planifié (2 vagues par jour, 7 jours sur 7) : une tournée, seulement si le mode automatique est activé.
    auto: { type: "boolean", default: false },
    // Tournée lancée à la main (bouton de la page « Loïc ») : 5 métiers d'un coup.
    tournee: { type: "boolean", default: false },
    // Renotation des prospects déjà connus avec le barème du 25/10 (le nombre d'avis compte très peu).
    renoter: { type: "boolean", default: false },
    // Méthode « RGE d'abord » : artisans de la liste officielle RGE (ADEME), qui ont déjà un e-mail.
    rge: { type: "boolean", default: false },
  },
});

interface Bilan {
  /** Fiches nouvelles examinées (une note de Claude chacune). */
  candidats: number;
  fiches_vues: number;
  deja_connus: number;
  hors_commune: number;
  pas_du_metier: number;
  avec_siret: number;
  requetes_annuaire: number;
  /** Fiches Google lues en détail (payantes au-delà du quota gratuit) : c'est ce qui compte pour les plafonds. */
  requetes_google: number;
  /** Recherches « identifiants seulement » (gratuites et illimitées). */
  recherches_google: number;
  /** Fiches hors de la commune cherchée : mémorisées pour ne pas les relire. */
  hors_commune_ids: string[];
  avec_vrai_site: number;
  avec_email: number;
  qualifies: number;
  a_joindre_autrement: number;
  ecartes: number;
  opposes: number;
  erreurs: number;
  cout_ia_eur: number;
  arret?: string;
}

async function journal(sql: Sql, taskId: string, level: "info" | "warning" | "error", message: string, details?: object) {
  console.log(`[${level}] ${message}`);
  await sql`insert into public.task_events (task_id, level, message, details, is_demo)
            values (${taskId}, ${level}, ${message}, ${details ? sql.json(details as never) : null}, ${SIMULATION})`;
}

/**
 * Début du comptage en « fiches lues » (Place Details, quota gratuit de 1 000 par mois chez Google).
 * Avant cette date, « requetes_google » comptait des recherches complètes, facturées sur un autre quota :
 * on ne les mélange pas, sinon Loïc s'arrêterait avant d'avoir utilisé ses fiches gratuites du mois.
 */
export const DEBUT_FICHES_GOOGLE = "2026-10-25T18:00:00Z";

/** Fiches Google lues aujourd'hui et ce mois-ci (heure de Paris), toutes exécutions confondues. */
async function compteurGoogle(sql: Sql) {
  const [r] = await sql<{ jour: number; mois: number }[]>`
    select
      coalesce(sum((output->>'requetes_google')::int) filter (
        where started_at >= (date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')), 0)::int as jour,
      coalesce(sum((output->>'requetes_google')::int) filter (
        where started_at >= (date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')), 0)::int as mois
    from public.tasks
    where agent = 'prospection' and output ? 'requetes_google' and started_at >= ${DEBUT_FICHES_GOOGLE}`;
  return r;
}

async function budgetDepasse(sql: Sql) {
  const [b] = await sql<{ depasse: boolean; spent_eur: string; budget_eur: string }[]>`
    select depasse, spent_eur, budget_eur from public.ai_budget_status`;
  return b ?? { depasse: false, spent_eur: "0", budget_eur: "0" };
}

/** Nombre de métiers prospectés à chaque tournée (lancement automatique ou bouton « Tournée »). */
export const METIERS_PAR_TOURNEE = 5;

async function main() {
  const sql = connecter();
  try {
    const reglages = await lireReglages(sql);
    if (!reglages.actif) {
      console.log(`${reglages.nom} est en pause (page « ${reglages.nom} » du tableau de bord) : rien à faire.`);
      return;
    }
    if (args.auto && !reglages.auto) {
      console.log("Lancement automatique désactivé sur la page de l'agent : rien à faire.");
      return;
    }

    if (args.renoter) {
      await renoter(sql, reglages);
      return;
    }
    // Vague automatique : finit d'abord une renotation interrompue (plafond Google atteint), s'il en reste une.
    if (args.auto) await renoter(sql, reglages);

    const limiteDemandee = args.auto ? NaN : Number.parseInt(args.limite!, 10);
    const limite = Math.min(PLAFOND_PAR_LANCEMENT, Math.max(1, limiteDemandee || reglages.limiteParDefaut));

    // Méthode RGE seule (bouton « Tournée RGE » ou GitHub).
    if (args.rge) {
      await prospecterRge(sql, reglages, limite, "manuel");
      return;
    }

    // Lancement simple : un métier, une commune.
    if (!args.auto && !args.tournee) {
      await prospecter(sql, reglages, { metier: args.metier!, commune: args.commune! }, limite, "manuel");
      return;
    }

    // Vague automatique (27/10) : « RGE d'abord, Google en complément ».
    // La liste RGE (gratuite, ≈ 50 % de qualifiés) passe en premier. Google ne sert qu'à compléter
    // ce qu'elle n'a pas pu fournir (zone épuisée, artisans sans label RGE comme beaucoup de paysagistes).
    let fichesGoogle = limite;
    if (args.auto) {
      const rge = await prospecterRge(sql, reglages, limite, "automatique");
      if (rge.budgetAtteint) return;
      fichesGoogle = limite - rge.candidats;
      if (fichesGoogle < METIERS_PAR_TOURNEE) {
        console.log(`La liste RGE a fourni ${rge.candidats} fiche(s) sur ${limite} : pas besoin de Google cette fois.`);
        return;
      }
      console.log(`La liste RGE a fourni ${rge.candidats} fiche(s) sur ${limite} : Google complète avec ${fichesGoogle}.`);
    }

    // Tournée Google : Loïc choisit lui-même 5 couples métier + commune (voir choisirAutomatiquement)
    // et partage le nombre de fiches entre eux (20 fiches = 4 par métier).
    const couples = await choisirAutomatiquement(sql, reglages, METIERS_PAR_TOURNEE);
    if (couples.length === 0) {
      console.log("Tous les métiers cochés sont épuisés dans toutes les communes cochées (Google).");
      return;
    }
    const parCouple = Math.max(1, Math.floor(fichesGoogle / METIERS_PAR_TOURNEE));
    const mode = args.auto ? "automatique" : "tournée";
    console.log(`Tournée de ${couples.length} métier(s), ${parCouple} fiche(s) chacun.`);
    for (const couple of couples) {
      const { stop } = await prospecter(sql, reglages, couple, parCouple, mode);
      if (stop) break;
    }
  } finally {
    await sql.end();
  }
}

/** Une prospection : un métier dans une commune, suivie comme une tâche. */
async function prospecter(
  sql: Sql,
  reglages: Reglages,
  choix: { metier: string; commune: string },
  limite: number,
  mode: "manuel" | "tournée" | "automatique",
): Promise<{ stop: boolean }> {
  const metier = findMetier(choix.metier);
  const codeCommune = choix.commune;
  const commune = await lireCommune(codeCommune);
  const nomCampagne = args.campagne || "Artisans du bâtiment — Métropole lilloise";

  const bilan: Bilan = {
    candidats: 0, fiches_vues: 0, deja_connus: 0, hors_commune: 0, pas_du_metier: 0, avec_siret: 0,
    requetes_annuaire: 0, requetes_google: 0, recherches_google: 0, hors_commune_ids: [], avec_vrai_site: 0, avec_email: 0, qualifies: 0,
    a_joindre_autrement: 0, ecartes: 0, opposes: 0, erreurs: 0, cout_ia_eur: 0,
  };
  let tokensEntree = 0;
  let tokensSortie = 0;
  let taskId: string | null = null;

  try {
    // 1. Campagne (créée au premier lancement)
    let [campagne] = await sql<{ id: string }[]>`select id from public.campaigns where name = ${nomCampagne} limit 1`;
    if (!campagne) {
      [campagne] = await sql<{ id: string }[]>`
        insert into public.campaigns (name, description, status, target_city, target_category, started_at, is_demo)
        values (${nomCampagne}, 'Créée par l''agent de prospection.', 'en_cours', ${commune.nom},
                'Artisans du bâtiment', now(), ${SIMULATION})
        returning id`;
    }

    // 2. Tâche : chaque lancement est suivi dans la page « Tâches »
    const [tache] = await sql<{ id: string }[]>`
      insert into public.tasks (agent, title, status, campaign_id, input, attempts, started_at, is_demo)
      values ('prospection', ${`${reglages.nom} : ${metier.label} à ${commune.nom} (${limite} max${mode !== "manuel" ? `, ${mode}` : ""})`},
              'en_cours', ${campagne.id},
              ${sql.json({ metier: metier.id, commune: codeCommune, limite, modele: MODELE, mode, methode: "google_d_abord" })},
              1, now(), ${SIMULATION})
      returning id`;
    taskId = tache.id;
    const sauver = () => sql`
      update public.tasks set output = ${sql.json(bilan as never)}, tokens_input = ${tokensEntree},
             tokens_output = ${tokensSortie} where id = ${taskId}`;
    await sauver();

    // 3. Fiches Google déjà connues : on ne les paie pas deux fois en notes
    const connues = new Set(
      (await sql<{ id: string }[]>`select google_place_id as id from public.prospects where google_place_id is not null`)
        .map((r) => r.id),
    );
    // … ni les fiches déjà vues hors de leur commune (mémorisées dans les tâches précédentes).
    for (const r of await sql<{ id: string }[]>`
      select jsonb_array_elements_text(output->'hors_commune_ids') as id
      from public.tasks where agent = 'prospection' and jsonb_typeof(output->'hors_commune_ids') = 'array'`) {
      connues.add(r.id);
    }

    // 4. Les recherches Google, page par page, jusqu'à la limite de fiches nouvelles
    let erreursDeSuite = 0;
    recherches: for (const recherche of metier.recherches) {
      let pageToken: string | undefined;
      for (let page = 1; page <= PAGES_PAR_RECHERCHE; page++) {
        if (bilan.candidats >= limite) break recherches;

        const arret = await verifierGardeFous(sql, reglages);
        if (arret) {
          bilan.arret = arret;
          await journal(sql, taskId, "warning", arret);
          break recherches;
        }

        // Temps 1 : recherche « identifiants seulement », gratuite et illimitée chez Google.
        const { ids, suivante } = await rechercherIds(recherche, commune, pageToken);
        bilan.recherches_google++;
        await sauver();

        for (const placeId of ids) {
          if (bilan.candidats >= limite) break;
          bilan.fiches_vues++;
          if (connues.has(placeId)) { bilan.deja_connus++; continue; }
          connues.add(placeId);

          // Temps 2 : la fiche complète, seulement pour un artisan jamais vu (c'est elle qui compte dans le quota).
          const arretFiche = await verifierGardeFous(sql, reglages);
          if (arretFiche) {
            bilan.arret = arretFiche;
            await journal(sql, taskId, "warning", arretFiche);
            break recherches;
          }
          if ((await budgetDepasse(sql)).depasse) {
            bilan.arret = "Budget IA du mois atteint : arrêt.";
            await journal(sql, taskId, "warning", bilan.arret);
            break recherches;
          }

          let nom = placeId;
          try {
            const fiche = await detailsFiche(placeId);
            bilan.requetes_google++;
            nom = fiche.nom || placeId;
            if (!dansLaCommune(fiche, commune)) {
              // Mémorisé dans la tâche : on ne relira pas cette fiche (et on ne la repaiera pas) aux prochaines vagues.
              bilan.hors_commune++;
              bilan.hors_commune_ids.push(placeId);
            } else {
              await traiter(sql, taskId, campagne.id, reglages, metier.label, metier.naf, codeCommune, commune, fiche, bilan, (e, s) => {
                tokensEntree += e;
                tokensSortie += s;
              });
            }
            erreursDeSuite = 0;
          } catch (err) {
            bilan.erreurs++;
            erreursDeSuite++;
            await journal(sql, taskId, "error", `${nom} : ${(err as Error).message}`);
            if (erreursDeSuite >= MAX_ERREURS_DE_SUITE) {
              throw new Error(`${MAX_ERREURS_DE_SUITE} erreurs de suite : arrêt par sécurité.`);
            }
          }
          await sauver();
        }

        if (!suivante) break;
        pageToken = suivante;
      }
    }

    if (bilan.candidats === 0 && !bilan.arret) {
      bilan.arret = `Plus de nouveaux artisans pour ce métier à ${commune.nom} : ceux que Google montre sont déjà dans tes prospects ou hors de la commune.`;
      await journal(sql, taskId, "info", bilan.arret);
    }

    await sql`update public.tasks set status = 'terminee', finished_at = now(),
              output = ${sql.json(bilan as never)}, tokens_input = ${tokensEntree}, tokens_output = ${tokensSortie}
              where id = ${taskId}`;
    await journal(sql, taskId, "info", "Prospection terminée.", bilan);
    // Budget ou plafond Google atteint : inutile de continuer la tournée.
    return { stop: Boolean(bilan.arret && !bilan.arret.startsWith("Plus de nouveaux")) };
  } catch (err) {
    const message = (err as Error).message;
    console.error(message);
    if (taskId) {
      await sql`update public.tasks set status = 'echouee', finished_at = now(), error_message = ${message},
                output = ${sql.json(bilan as never)}, tokens_input = ${tokensEntree}, tokens_output = ${tokensSortie}
                where id = ${taskId}`;
      await journal(sql, taskId, "error", message);
    }
    process.exitCode = 1;
    return { stop: true };
  } finally {
    resume(reglages, metier.label, commune.nom, bilan);
  }
}

/** Budget IA et plafonds Google : renvoie la raison de l'arrêt, ou null si on peut continuer. */
async function verifierGardeFous(sql: Sql, reglages: Reglages): Promise<string | null> {
  const budget = await budgetDepasse(sql);
  if (budget.depasse) return `Budget IA du mois atteint (${budget.spent_eur} € / ${budget.budget_eur} €).`;
  const google = await compteurGoogle(sql);
  if (google.jour >= reglages.maxGoogleJour || google.mois >= reglages.maxGoogleMois) {
    return `Plafond de fiches Google atteint (${google.jour}/${reglages.maxGoogleJour} aujourd'hui, ${google.mois}/${reglages.maxGoogleMois} ce mois-ci).`;
  }
  return null;
}

/** Communes parcourues par la méthode RGE, dans l'ordre (les 10 premières, puis les 35 suivantes de la métropole). */
const COMMUNES_RGE = [...LISTE_COMMUNES, ...COMMUNES_PLUS_TARD].map(([code]) => code);

/**
 * Élargissement automatique (27/10) : quand la métropole n'a plus de nouvelles entreprises RGE, Loïc continue
 * département par département, dans cet ordre : le reste du Nord, les Hauts-de-France, la Normandie et le
 * Grand Est proches, puis l'Île-de-France. Les entreprises déjà vues (SIRET) ne sont jamais reprises.
 */
const DEPARTEMENTS_SUIVANTS: [code: string, nom: string][] = [
  ["59", "Nord"], ["62", "Pas-de-Calais"], ["80", "Somme"], ["02", "Aisne"], ["60", "Oise"],
  ["76", "Seine-Maritime"], ["08", "Ardennes"], ["51", "Marne"], ["27", "Eure"], ["14", "Calvados"],
  ["95", "Val-d'Oise"], ["77", "Seine-et-Marne"], ["78", "Yvelines"], ["91", "Essonne"],
  ["93", "Seine-Saint-Denis"], ["94", "Val-de-Marne"], ["92", "Hauts-de-Seine"], ["75", "Paris"],
];

/** Les zones à parcourir, dans l'ordre : chaque commune de la métropole, puis chaque département suivant. */
const ZONES_RGE: { nom: string; departement: boolean; charger: () => Promise<EntrepriseRge[]> }[] = [
  ...COMMUNES_RGE.map((code) => ({
    nom: TOUTES_COMMUNES_MEL[code] ?? code,
    departement: false,
    charger: async () => entreprisesRge((await lireCommune(code)).codesPostaux),
  })),
  ...DEPARTEMENTS_SUIVANTS.map(([code, nom]) => ({ nom, departement: true, charger: () => entreprisesRgeDepartement(code) })),
];

/**
 * Méthode « RGE d'abord » : part de la liste officielle des entreprises RGE (ADEME), qui donne déjà l'e-mail,
 * le site et le domaine de travaux. Commune après commune, Loïc prend les artisans qu'il ne connaît pas encore
 * (par SIRET), visite leur site, les fait noter par Claude et les enregistre. Aucune requête Google.
 */
async function prospecterRge(
  sql: Sql, reglages: Reglages, limite: number, mode: "manuel" | "automatique",
): Promise<{ candidats: number; budgetAtteint: boolean }> {
  const nomCampagne = args.campagne || "Artisans du bâtiment — Métropole lilloise";
  const bilan: Bilan = {
    candidats: 0, fiches_vues: 0, deja_connus: 0, hors_commune: 0, pas_du_metier: 0, avec_siret: 0,
    requetes_annuaire: 0, requetes_google: 0, recherches_google: 0, hors_commune_ids: [], avec_vrai_site: 0,
    avec_email: 0, qualifies: 0, a_joindre_autrement: 0, ecartes: 0, opposes: 0, erreurs: 0, cout_ia_eur: 0,
  };
  let tokensEntree = 0;
  let tokensSortie = 0;
  const communesVues: string[] = [];

  let [campagne] = await sql<{ id: string }[]>`select id from public.campaigns where name = ${nomCampagne} limit 1`;
  if (!campagne) {
    [campagne] = await sql<{ id: string }[]>`
      insert into public.campaigns (name, description, status, target_category, started_at, is_demo)
      values (${nomCampagne}, 'Créée par l''agent de prospection.', 'en_cours', 'Artisans du bâtiment', now(), ${SIMULATION})
      returning id`;
  }
  const [tache] = await sql<{ id: string }[]>`
    insert into public.tasks (agent, title, status, campaign_id, input, attempts, started_at, is_demo)
    values ('prospection', ${`${reglages.nom} : liste RGE (${limite} max${mode === "automatique" ? ", automatique" : ""})`},
            'en_cours', ${campagne.id}, ${sql.json({ methode: "rge", limite, modele: MODELE, mode })}, 1, now(), ${SIMULATION})
    returning id`;
  const taskId = tache.id;
  const sauver = () => sql`
    update public.tasks set output = ${sql.json({ ...bilan, communes: communesVues } as never)}, tokens_input = ${tokensEntree},
           tokens_output = ${tokensSortie} where id = ${taskId}`;

  try {
    const connus = new Set((await sql<{ siret: string }[]>`
      select siret from public.prospects where siret is not null`).map((r) => r.siret));
    let erreursDeSuite = 0;

    let annonce = false;
    communes: for (const zone of ZONES_RGE) {
      if (bilan.candidats >= limite) break;
      // 12/11 : une zone illisible (coupure réseau malgré les nouveaux essais) est sautée, pas tout le passage.
      let fiches: EntrepriseRge[];
      try {
        fiches = await zone.charger();
      } catch (err) {
        await journal(sql, taskId, "warning", `${zone.nom} : liste RGE illisible (${(err as Error).message}), zone sautée pour ce passage.`);
        continue;
      }
      const nouvelles = fiches.filter((e) => {
        bilan.fiches_vues++;
        if (connus.has(e.siret)) { bilan.deja_connus++; return false; }
        if (!estArtisanRge(e)) { connus.add(e.siret); bilan.pas_du_metier++; return false; }
        return true;
      });
      if (nouvelles.length === 0) continue;
      if (zone.departement && !annonce) {
        annonce = true;
        await journal(sql, taskId, "info", `Plus de nouvelles entreprises RGE dans la métropole : ${reglages.nom} continue dans le département ${zone.nom}.`);
      }
      communesVues.push(zone.nom);

      for (const e of nouvelles) {
        if (bilan.candidats >= limite) break communes;
        if ((await budgetDepasse(sql)).depasse) {
          bilan.arret = "Budget IA du mois atteint : arrêt.";
          await journal(sql, taskId, "warning", bilan.arret);
          break communes;
        }
        connus.add(e.siret);
        try {
          await traiterRge(sql, taskId, campagne.id, reglages, e, bilan, (a, b) => { tokensEntree += a; tokensSortie += b; });
          erreursDeSuite = 0;
        } catch (err) {
          bilan.erreurs++;
          erreursDeSuite++;
          await journal(sql, taskId, "error", `${e.nom} : ${(err as Error).message}`);
          if (erreursDeSuite >= MAX_ERREURS_DE_SUITE) throw new Error(`${MAX_ERREURS_DE_SUITE} erreurs de suite : arrêt par sécurité.`);
        }
        await sauver();
      }
    }

    if (bilan.candidats === 0 && !bilan.arret) {
      bilan.arret = "Plus de nouvelles entreprises RGE dans toutes les zones prévues (métropole puis 18 départements) : il faudra en ajouter.";
      await journal(sql, taskId, "info", bilan.arret);
    }
    await sql`update public.tasks set status = 'terminee', finished_at = now(),
              output = ${sql.json({ ...bilan, communes: communesVues } as never)}, tokens_input = ${tokensEntree},
              tokens_output = ${tokensSortie} where id = ${taskId}`;
    await journal(sql, taskId, "info", "Prospection RGE terminée.", bilan);
  } catch (err) {
    const message = (err as Error).message;
    console.error(message);
    await sql`update public.tasks set status = 'echouee', finished_at = now(), error_message = ${message},
              output = ${sql.json({ ...bilan, communes: communesVues } as never)} where id = ${taskId}`;
    process.exitCode = 1;
  } finally {
    resume(reglages, "Liste RGE", communesVues.join(", ") || "métropole lilloise", bilan);
  }
  return { candidats: bilan.candidats, budgetAtteint: /budget/i.test(bilan.arret ?? "") };
}

/** Un artisan de la liste RGE : visite du site, note par Claude, enregistrement. */
async function traiterRge(
  sql: Sql,
  taskId: string,
  campagneId: string,
  reglages: Reglages,
  e: EntrepriseRge,
  bilan: Bilan,
  compterTokens: (entree: number, sortie: number) => void,
) {
  bilan.candidats++;
  bilan.avec_siret++;
  // 10/11 : nom de l'entreprise, puis code NAF officiel, puis domaines RGE (voir lib/metier-artisan.ts).
  const naf = await nafParSiret(e.siret);
  const { metier } = metierArtisan({ nom: e.nom, naf, domaines: e.domaines });
  const site = e.site ? await analyserSite(e.site) : null;
  if (site?.repond) bilan.avec_vrai_site++;

  // Pour Claude, on présente l'entreprise comme une fiche (sans note ni avis : la liste RGE n'en a pas).
  const fiche: FicheGoogle = {
    placeId: "",
    nom: e.nom,
    adresse: `${e.adresse}, ${e.codePostal} ${e.commune}`,
    site: e.site,
    note: null,
    nbAvis: 0,
    statut: "OPERATIONAL",
    type: `Entreprise RGE : ${e.domaines.slice(0, 4).join(", ")}`,
    types: [],
  };
  const note = await noter(metier, fiche, site, [], reglages.consignes);
  compterTokens(note.tokensEntree, note.tokensSortie);
  bilan.cout_ia_eur = Math.round((bilan.cout_ia_eur + note.coutEur) * 1e6) / 1e6;
  await sql`insert into public.costs (task_id, campaign_id, provider, category, amount_eur, description, is_demo)
            values (${taskId}, ${campagneId}, 'anthropic', 'api', ${note.coutEur},
                    ${`Note de prospect RGE (${MODELE}) : ${e.nom}`}, ${SIMULATION})`;

  // L'e-mail de la liste RGE d'abord ; sinon celui trouvé sur le site.
  let email = e.email;
  let emailSource: string | null = email ? SOURCE_EMAIL_RGE : null;
  if (!email && site?.email) { email = site.email; emailSource = site.emailSource; }
  if (email) {
    const [{ oppose }] = await sql<{ oppose: boolean }[]>`select public.is_opposed(${email}) as oppose`;
    if (oppose) { bilan.opposes++; email = null; emailSource = null; }
  }

  let status: string;
  let raison = note.raison;
  if (!note.artisan) {
    bilan.pas_du_metier++;
    status = "ecarte";
    raison = `Pas un artisan du métier. ${note.raison}`;
  } else {
    status = note.score < reglages.scoreEcarte ? "ecarte" : note.score >= reglages.scoreQualifie && email ? "qualifie" : "nouveau";
  }
  if (status === "ecarte") { bilan.ecartes++; email = null; emailSource = null; }
  else if (status === "qualifie") bilan.qualifies++;
  else if (note.score >= reglages.scoreQualifie) bilan.a_joindre_autrement++;
  if (email) bilan.avec_email++;

  const ligne = {
    campaign_id: campagneId,
    name: e.nom,
    category: metier,
    address: e.adresse || null,
    city: e.commune || null,
    postal_code: e.codePostal || null,
    email,
    current_website: site?.repond ? site.url : null,
    has_website: Boolean(site?.repond),
    source: "Liste officielle des entreprises RGE (ADEME) + site",
    score: note.score,
    status,
    notes: email || status === "ecarte" ? null : "Pas d'e-mail trouvé.",
    siret: e.siret,
    naf_code: naf,
    google_place_id: null,
    website_quality: note.qualiteSite,
    email_source: emailSource,
    score_reason: raison,
    last_checked_at: new Date(),
    is_demo: SIMULATION,
  };
  const colonnes = Object.keys(ligne) as (keyof typeof ligne)[];
  await sql`insert into public.prospects ${sql(sansNul(ligne), colonnes)}
            on conflict (siret) where siret is not null do nothing`;
}

/**
 * Date du nouveau barème de notation (25/10/2026 : le nombre d'avis Google compte très peu).
 * Les prospects vérifiés avant cette date sont renotés ; ceux déjà renotés ne le sont pas deux fois,
 * donc une renotation interrompue (plafond Google, budget) reprend là où elle s'était arrêtée.
 */
const NOUVEAU_BAREME = "2026-10-25T18:00:00Z";
/** 26/10 : un site qui ne répond pas compte comme « pas de site ». Les prospects écartés pour ça sont renotés. */
const BAREME_SITE_INACCESSIBLE = "2026-10-26T08:30:00Z";
/** Renotations au plus par lancement (1 requête Google chacune) : laisse de la marge pour les vagues du jour. */
const MAX_RENOTATIONS = 150;

/**
 * Renote les prospects déjà connus avec le barème actuel : relit leur fiche Google (par son identifiant),
 * revisite leur site (pour retrouver l'e-mail d'un prospect écarté), refait la note par Claude.
 * Ne touche pas aux prospects déjà avancés (démo prête, contacté, client…) ni à ceux écartés pour une raison
 * qui ne dépend pas du score (pas un artisan, fermé, non diffusible, opposition).
 */
async function renoter(sql: Sql, reglages: Reglages) {
  const prospects = await sql<{
    id: string; name: string; category: string | null; status: string; email: string | null;
    email_source: string | null; google_place_id: string; campaign_id: string | null;
  }[]>`
    select id, name, category, status, email, email_source, google_place_id, campaign_id
    from public.prospects
    where google_place_id is not null
      and ((
            (last_checked_at is null or last_checked_at < ${NOUVEAU_BAREME})
            and (status in ('nouveau', 'qualifie')
                 or (status = 'ecarte' and score is not null
                     and coalesce(score_reason, '') not like 'Pas un artisan%'
                     and coalesce(score_reason, '') not like 'Fermé%'
                     and coalesce(score_reason, '') not like 'Entreprise « non diffusible »%'))
          ) or (
            status = 'ecarte' and last_checked_at < ${BAREME_SITE_INACCESSIBLE}
            and score_reason ~* '(inaccessible|ne répond|sans réponse|hors ligne|expiré|en panne)'
            and coalesce(score_reason, '') not like 'Pas un artisan%'
          ))
    order by score desc nulls last
    limit ${MAX_RENOTATIONS}`;

  if (prospects.length === 0) {
    console.log("Tous les prospects sont déjà notés avec le nouveau barème : rien à faire.");
    return;
  }

  const bilan: Bilan & { qualifies_avant: number; renotes: number } = {
    candidats: 0, fiches_vues: 0, deja_connus: 0, hors_commune: 0, pas_du_metier: 0, avec_siret: 0,
    requetes_annuaire: 0, requetes_google: 0, recherches_google: 0, hors_commune_ids: [], avec_vrai_site: 0, avec_email: 0, qualifies: 0,
    a_joindre_autrement: 0, ecartes: 0, opposes: 0, erreurs: 0, cout_ia_eur: 0,
    qualifies_avant: prospects.filter((p) => p.status === "qualifie").length, renotes: 0,
  };
  let tokensEntree = 0;
  let tokensSortie = 0;
  const [tache] = await sql<{ id: string }[]>`
    insert into public.tasks (agent, title, status, input, attempts, started_at, is_demo)
    values ('prospection', ${`${reglages.nom} : nouvelle notation de ${prospects.length} prospect(s)`}, 'en_cours',
            ${sql.json({ mode: "renotation", bareme: NOUVEAU_BAREME, modele: MODELE })}, 1, now(), ${SIMULATION})
    returning id`;
  const taskId = tache.id;
  const sauver = () => sql`
    update public.tasks set output = ${sql.json(bilan as never)}, tokens_input = ${tokensEntree},
           tokens_output = ${tokensSortie} where id = ${taskId}`;

  let erreursDeSuite = 0;
  try {
    for (const p of prospects) {
      const arret = await verifierGardeFous(sql, reglages);
      if (arret) {
        bilan.arret = `${arret} La renotation reprendra au prochain lancement.`;
        await journal(sql, taskId, "warning", bilan.arret);
        break;
      }
      try {
        const fiche = await detailsFiche(p.google_place_id);
        bilan.requetes_google++;
        bilan.candidats++;
        await sauver();

        let status: string;
        let score: number | null = null;
        let qualite: string | null = null;
        let raison: string;
        let siteUrl: string | null = null;
        let email: string | null = p.email;
        let emailSource: string | null = p.email_source;

        if (fiche.statut && fiche.statut !== "OPERATIONAL") {
          status = "ecarte";
          raison = "Fermé (temporairement ou définitivement) selon Google.";
        } else {
          const site = fiche.site ? await analyserSite(fiche.site) : null;
          if (site?.repond) bilan.avec_vrai_site++;
          const note = await noter(p.category ?? "artisan", fiche, site, [], reglages.consignes);
          tokensEntree += note.tokensEntree;
          tokensSortie += note.tokensSortie;
          bilan.cout_ia_eur = Math.round((bilan.cout_ia_eur + note.coutEur) * 1e6) / 1e6;
          await sql`insert into public.costs (task_id, campaign_id, provider, category, amount_eur, description, is_demo)
                    values (${taskId}, ${p.campaign_id}, 'anthropic', 'api', ${note.coutEur},
                            ${`Nouvelle note de prospect (${MODELE}) : ${p.name}`}, ${SIMULATION})`;
          score = note.score;
          qualite = note.qualiteSite;
          raison = note.raison;
          siteUrl = site?.repond ? site.url : null;
          if (site?.email) {
            email = site.email;
            emailSource = site.emailSource;
          }
          if (email) {
            const [{ oppose }] = await sql<{ oppose: boolean }[]>`select public.is_opposed(${email}) as oppose`;
            if (oppose) {
              bilan.opposes++;
              email = null;
              emailSource = null;
            }
          }
          if (!note.artisan) {
            bilan.pas_du_metier++;
            status = "ecarte";
            raison = `Pas un artisan du métier. ${note.raison}`;
          } else {
            status = note.score < reglages.scoreEcarte ? "ecarte"
              : note.score >= reglages.scoreQualifie && email ? "qualifie" : "nouveau";
          }
        }

        if (email) bilan.avec_email++;
        if (status === "ecarte") bilan.ecartes++;
        else if (status === "qualifie") bilan.qualifies++;
        else if ((score ?? 0) >= reglages.scoreQualifie) bilan.a_joindre_autrement++;
        // Prospect écarté : on ne garde pas son e-mail (on ne l'utilisera pas).
        if (status === "ecarte") {
          email = null;
          emailSource = null;
        }

        await sql`
          update public.prospects set
            status = ${status}, score = ${score}, website_quality = ${qualite}, score_reason = ${sansNul(raison)},
            current_website = ${sansNul(siteUrl)}, has_website = ${siteUrl !== null},
            email = ${sansNul(email)}, email_source = ${sansNul(emailSource)},
            notes = ${email || status === "ecarte" ? null : "Pas d'e-mail trouvé."},
            last_checked_at = now()
          where id = ${p.id} and status in ('nouveau', 'qualifie', 'ecarte')`;
        bilan.renotes++;
        erreursDeSuite = 0;
      } catch (err) {
        bilan.erreurs++;
        erreursDeSuite++;
        await journal(sql, taskId, "error", `${p.name} : ${(err as Error).message}`);
        if (erreursDeSuite >= MAX_ERREURS_DE_SUITE) throw new Error(`${MAX_ERREURS_DE_SUITE} erreurs de suite : arrêt par sécurité.`);
      }
      await sauver();
    }

    await sql`update public.tasks set status = 'terminee', finished_at = now(), output = ${sql.json(bilan as never)},
              tokens_input = ${tokensEntree}, tokens_output = ${tokensSortie} where id = ${taskId}`;
    await journal(sql, taskId, "info", `Nouvelle notation terminée : ${bilan.qualifies} qualifiés (avant : ${bilan.qualifies_avant}).`);
  } catch (err) {
    const message = (err as Error).message;
    console.error(message);
    await sql`update public.tasks set status = 'echouee', finished_at = now(), error_message = ${message},
              output = ${sql.json(bilan as never)} where id = ${taskId}`;
    process.exitCode = 1;
  } finally {
    const texte = [
      `## ${reglages.nom} : nouvelle notation${SIMULATION ? " (simulation)" : ""}`,
      "",
      `Prospects renotés : **${bilan.renotes}** sur ${prospects.length} · Qualifiés : **${bilan.qualifies}** (avant : ${bilan.qualifies_avant}) · Écartés : ${bilan.ecartes} · Erreurs : ${bilan.erreurs}`,
      `Fiches Google lues : ${bilan.requetes_google} · Coût IA : ${bilan.cout_ia_eur.toFixed(4)} €`,
      bilan.arret ? `\n**Arrêt :** ${bilan.arret}` : "",
    ].join("\n");
    console.log(texte);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${texte}\n`);
  }
}

/** Mots trop généraux pour retrouver une entreprise par son nom dans l'annuaire. */
const MOTS_GENERIQUES = /(?<!\p{L})(plomberie|plombier|chauffage|chauffagiste|sanitaire|sanitaires|[ée]lectricit[ée]|[ée]lectricien|[ée]lec|couverture|couvreur|toiture|toitures|zinguerie|charpente|b[aâ]timent|r[ée]novation|d[ée]pannage|peinture|peintre|menuiserie|menuisier|serrurerie|serrurier|ma[çc]onnerie|ma[çc]on|carrelage|carreleur|pl[aâ]trerie|pl[aâ]trier|plaquiste|climatisation|clim|paysagiste|paysages?|jardins?|espaces verts|services?|entreprise|ets|sarl|sas|sasu|eurl|et|de|du|des|la|le|les)(?!\p{L})/giu;

async function chercherEntreprise(nom: string, codeCommune: string, nomCommune: string, naf: string[], bilan: Bilan): Promise<EntrepriseAnnuaire[]> {
  bilan.requetes_annuaire++;
  const trouves = await chercherDansAnnuaire(nom, codeCommune, naf);
  if (trouves.length) return trouves;
  // « Plomberie Dupont » n'est souvent enregistrée que sous « Jean Dupont » : on réessaie avec « Dupont ».
  const court = nom.replace(MOTS_GENERIQUES, " ").replace(new RegExp(nomCommune.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ").replace(/[^\p{L}\p{N}' -]/gu, " ").replace(/\s+/g, " ").trim();
  if (court.length < 3 || court.toLowerCase() === nom.toLowerCase()) return [];
  bilan.requetes_annuaire++;
  return chercherDansAnnuaire(court, codeCommune, naf);
}

async function traiter(
  sql: Sql,
  taskId: string,
  campagneId: string,
  reglages: Reglages,
  metierLabel: string,
  naf: string[],
  codeCommune: string,
  commune: Commune,
  fiche: FicheGoogle,
  bilan: Bilan,
  compterTokens: (entree: number, sortie: number) => void,
) {
  bilan.candidats++;
  const base = { nom: fiche.nom, placeId: fiche.placeId, commune: commune.nom };

  if (fiche.statut && fiche.statut !== "OPERATIONAL") {
    bilan.ecartes++;
    await enregistrer(sql, campagneId, metierLabel, base, null, {
      status: "ecarte", score: null, qualite: null, raison: "Fermé (temporairement ou définitivement) selon Google.",
      site: null, email: null, emailSource: null,
    });
    return;
  }

  // Annuaire (SIRET) et visite du site
  const annuaire = await chercherEntreprise(fiche.nom, codeCommune, commune.nom, naf, bilan);
  const site = fiche.site ? await analyserSite(fiche.site) : null;
  if (site?.repond) bilan.avec_vrai_site++;

  // Note par Claude Haiku
  const note = await noter(metierLabel, fiche, site, annuaire, reglages.consignes);
  compterTokens(note.tokensEntree, note.tokensSortie);
  bilan.cout_ia_eur = Math.round((bilan.cout_ia_eur + note.coutEur) * 1e6) / 1e6;
  await sql`insert into public.costs (task_id, campaign_id, provider, category, amount_eur, description, is_demo)
            values (${taskId}, ${campagneId}, 'anthropic', 'api', ${note.coutEur},
                    ${`Note de prospect (${MODELE}) : ${fiche.nom}`}, ${SIMULATION})`;

  const entreprise = note.annuaire !== null ? annuaire[note.annuaire] : null;
  if (entreprise) bilan.avec_siret++;

  if (!note.artisan) {
    bilan.pas_du_metier++;
    bilan.ecartes++;
    await enregistrer(sql, campagneId, metierLabel, base, entreprise, {
      status: "ecarte", score: note.score, qualite: note.qualiteSite, raison: `Pas un artisan du métier. ${note.raison}`,
      site: null, email: null, emailSource: null,
    });
    return;
  }
  if (entreprise && !entreprise.diffusible) {
    // L'entreprise a refusé la diffusion de ses informations : on la respecte.
    bilan.ecartes++;
    await enregistrer(sql, campagneId, metierLabel, base, entreprise, {
      status: "ecarte", score: null, qualite: null, raison: "Entreprise « non diffusible » dans l'annuaire : on ne la prospecte pas.",
      site: null, email: null, emailSource: null,
    });
    return;
  }

  const email = site?.email ?? null;
  if (email) {
    const [{ oppose }] = await sql<{ oppose: boolean }[]>`select public.is_opposed(${email}) as oppose`;
    if (oppose) {
      bilan.opposes++;
      await enregistrer(sql, campagneId, metierLabel, base, entreprise, {
        status: "refuse", score: note.score, qualite: note.qualiteSite, raison: "Sur la liste d'opposition.",
        site: null, email: null, emailSource: null,
      });
      return;
    }
    bilan.avec_email++;
  }

  const status = note.score < reglages.scoreEcarte
    ? "ecarte"
    : note.score >= reglages.scoreQualifie && email
      ? "qualifie"
      : "nouveau";
  if (status === "ecarte") bilan.ecartes++;
  else if (status === "qualifie") bilan.qualifies++;
  else if (note.score >= reglages.scoreQualifie) bilan.a_joindre_autrement++;

  await enregistrer(sql, campagneId, metierLabel, base, entreprise, {
    status, score: note.score, qualite: note.qualiteSite, raison: note.raison,
    // L'adresse du site vient de notre visite du site lui-même, pas de Google.
    site: site?.repond ? site.url : null,
    // Prospect écarté : on ne garde pas son e-mail (on ne l'utilisera pas).
    email: status === "ecarte" ? null : email,
    emailSource: status === "ecarte" ? null : site?.emailSource ?? null,
  });
}

/**
 * Enregistre le prospect. Le nom est celui sous lequel l'artisan se présente publiquement ;
 * l'adresse et le SIRET viennent de l'annuaire (rien d'autre n'est gardé de Google que l'identifiant).
 * Si l'annuaire connaît déjà ce SIRET comme « écarté » sans fiche Google (ancienne méthode de recherche),
 * la ligne est mise à jour au lieu d'être ignorée.
 */
async function enregistrer(
  sql: Sql,
  campagneId: string,
  categorie: string,
  base: { nom: string; placeId: string; commune: string },
  e: EntrepriseAnnuaire | null,
  r: {
    status: string; score: number | null; qualite: string | null; raison: string;
    site: string | null; email: string | null; emailSource: string | null;
  },
) {
  const notes = r.email ? null : r.status === "ecarte" || r.status === "refuse" ? null : "Pas d'e-mail trouvé.";
  const ligne = {
    campaign_id: campagneId,
    name: base.nom,
    category: categorie,
    address: e?.adresse ?? null,
    city: e?.commune ?? base.commune,
    postal_code: e?.codePostal ?? null,
    email: r.email,
    current_website: r.site,
    has_website: r.site !== null,
    source: e ? "Fiche Google + annuaire des entreprises + site" : "Fiche Google + site",
    score: r.score,
    status: r.status,
    notes,
    siret: e?.siret ?? null,
    naf_code: e?.naf ?? null,
    google_place_id: base.placeId,
    website_quality: r.qualite,
    email_source: r.emailSource,
    score_reason: r.raison,
    last_checked_at: new Date(),
    is_demo: SIMULATION,
  };
  const colonnes = Object.keys(ligne) as (keyof typeof ligne)[];
  await sql`
    insert into public.prospects ${sql(sansNul(ligne), colonnes)}
    on conflict (siret) where siret is not null do update set
      ${sql(sansNul(ligne), colonnes.filter((c) => c !== "campaign_id" && c !== "siret"))}
    where public.prospects.status = 'ecarte' and public.prospects.google_place_id is null`;
}

/** Résumé lisible, affiché dans l'onglet Actions de GitHub. */
function resume(reglages: Reglages, metier: string, commune: string, b: Bilan) {
  const pct = (n: number) => (b.candidats ? `${Math.round((100 * n) / b.candidats)} %` : "—");
  const lignes = [
    `## ${reglages.nom} : ${metier} à ${commune}${SIMULATION ? " (simulation)" : ""}`,
    "",
    "| | Nombre | Part |",
    "|---|---:|---:|",
    `| Fiches Google vues | ${b.fiches_vues} | |`,
    `| Déjà connues / hors commune | ${b.deja_connus} / ${b.hors_commune} | |`,
    `| **Nouvelles fiches examinées** | **${b.candidats}** | |`,
    `| Pas des artisans du métier | ${b.pas_du_metier} | ${pct(b.pas_du_metier)} |`,
    `| Retrouvées dans l'annuaire (SIRET) | ${b.avec_siret} | ${pct(b.avec_siret)} |`,
    `| Avec un vrai site | ${b.avec_vrai_site} | ${pct(b.avec_vrai_site)} |`,
    `| **Avec un e-mail trouvé** | **${b.avec_email}** | **${pct(b.avec_email)}** |`,
    `| Qualifiés (score ≥ ${reglages.scoreQualifie} + e-mail) | ${b.qualifies} | ${pct(b.qualifies)} |`,
    `| Intéressants mais sans e-mail | ${b.a_joindre_autrement} | ${pct(b.a_joindre_autrement)} |`,
    `| Écartés | ${b.ecartes} | |`,
    `| Sur la liste d'opposition | ${b.opposes} | |`,
    `| Erreurs | ${b.erreurs} | |`,
    "",
    `Fiches Google lues : ${b.requetes_google} (recherches gratuites : ${b.recherches_google}) · Coût IA : ${b.cout_ia_eur.toFixed(4)} €`,
    b.arret ? `\n**Arrêt :** ${b.arret}` : "",
  ];
  const texte = lignes.join("\n");
  console.log(`\n${texte}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${texte}\n`);
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
