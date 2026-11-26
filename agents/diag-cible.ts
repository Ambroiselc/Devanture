// Test de la nouvelle cible (26/11, demande de Broise : « piste 2 », métiers où le client choisit sur internet).
// EN LECTURE SEULE : rien n'est écrit dans la base, aucun e-mail n'est envoyé.
// Pour chaque métier, lit quelques fiches Google dans la métropole lilloise et compte :
//   pas de site / réseau social / plateforme de réservation (Planity, Resalib…) / site à eux,
//   et combien ont une adresse e-mail trouvable (même méthode que Loïc : accueil, contact, mentions légales).
// N'affiche que des totaux (journaux GitHub publics) : jamais de nom, d'adresse ni de lien.
// Se lance quand tests/cible.txt change (workflow diag-cible.yml).
// Coût : environ FICHES_PAR_METIER × nombre de métiers fiches détaillées Google (quota gratuit de 1 000 par mois).
import "./lib/sortie-publique.ts";
import { lireCommune } from "./lib/geo.ts";
import { detailsFiche, rechercherIds, dansLaCommune } from "./lib/places.ts";
import { analyserSite, estReseauSocial, hote } from "./lib/site.ts";
import { ajouterResume } from "./lib/sortie-publique.ts";

const FICHES_PAR_METIER = Number(process.env.FICHES_PAR_METIER ?? 10);

const METIERS = [
  "institut de beauté",
  "onglerie",
  "barbier",
  "salon de coiffure",
  "sophrologue",
  "naturopathe",
  "massage bien-être",
  "hypnothérapeute",
  "coach sportif",
  "toiletteur pour chiens",
  "photographe",
  "auto-école",
];

// Lille, Roubaix, Tourcoing, Villeneuve-d'Ascq, Marcq-en-Barœul, Lambersart : un métier = une commune (en tournant).
const COMMUNES = ["59350", "59512", "59599", "59009", "59378", "59328"];

/** Pages de réservation ou d'annuaire : la personne n'a pas de site à elle. */
const PLATEFORMES = [
  "planity.com", "treatwell.fr", "kiute.com", "resalib.fr", "doctolib.fr", "medoucine.com", "crenolibre.fr",
  "fresha.com", "booksy.com", "calendly.com", "simplybook.it", "simplybook.me", "therapeutes.com", "annuaire-therapeutes.com",
  "solocal.com", "mariages.net", "codeursenligne.com", "vroomvroom.fr", "ornikar.com",
];
/** Sites « gratuits » faits soi-même : un site à eux, mais souvent léger. */
const SITES_GRATUITS = ["wixsite.com", "jimdofree.com", "jimdosite.com", "webnode.fr", "e-monsite.com", "sitew.fr", "over-blog.com", "business.site", "godaddysites.com", "square.site"];

const finit = (h: string, liste: string[]) => liste.some((d) => h === d || h.endsWith(`.${d}`));

interface Ligne {
  metier: string; fiches: number; sansSite: number; social: number; plateforme: number; gratuit: number; propre: number;
  emailPropre: number; emailGratuit: number; emailPlateforme: number; avisMedian: number; noteMoy: number | null;
  plateformes: Record<string, number>;
}

const lignes: Ligne[] = [];
let detailsLus = 0;

for (const [i, metier] of METIERS.entries()) {
  const commune = await lireCommune(COMMUNES[i % COMMUNES.length]);
  const l: Ligne = { metier: `${metier} (${commune.nom})`, fiches: 0, sansSite: 0, social: 0, plateforme: 0, gratuit: 0, propre: 0,
    emailPropre: 0, emailGratuit: 0, emailPlateforme: 0, avisMedian: 0, noteMoy: null, plateformes: {} };
  const avis: number[] = [];
  const notes: number[] = [];
  try {
    const { ids } = await rechercherIds(metier, commune);
    for (const id of ids) {
      if (l.fiches >= FICHES_PAR_METIER) break;
      const f = await detailsFiche(id);
      detailsLus++;
      if (f.statut && f.statut !== "OPERATIONAL") continue;
      if (!dansLaCommune(f, commune)) continue;
      l.fiches++;
      avis.push(f.nbAvis);
      if (f.note != null) notes.push(f.note);
      const h = f.site ? hote(f.site) : null;
      if (!f.site || !h) { l.sansSite++; continue; }
      if (estReseauSocial(f.site)) { l.social++; continue; }
      const analyse = await analyserSite(f.site);
      if (finit(h, PLATEFORMES)) {
        l.plateforme++;
        const d = PLATEFORMES.find((p) => h === p || h.endsWith(`.${p}`))!;
        l.plateformes[d] = (l.plateformes[d] ?? 0) + 1;
        if (analyse.email) l.emailPlateforme++;
      } else if (finit(h, SITES_GRATUITS)) {
        l.gratuit++;
        if (analyse.email) l.emailGratuit++;
      } else {
        l.propre++;
        if (analyse.email) l.emailPropre++;
      }
    }
  } catch (e) {
    console.log(`${metier} : erreur ${(e as Error).message.slice(0, 120)}`);
  }
  avis.sort((a, b) => a - b);
  l.avisMedian = avis.length ? avis[Math.floor(avis.length / 2)] : 0;
  l.noteMoy = notes.length ? Math.round((notes.reduce((a, b) => a + b, 0) / notes.length) * 10) / 10 : null;
  lignes.push(l);
  console.log(`${l.metier} : ${l.fiches} fiches, sans site ${l.sansSite}, réseau social ${l.social}, plateforme ${l.plateforme}, site gratuit ${l.gratuit} (e-mail ${l.emailGratuit}), site à eux ${l.propre} (e-mail ${l.emailPropre})`);
}

const tot = lignes.reduce((t, l) => ({
  fiches: t.fiches + l.fiches, sansSite: t.sansSite + l.sansSite, social: t.social + l.social, plateforme: t.plateforme + l.plateforme,
  gratuit: t.gratuit + l.gratuit, propre: t.propre + l.propre,
  email: t.email + l.emailPropre + l.emailGratuit + l.emailPlateforme,
  emailCible: t.emailCible + l.emailGratuit + l.emailPlateforme,
}), { fiches: 0, sansSite: 0, social: 0, plateforme: 0, gratuit: 0, propre: 0, email: 0, emailCible: 0 });

const md = [
  "## Test de la nouvelle cible (lecture seule)",
  "",
  `Fiches Google lues en détail : ${detailsLus} (quota gratuit de 1 000 par mois).`,
  "",
  "| Métier (commune) | Fiches | Sans site | Réseau social | Plateforme | Site gratuit (e-mail) | Site à eux (e-mail) | Avis (médiane) | Note moy. |",
  "|---|---|---|---|---|---|---|---|---|",
  ...lignes.map((l) => `| ${l.metier} | ${l.fiches} | ${l.sansSite} | ${l.social} | ${l.plateforme}${l.emailPlateforme ? ` (${l.emailPlateforme} e-mail)` : ""} | ${l.gratuit} (${l.emailGratuit}) | ${l.propre} (${l.emailPropre}) | ${l.avisMedian} | ${l.noteMoy ?? "—"} |`),
  `| **Total** | ${tot.fiches} | ${tot.sansSite} | ${tot.social} | ${tot.plateforme} | ${tot.gratuit} | ${tot.propre} | | |`,
  "",
  `E-mails trouvés : ${tot.email} sur ${tot.fiches} fiches, dont ${tot.emailCible} chez ceux qui n'ont pas de vrai site à eux (plateforme ou site gratuit).`,
  "",
  "Plateformes vues : " + (Object.entries(lignes.reduce((t, l) => { for (const [k, v] of Object.entries(l.plateformes)) t[k] = (t[k] ?? 0) + v; return t; }, {} as Record<string, number>))
    .map(([k, v]) => `${k} ${v}`).join(", ") || "aucune"),
  "",
].join("\n");

console.log(md);
ajouterResume(md);
