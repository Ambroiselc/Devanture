// =====================================================================
// Sid, l'agent des maquettes de sites (phase 3)
//
// Pour chaque prospect « qualifié » (bon score + e-mail trouvé) qui n'a pas encore de démo :
//   1. relit son site actuel, s'il en a un (ce qu'il dit lui-même de son activité) ;
//   2. fait rédiger les textes de la démo par Claude Haiku (titre, prestations, zone) ;
//   3. choisit son « habillage » (couleurs, polices, mise en page) pour qu'aucun voisin du même métier
//      n'ait un site qui lui ressemble (agents/lib/habillage.ts), puis enregistre la démo dans « websites » ;
//   4. passe le prospect en « démo prête ».
// Rien n'est envoyé ni mis en ligne : tu regardes chaque démo dans le tableau de bord (Sites web).
//
// Lancement : page « Sid » du tableau de bord, ou GitHub > Actions > « Sid ».
// Test sans Internet ni clés : DEVANTURE_SIMULATION=1 sur une base locale.
// =====================================================================
import { parseArgs } from "node:util";
import { connecter, type Sql } from "./lib/db.ts";
import { Photographe } from "./lib/capture.ts";
import { MODELE_DEMO, type ContenuDemo } from "./lib/demo-artisan-pro.ts";
import { choisirHabillage, codeHabillage, type Habillage } from "./lib/habillage.ts";
import { MODELE } from "./lib/haiku.ts";
import { SIMULATION } from "./lib/http.ts";
import { COMMUNES_PLUS_TARD, LISTE_COMMUNES } from "./lib/metiers.ts";
import { redigerDemo } from "./lib/redaction-demo.ts";
import { redigerDemoIndependant } from "./lib/redaction-independant.ts";
import { estIndependant, METIERS_INDEPENDANTS } from "./lib/cible.ts";
import { analyserSite } from "./lib/site.ts";
import { communesVoisines } from "./lib/geo.ts";
import { ajouterResume } from "./lib/sortie-publique.ts";

const PLAFOND = 20; // démos au maximum par lancement à la main (bouton de la page Sid)
// « --tout » (chaîne automatique après Loïc, 28/10) : tous les qualifiés sans démo, sans limite de nombre,
// mais Sid s'arrête de commencer de nouvelles maquettes après DUREE_MAX_TOUT_MIN minutes ;
// le reste attend le passage suivant. Le budget IA reste vérifié avant chaque maquette.
const PLAFOND_TOUT = 500;
const DUREE_MAX_TOUT_MIN = 25;
const MAX_ERREURS_DE_SUITE = 3;

const { values: args } = parseArgs({
  options: {
    limite: { type: "string", default: "5" },
    // Chaîne automatique : tous les prospects qualifiés sans démo (limité en temps, voir DUREE_MAX_TOUT_MIN).
    tout: { type: "boolean", default: false },
    // Facultatif : refaire la démo d'un prospect précis (son identifiant).
    prospect: { type: "string", default: "" },
    // Rattrapage : fait seulement la capture des maquettes qui n'en ont pas (aucun coût d'IA).
    captures: { type: "boolean", default: false },
    // Rattrapage : donne un habillage aux maquettes qui n'en ont pas encore, et refait leurs captures (aucun coût d'IA).
    habiller: { type: "boolean", default: false },
  },
});

interface ProspectDemo {
  id: string;
  campaign_id: string | null;
  name: string;
  category: string | null;
  city: string | null;
  postal_code: string | null;
  address: string | null;
  email: string | null;
  current_website: string | null;
  /** Téléphone public (liste RGE, 19/11), affiché en haut de la maquette s'il est connu. */
  phone: string | null;
}

const COMMUNES_MEL = [...LISTE_COMMUNES, ...COMMUNES_PLUS_TARD].map(([, nom]) => nom);

/** « Plomberie Dupont », « Roubaix » → plomberie-dupont-roubaix-7k2f */
function slug(nom: string, commune: string): string {
  const base = `${nom} ${commune}`
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/œ/g, "oe").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 50).replace(/-+$/g, "");
  return `${base || "demo"}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Habillage d'une nouvelle maquette. « Voisins » à ne pas imiter :
 *   - les maquettes et sites du même métier dans le même département (ou la même commune, sans code postal) ;
 *   - les sites des clients de la même commune, quel que soit leur métier.
 * Les maquettes archivées ne comptent pas.
 */
async function habillagePour(sql: Sql, p: Pick<ProspectDemo, "id" | "category" | "city" | "postal_code">): Promise<Habillage> {
  const departement = /^\d{5}$/.test(p.postal_code ?? "") ? p.postal_code!.slice(0, 2) : null;
  const lignes = await sql<{ habillage: Habillage; voisin: boolean }[]>`
    select w.content->'habillage' as habillage,
      (
        (lower(coalesce(o.category, '')) = lower(coalesce(${p.category}, '')) and (
          (${departement}::text is not null and left(o.postal_code, 2) = ${departement})
          or lower(coalesce(o.city, '')) = lower(coalesce(${p.city}, '-'))
        ))
        or (w.kind = 'production' and lower(coalesce(o.city, '')) = lower(coalesce(${p.city}, '-')))
      ) as voisin
    from public.websites w
    join public.prospects o on o.id = w.prospect_id
    where w.status <> 'archive' and w.prospect_id <> ${p.id}
      and w.content ? 'habillage'`;
  return choisirHabillage(
    lignes.filter((l) => l.voisin).map((l) => l.habillage),
    lignes.filter((l) => !l.voisin).map((l) => l.habillage),
  );
}

/**
 * Rattrapage : les maquettes actives faites avant les variantes (sans habillage) en reçoivent un,
 * dans l'ordre de création (pour que la règle des voisins s'applique de proche en proche), puis leurs
 * captures sont refaites. Les maquettes dont l'e-mail est déjà parti ne changent pas.
 */
async function habillerAnciennes(sql: Sql) {
  const maquettes = await sql<{ id: string; content: ContenuDemo; prospect_id: string; category: string | null;
    city: string | null; postal_code: string | null }[]>`
    select w.id, w.content, w.prospect_id, p.category, p.city, p.postal_code
    from public.websites w
    join public.prospects p on p.id = w.prospect_id
    where w.kind = 'demo' and w.status <> 'archive' and w.content is not null and w.template <> 'independant'
      and not (w.content ? 'habillage')
      and p.status in ('qualifie', 'demo_prete')
      and not exists (select 1 from public.emails m where m.website_id = w.id and m.status in ('envoye', 'repondu'))
    order by w.created_at`;
  let faites = 0;
  let captures = 0;
  for (const m of maquettes) {
    const habillage = await habillagePour(sql, { id: m.prospect_id, category: m.category, city: m.city, postal_code: m.postal_code });
    const contenu = { ...m.content, habillage };
    await sql`update public.websites set content = ${sql.json(contenu as never)} where id = ${m.id}`;
    faites++;
    try {
      await enregistrerCapture(sql, m.id, contenu);
      captures++;
    } catch (err) {
      console.error(`${m.id} : capture impossible (${(err as Error).message})`);
    }
  }
  const texte = `## Sid : habillage des anciennes maquettes\n\nMaquettes habillées : **${faites}** sur ${maquettes.length} · Captures refaites : ${captures}`;
  console.log(texte);
  ajouterResume(`${texte}\n`);
}

async function journal(sql: Sql, taskId: string, level: "info" | "warning" | "error", message: string) {
  console.log(`[${level}] ${message}`);
  await sql`insert into public.task_events (task_id, level, message, is_demo)
            values (${taskId}, ${level}, ${message}, ${SIMULATION})`;
}

const photographe = new Photographe();

/** Les 3 images d'une maquette : style sobre, style chaleureux, et les deux côte à côte (pour l'e-mail). */
async function enregistrerCapture(sql: Sql, websiteId: string, contenu: ContenuDemo) {
  const pro = await photographe.capturer(contenu, "pro");
  const chaleureux = await photographe.capturer(contenu, "chaleureux");
  const duo = await photographe.duo(pro, chaleureux);
  for (const [style, c] of [["pro", pro], ["chaleureux", chaleureux], ["duo", duo]] as const) {
    await sql`
      insert into public.website_captures (website_id, style, image, width, height)
      values (${websiteId}, ${style}, ${c.image}, ${c.width}, ${c.height})
      on conflict (website_id, style) do update set image = excluded.image, width = excluded.width,
        height = excluded.height, created_at = now()`;
  }
}

/**
 * Fait les images des maquettes actives à qui il en manque une (par exemple celles faites avant les deux styles),
 * sauf celles dont l'e-mail est déjà parti ou dont le prospect est écarté.
 */
async function rattraperCaptures(sql: Sql) {
  const maquettes = await sql<{ id: string; content: ContenuDemo }[]>`
    select w.id, w.content from public.websites w
    join public.prospects p on p.id = w.prospect_id
    where w.kind = 'demo' and w.status <> 'archive' and w.content is not null and w.template <> 'independant'
      and p.status in ('qualifie', 'demo_prete')
      and (select count(*) from public.website_captures c where c.website_id = w.id) < 3
    order by w.created_at`;
  let faites = 0;
  let erreurs = 0;
  for (const m of maquettes) {
    try {
      await enregistrerCapture(sql, m.id, m.content);
      faites++;
    } catch (err) {
      erreurs++;
      console.error(`${m.id} : ${(err as Error).message}`);
      if (erreurs >= MAX_ERREURS_DE_SUITE && faites === 0) throw new Error("Captures impossibles : arrêt.");
    }
  }
  const texte = `## Sid : rattrapage des captures\n\nCaptures faites : **${faites}** sur ${maquettes.length} · Erreurs : ${erreurs}`;
  console.log(texte);
  ajouterResume(`${texte}\n`);
}

async function main() {
  const sql = connecter();
  const limite = args.tout ? PLAFOND_TOUT : Math.min(PLAFOND, Math.max(1, Number.parseInt(args.limite!, 10) || 5));
  const finAuPlusTard = args.tout ? Date.now() + DUREE_MAX_TOUT_MIN * 60_000 : Infinity;
  const bilan = { demos: 0, captures: 0, erreurs: 0, ignores: 0, cout_ia_eur: 0, arret: undefined as string | undefined };
  let taskId: string | null = null;
  let tokensEntree = 0;
  let tokensSortie = 0;

  try {
    if (args.habiller) {
      await habillerAnciennes(sql);
      return;
    }
    if (args.captures) {
      await rattraperCaptures(sql);
      return;
    }
    const prospects = args.prospect
      ? await sql<ProspectDemo[]>`
          select id, campaign_id, name, category, city, postal_code, address, email, current_website, phone
          from public.prospects where id = ${args.prospect}`
      : await sql<ProspectDemo[]>`
          select p.id, p.campaign_id, p.name, p.category, p.city, p.postal_code, p.address, p.email, p.current_website, p.phone
          from public.prospects p
          where p.status = 'qualifie'
            and not exists (select 1 from public.websites w
                            where w.prospect_id = p.id and w.kind = 'demo' and w.status <> 'archive')
          order by (p.category = any(${[...METIERS_INDEPENDANTS]})) desc, p.score desc nulls last, p.created_at
          limit ${limite}`;

    if (prospects.length === 0) {
      console.log("Aucun prospect qualifié sans démo : rien à faire.");
      return;
    }

    const [tache] = await sql<{ id: string }[]>`
      insert into public.tasks (agent, title, status, input, attempts, started_at, is_demo)
      values ('site_demo', ${`Sid : ${prospects.length} maquette(s)`}, 'en_cours',
              ${sql.json({ limite, prospect: args.prospect || null, modele: MODELE, gabarit: MODELE_DEMO })},
              1, now(), ${SIMULATION})
      returning id`;
    taskId = tache.id;

    let erreursDeSuite = 0;
    for (const [i, p] of prospects.entries()) {
      if (Date.now() > finAuPlusTard) {
        bilan.arret = `Temps maximum atteint (${DUREE_MAX_TOUT_MIN} min) : ${prospects.length - i} maquette(s) au prochain passage.`;
        await journal(sql, taskId, "info", bilan.arret);
        break;
      }
      const [budget] = await sql<{ depasse: boolean }[]>`select depasse from public.ai_budget_status`;
      if (budget?.depasse) {
        bilan.arret = "Budget IA du mois atteint : arrêt.";
        await journal(sql, taskId, "warning", bilan.arret);
        break;
      }
      if (p.email) {
        const [{ oppose }] = await sql<{ oppose: boolean }[]>`select public.is_opposed(${p.email}) as oppose`;
        if (oppose) {
          bilan.ignores++;
          await journal(sql, taskId, "info", `${p.name} : sur la liste d'opposition, pas de démo.`);
          continue;
        }
      }

      // 26/11 : nouvelle cible (photographes, coachs) : modèle « indépendant », sans habillage ni captures.
      if (estIndependant(p.category)) {
        try {
          const commune = p.city ?? "votre secteur";
          const voisines = await communesVoisines(commune, p.postal_code, 10).catch(() => [] as string[]);
          const site = p.current_website ? await analyserSite(p.current_website) : null;
          const r = await redigerDemoIndependant(
            { nom: p.name, metier: p.category, commune, telephone: p.phone, email: p.email, texteSite: site?.indices?.extrait ?? null },
            voisines.length ? voisines : [commune],
            Math.random() < 0.5 ? 0 : 1,
          );
          tokensEntree += r.tokensEntree;
          tokensSortie += r.tokensSortie;
          bilan.cout_ia_eur = Math.round((bilan.cout_ia_eur + r.coutEur) * 1e6) / 1e6;
          await sql.begin(async (tx) => {
            await tx`update public.websites set status = 'archive'
                     where prospect_id = ${p.id} and kind = 'demo' and status <> 'archive'`;
            await tx`insert into public.websites (prospect_id, kind, status, template, content, slug, is_demo)
                     values (${p.id}, 'demo', 'pret', 'independant', ${tx.json(r.contenu as never)}, ${slug(p.name, commune)}, ${SIMULATION})`;
            await tx`update public.prospects set status = 'demo_prete' where id = ${p.id} and status in ('nouveau', 'qualifie')`;
            await tx`insert into public.costs (task_id, campaign_id, provider, category, amount_eur, description, is_demo)
                     values (${taskId}, ${p.campaign_id}, 'anthropic', 'api', ${r.coutEur},
                             ${`Textes de démo (indépendant) : ${p.name}`}, ${SIMULATION})`;
          });
          bilan.demos++;
          erreursDeSuite = 0;
          await journal(sql, taskId, "info", `${p.name} : maquette « indépendant » prête.`);
        } catch (err) {
          bilan.erreurs++;
          erreursDeSuite++;
          await journal(sql, taskId, "error", `${p.name} : ${(err as Error).message}`);
          if (erreursDeSuite >= MAX_ERREURS_DE_SUITE) throw new Error(`${MAX_ERREURS_DE_SUITE} erreurs de suite : arrêt par sécurité.`);
        }
        await sql`update public.tasks set output = ${sql.json(bilan as never)}, tokens_input = ${tokensEntree},
                  tokens_output = ${tokensSortie} where id = ${taskId}`;
        continue;
      }

      try {
        const commune = p.city ?? "votre secteur";
        // Zone d'intervention : les communes de la métropole pour un artisan de la métropole, sinon les communes
        // voisines de la sienne (élargissement de zone du 27/10).
        const dansLaMetropole = COMMUNES_MEL.some((c) => c.toLowerCase() === commune.toLowerCase());
        const voisines = dansLaMetropole ? COMMUNES_MEL : await communesVoisines(commune, p.postal_code);
        const communesPossibles = voisines.length ? voisines : [commune];
        const site = p.current_website ? await analyserSite(p.current_website) : null;
        const r = await redigerDemo(
          {
            nom: p.name,
            metier: p.category ?? "Artisan",
            commune,
            adresse: p.address,
            email: p.email,
            texteSite: site?.indices?.extrait ?? null,
          },
          communesPossibles,
        );
        tokensEntree += r.tokensEntree;
        tokensSortie += r.tokensSortie;
        bilan.cout_ia_eur = Math.round((bilan.cout_ia_eur + r.coutEur) * 1e6) / 1e6;

        const habillage = await habillagePour(sql, p);
        const contenu: ContenuDemo = { ...r.contenu, habillage, ...(p.phone ? { telephone: p.phone } : {}) };

        let websiteId = "";
        await sql.begin(async (tx) => {
          // Refaire la démo d'un prospect : l'ancienne est archivée.
          await tx`update public.websites set status = 'archive'
                   where prospect_id = ${p.id} and kind = 'demo' and status <> 'archive'`;
          const [w] = await tx<{ id: string }[]>`
            insert into public.websites (prospect_id, kind, status, template, content, slug, is_demo)
            values (${p.id}, 'demo', 'pret', ${MODELE_DEMO}, ${tx.json(contenu as never)}, ${slug(p.name, commune)}, ${SIMULATION})
            returning id`;
          await tx`update public.prospects set status = 'demo_prete'
                   where id = ${p.id} and status in ('nouveau', 'qualifie')`;
          await tx`insert into public.costs (task_id, campaign_id, provider, category, amount_eur, description, is_demo)
                   values (${taskId}, ${p.campaign_id}, 'anthropic', 'api', ${r.coutEur},
                           ${`Textes de démo (${MODELE}) : ${p.name}`}, ${SIMULATION})`;
          if (prospects.length === 1) await tx`update public.tasks set website_id = ${w.id} where id = ${taskId}`;
          websiteId = w.id;
        });
        bilan.demos++;
        // Capture de la maquette (vue téléphone). Un échec ici n'annule pas la maquette : le rattrapage la refera.
        try {
          await enregistrerCapture(sql, websiteId, contenu);
          bilan.captures++;
        } catch (err) {
          await journal(sql, taskId, "warning", `${p.name} : capture impossible (${(err as Error).message}).`);
        }
        erreursDeSuite = 0;
        await journal(sql, taskId, "info", `${p.name} : démo prête (habillage ${codeHabillage(habillage)}).`);
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
  } catch (err) {
    const message = (err as Error).message;
    console.error(message);
    if (taskId) {
      await sql`update public.tasks set status = 'echouee', finished_at = now(), error_message = ${message},
                output = ${sql.json(bilan as never)} where id = ${taskId}`;
    }
    process.exitCode = 1;
  } finally {
    if (args.captures || args.habiller) {
      await photographe.fermer();
      await sql.end();
      return;
    }
    const texte = [
      `## Sid : maquettes${SIMULATION ? " (simulation)" : ""}`,
      "",
      `Maquettes prêtes : **${bilan.demos}** (captures : ${bilan.captures}) · Ignorés : ${bilan.ignores} · Erreurs : ${bilan.erreurs} · Coût IA : ${bilan.cout_ia_eur.toFixed(4)} €`,
      bilan.arret ? `\n**Arrêt :** ${bilan.arret}` : "",
      "",
      "Les maquettes se regardent dans le tableau de bord, page « Sid ».",
    ].join("\n");
    console.log(texte);
    ajouterResume(`${texte}\n`);
    await photographe.fermer();
    await sql.end();
  }
}

await main();
