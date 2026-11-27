// Femme ou homme ? (27/11, demande de Broise) : pour mettre dans « À propos » une photo d'illustration qui ressemble à
// l'indépendant. Sans IA, à l'affichage de la maquette (donc valable aussi pour les maquettes déjà envoyées) :
//   1. un prénom connu dans le nom de l'activité ou dans l'adresse e-mail (« camille.dupont@… ») ;
//   2. les accords dans les textes (« passionnée », « installée »… contre « passionné », « installé »…) ;
//   3. rien trouvé → null (le modèle choisit : femme pour les photographes et le yoga, homme pour les coachs).
// Prénoms ambigus (Camille, Dominique, Claude…) : ignorés, on passe à l'indice suivant. Ce fichier n'importe rien.

export type Genre = "f" | "m";

const FEMMES = new Set(`
adele agathe agnes alexandra alice aline alix amandine amelie anais angelique anne annabelle annie anouk audrey aurelie
aurore axelle beatrice berengere bernadette brigitte capucine carine carla carole caroline catherine cecile celia celine
chantal charlene charline charlotte chloe christelle christine claire clara clarisse claudine clemence clementine coline
colombe coralie corinne cynthia delphine diane elisa elise elodie eloise emeline emilie emma emmanuelle estelle eva eve
fabienne fanny florence gaelle genevieve geraldine helene ines ingrid irene isabelle jade jeanne jessica joelle johanna
josephine judith julia julie juliette justine karine laetitia laura laure lauren laurence lea leila lena lina lisa lou
louise lucie lucile ludivine lydie magali manon margaux margot marie marina marine marion marjorie martine mathilde
maud maude melanie melissa mia michele mireille morgane muriel myriam nadia nadege nathalie noemie oceane odile olivia
ophelie pascale patricia pauline peggy perrine rachel rebecca romane rose roxane sabine sabrina salome sandra sandrine
sarah severine sonia sophie stephanie suzanne sylvie tatiana valentine valerie vanessa veronique victoria virginie yasmine
zoe agnieszka anna elena irina katia ludmila natacha
`.trim().split(/\s+/));

const HOMMES = new Set(`
adrien alain alban alexandre alexis antoine anthony arnaud arthur aurelien axel baptiste bastien benjamin benoit bertrand
bruno cedric charles christian christophe clement corentin cyril damien daniel david denis didier dimitri djamel eddy
edouard emmanuel eric etienne fabien fabrice florent florian francis franck francois frederic gabriel gaetan gauthier
geoffrey georges gerald gerard gilles gregory guillaume gustave henri herve hugo jacques jean jeremie jeremy jerome joel
johan jonathan jordan joseph julien kevin laurent leo loic louis luc lucas ludovic marc marcel martin mathieu mathis
matthieu maxence maxime michael michel mickael morgan nathan nicolas noah olivier pascal patrice patrick paul philippe
pierre quentin raphael remi remy renaud richard robert romain romuald samuel sebastien serge simon stephane steve sylvain
theo thibault thibaut thierry thomas timothee tony tristan valentin victor vincent william xavier yann yannick yves
yohann youssef karim mehdi nabil rachid sofiane mohamed
`.trim().split(/\s+/));

/** Minuscules sans accents. */
const plat = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function prenomDans(texte: string | null | undefined): Genre | null {
  if (!texte) return null;
  // « Jean-Marc », « Marie-Claire » : le premier morceau suffit.
  for (const mot of plat(texte).split(/[^a-z]+/)) {
    if (mot.length < 3) continue;
    if (FEMMES.has(mot)) return "f";
    if (HOMMES.has(mot)) return "m";
  }
  return null;
}

const FEMININ = /\b(passionnee|installee|diplomee|certifiee|formee|specialisee|basee|ancienne|devenue|maman|photographe independante|coach certifiee|prete|ravie|heureuse)\b/;
// Pas « forme », « base », « ne » : ce sont aussi des noms ou la négation (« remise en forme », « je ne… »).
const MASCULIN = /\b(passionne|installe|diplome|certifie|specialise|ancien|devenu|papa|ravi|heureux)\b/;

/** Indices dans l'ordre : nom de l'activité, partie avant « @ » de l'e-mail, puis accords dans les textes. */
export function devinerGenre(nom: string, email: string | null | undefined, textes: string[]): Genre | null {
  const parNom = prenomDans(nom);
  if (parNom) return parNom;
  const parEmail = prenomDans(email?.split("@")[0]);
  if (parEmail) return parEmail;
  const t = plat(textes.filter(Boolean).join(" "));
  const f = (t.match(new RegExp(FEMININ.source, "g")) ?? []).length;
  const m = (t.match(new RegExp(MASCULIN.source, "g")) ?? []).length;
  return f > m ? "f" : m > f ? "m" : null;
}
