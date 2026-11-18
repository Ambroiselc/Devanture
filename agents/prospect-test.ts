// =====================================================================
// Prospect de TEST « grandeur nature » (27/10) : un artisan inventé, traité exactement comme un vrai.
// Le workflow prospect-test.yml enchaîne :
//   1. `creer`   : crée le prospect (statut « qualifié ») à partir de tests/prospect-test.json ;
//   2. Sid       : sa maquette, avec habillage et captures (agents/demos.ts --prospect) ;
//   3. Valérie   : son premier e-mail (agents/emails.ts --prospect) ;
//   4. `valider` : valide cet e-mail (c'est Broise qui a demandé le test) ;
//   5. l'envoi   : agents/envoi.ts --email, avec les vérifications et le quota habituels.
// « effacer » : true dans la fiche efface le prospect de test (et tout ce qui en dépend) au lieu d'en créer un.
// Pour le reste de l'application, c'est un prospect comme les autres. Seule la note interne
// (jamais montrée au destinataire) dit que c'est un test, pour pouvoir le retrouver et l'effacer.
// =====================================================================
import { readFileSync, appendFileSync } from "node:fs";
import { connecter } from "./lib/db.ts";
import { SIMULATION } from "./lib/http.ts";
import { createClient } from "@supabase/supabase-js";
import { creerClientEtBienvenue } from "./paiements.ts";

interface Fiche {
  envoyer: boolean;
  effacer?: boolean;
  client_test?: boolean;
  email: string;
  entreprise: string;
  metier: string;
  commune: string;
  code_postal: string;
  note_interne: string;
}

const [mode, arg] = process.argv.slice(2);
const sortie = (cle: string, valeur: string) => {
  console.log(`${cle}=${valeur}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${cle}=${valeur}\n`);
};

const sql = connecter();

/** Tous les fichiers d'un dossier du stockage, sous-dossiers compris. */
async function fichiersDe(stockage: ReturnType<typeof createClient>["storage"], bucket: string, dossier: string): Promise<string[]> {
  const { data } = await stockage.from(bucket).list(dossier, { limit: 1000 });
  const tous: string[] = [];
  for (const o of data ?? []) {
    const chemin = `${dossier}/${o.name}`;
    // Un sous-dossier n'a pas d'identifiant dans la liste du stockage.
    if (o.id === null) tous.push(...(await fichiersDe(stockage, bucket, chemin)));
    else tous.push(chemin);
  }
  return tous;
}

/**
 * Efface le prospect de test : fiche client, photos déposées (stockage « clients »), site de Pedro (stockage « sites »
 * et table des domaines), demandes de devis, maquette, captures, e-mails, messages, tâches et journaux à son nom.
 * Les dépenses d'IA restent (comptabilité) mais perdent son nom.
 */
async function effacerTest(email: string) {
  const prospects = await sql<{ id: string; name: string }[]>`
    select id, name from public.prospects where lower(email) = ${email} and notes ilike '%test%'`;
  if (!prospects.length) {
    console.log("Aucun prospect de test à effacer (déjà fait ?).");
    return;
  }
  const ids = prospects.map((p) => p.id);
  const noms = prospects.map((p) => p.name);
  const clients = await sql<{ id: string; jeton: string }[]>`select id, jeton from public.clients where prospect_id in ${sql(ids)}`;
  const sites = await sql<{ slug: string }[]>`
    select slug from public.websites where prospect_id in ${sql(ids)} and kind = 'production' and slug is not null`;

  // 1. Fichiers (par l'API du stockage : Supabase interdit de les effacer en SQL).
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/rest\/v1\/?$/, "");
  const cle = process.env.SUPABASE_SECRET_KEY;
  if (url && cle) {
    const stockage = createClient(url, cle, { auth: { persistSession: false } }).storage;
    let n = 0;
    for (const c of clients) {
      const liste = await fichiersDe(stockage, "clients", c.jeton);
      if (liste.length) { await stockage.from("clients").remove(liste); n += liste.length; }
    }
    for (const s of sites) {
      const liste = await fichiersDe(stockage, "sites", s.slug);
      if (liste.length) { await stockage.from("sites").remove(liste); n += liste.length; }
    }
    // Table domaine → site du serveur des sites.
    const { data } = await stockage.from("sites").download("_hotes.json");
    if (data && sites.length) {
      const table = JSON.parse(await data.text()) as Record<string, string>;
      const slugs = new Set(sites.map((s) => s.slug));
      const reste = Object.fromEntries(Object.entries(table).filter(([, v]) => !slugs.has(v)));
      if (Object.keys(reste).length !== Object.keys(table).length) {
        await stockage.from("sites").upload("_hotes.json", Buffer.from(JSON.stringify(reste, null, 1)),
          { contentType: "application/json", upsert: true, cacheControl: "60" });
      }
    }
    console.log(`Fichiers effacés du stockage : ${n}.`);
  } else {
    console.log("::warning::SUPABASE_SECRET_KEY absente : les photos et le site de test restent dans le stockage.");
  }

  // 2. Base de données.
  await sql.begin(async (tx) => {
    const clientIds = clients.map((c) => c.id);
    // Tâches qui ne concernaient que ce test (Pedro : liste de clients ; Sid, Valérie : prospect) et leurs journaux.
    const taches = await tx<{ id: string }[]>`
      select id from public.tasks
      where prospect_id in ${tx(ids)}
         or (agent = 'site_production' and (input->'clients') is not null
             and (select bool_and(v in ${tx(clientIds.length ? clientIds : ["-"])}) from jsonb_array_elements_text(input->'clients') as x(v)))`;
    if (taches.length) {
      await tx`update public.costs set task_id = null where task_id in ${tx(taches.map((t) => t.id))}`;
      await tx`delete from public.tasks where id in ${tx(taches.map((t) => t.id))}`;
    }
    for (const nom of noms) {
      await tx`delete from public.task_events where message ilike ${`%${nom}%`}`;
      await tx`update public.costs set description = replace(description, ${nom}, 'client de test effacé')
               where description ilike ${`%${nom}%`}`;
    }
    if (clientIds.length) {
      await tx`update public.paiements_stripe set statut = 'ignore' where client_id in ${tx(clientIds)}`;
      await tx`delete from public.clients where id in ${tx(clientIds)}`;
    }
    // Le reste suit le prospect (suppressions en cascade) : maquette et site, captures, demandes de devis,
    // e-mails de Valérie, messages de la boîte mail.
    await tx`delete from public.prospects where id in ${tx(ids)}`;
  });
  console.log(`Prospect de test effacé partout : ${noms.join(", ")}.`);
}

try {
  if (mode === "creer") {
    const f = JSON.parse(readFileSync(arg ?? "tests/prospect-test.json", "utf8")) as Fiche;
    if (f.effacer) {
      // Fin du test (29/10, complété le 30/10 avec Pedro) : efface le prospect de test et TOUT ce qui en dépend.
      // Seulement s'il porte la note interne de test : un vrai prospect n'est jamais touché.
      await effacerTest((f.email.trim() || process.env.ADRESSE_TEST || "").trim().toLowerCase());
      sortie("prospect", "");
      process.exit(0);
    }
    if (!f.envoyer) {
      console.log("« envoyer » est à false : rien à faire.");
      sortie("prospect", "");
      process.exit(0);
    }
    // 18/11 (dépôt public) : adresse vide dans le fichier = secret GitHub ADRESSE_TEST.
    const email = (f.email.trim() || process.env.ADRESSE_TEST || "").trim().toLowerCase();
    if (!email) throw new Error("Adresse de test vide : mets-la dans le fichier ou dans le secret GitHub ADRESSE_TEST.");
    const [{ oppose }] = await sql<{ oppose: boolean }[]>`select public.is_opposed(${email}) as oppose`;
    if (oppose) throw new Error(`${email} est sur la liste d'opposition : test refusé.`);
    const [existe] = await sql<{ id: string }[]>`select id from public.prospects where lower(email) = ${email} limit 1`;
    if (existe) throw new Error(`${email} existe déjà dans les prospects (${existe.id}) : rien n'est recréé.`);

    const [campagne] = await sql<{ id: string }[]>`
      select id from public.campaigns where name = 'Artisans du bâtiment — Métropole lilloise' limit 1`;
    const [p] = await sql<{ id: string }[]>`
      insert into public.prospects (campaign_id, name, category, city, postal_code, email, has_website, website_quality,
                                    source, score, score_reason, status, notes, is_demo)
      values (${campagne?.id ?? null}, ${f.entreprise}, ${f.metier}, ${f.commune}, ${f.code_postal}, ${email}, false, 'aucun',
              'Ajout manuel', 82, 'Couvreur sans site internet : un site l''aiderait à être trouvé et à rassurer avant un devis.',
              ${f.client_test ? "interesse" : "qualifie"}, ${f.note_interne}, ${SIMULATION})
      returning id`;
    if (f.client_test) {
      // Test de l'accueil client (29/10) : fiche client + e-mail de bienvenue « à valider » sur la page Inès.
      // Pas de maquette ni d'e-mail de prospection : les étapes suivantes du workflow sont sautées.
      const c = await creerClientEtBienvenue(sql, p.id, email, "essentiel", "creation", false);
      console.log(`Client de test créé (${c.id}) : e-mail de bienvenue à valider sur la page Inès.`);
      sortie("prospect", "");
    } else {
      sortie("prospect", p.id);
    }
  } else if (mode === "valider") {
    const [e] = await sql<{ id: string }[]>`
      update public.emails set status = 'valide' where prospect_id = ${arg} and status = 'a_valider' returning id`;
    if (!e) throw new Error("Aucun e-mail « à valider » pour ce prospect : Valérie ne l'a pas rédigé.");
    sortie("email", e.id);
  } else {
    throw new Error("Mode inconnu : creer <fichier> ou valider <prospect>.");
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
