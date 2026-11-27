// Photo d'illustration du métier, en haut des MAQUETTES (19/11, demande de Broise).
// Avant : un grand cadre gris « Votre photo ici » était la première chose que l'artisan voyait,
// et la maquette avait l'air d'un formulaire à remplir. Maintenant : une vraie photo de son métier.
//
// Photos Unsplash (licence Unsplash : usage commercial libre, sans attribution obligatoire),
// servies directement par images.unsplash.com (rien à héberger). Plusieurs photos par métier :
// le choix dépend du nom de l'entreprise, donc deux artisans voisins n'ont pas forcément la même.
// Si une photo ne charge pas, l'image s'efface d'elle-même (onerror) : jamais d'image cassée.
//
// Ce fichier est lu par les modèles de maquette (et donc par le tableau de bord) : il n'importe rien.
// Les sites définitifs des clients (Pedro) n'utilisent JAMAIS ces photos : ils ont les leurs.

const PHOTOS: Record<string, string[]> = {
  "Plombier-chauffagiste": ["1676210134188-4c05dd172f89", "1749532125405-70950966b0e5", "1676210133055-eab6ef033ce3"],
  "Électricien": ["1621905251189-08b45d6a269e", "1660330589693-99889d60181e", "1758101755915-462eddc23f57"],
  "Couvreur": ["1635424824849-1b09bdcc55b1", "1763665814538-8ba04597286c", "1632759145351-1d592919f522"],
  "Peintre en bâtiment": ["1717281234297-3def5ae3eee1", "1652829069834-2c05031199c5", "1688372199140-cade7ae820fe"],
  "Menuisier": ["1595844730298-b960ff98fee0", "1779031242515-205111711b23", "1572739275114-ec3764ba1477"],
  "Serrurier": ["1759452003649-552896c8ed63", "1773425350177-af4d2249d641"],
  "Maçon": ["1704005445445-2747074be8ac", "1701850009190-2859ba2aeea6", "1673865641469-34498379d8af"],
  "Carreleur": ["1523413307857-ef24c53571ae", "1523413363574-c30aa1c2a516"],
  "Plaquiste-plâtrier": ["1768321914149-5a6428ec2f82", "1768839725085-829e6ac7ac26", "1770838773417-08b18661c62f"],
  "Climatisation et pompe à chaleur": ["1776860150305-108ed577d7d4", "1776860155275-eee24bfb1dee", "1679303777007-c6c4522beb02"],
  "Paysagiste": ["1734079692160-fcbe4be6ab96", "1734079692079-aae7e24a7035", "1734303023491-db8037a21f09"],
  "Isolation": ["1607400201889-565b1ee75f8e", "1752852381113-7d93abc9d7ea"],
  "Panneaux solaires": ["1624397640148-949b1732bb0a", "1655300256335-beef51a914fe", "1694327671725-e2a81cda3436"],
  "Façadier": ["1768839725085-829e6ac7ac26", "1635961134620-5da36ab4ad72"],
  "Poêles et cheminées": ["1678274909137-ae0677d24a9b", "1783628301708-c71042ce5622", "1648332202349-a1ca4f99ee0c"],
};

/** Métier inconnu (« Artisan du bâtiment »…) : photos de chantier génériques. */
const PAR_DEFAUT = ["1587582423116-ec07293f0395", "1595844730298-b960ff98fee0"];

/**
 * 19/11 (demande de Broise) : photos en plus pour remplir « Mes derniers chantiers » / « Réalisations » des maquettes.
 * Elles s'ajoutent aux photos d'en-tête du métier (sans reprendre celle déjà en haut de la page).
 */
const CHANTIERS: Record<string, string[]> = {
  "Plombier-chauffagiste": ["1768321913920-d3ac011e0683", "1768321918210-a775e4c88f08", "1542013936693-884638332954", "1761758674188-2b8e4c89c5e2"],
  "Électricien": ["1635335874521-7987db781153", "1780034766312-73825064806c"],
  "Couvreur": ["1635424709845-3a85ad5e1f5e", "1643225523483-e2c434191bba", "1633759593085-1eaeb724fc88", "1763665814605-a6489a3bf2a0"],
  "Peintre en bâtiment": ["1554995207-c18c203602cb", "1786204697642-328c597b6f05", "1733431772808-82d878e59000", "1718816281207-3b253cff549a"],
  "Menuisier": ["1544164560-adac3045edb2", "1561297331-a9c00b9c2c44", "1630368177606-471ad5e501c4", "1527352774566-e4916e36c645", "1773430272653-375174373c4f"],
  "Serrurier": ["1756341782434-3020b9d17372", "1562259929-b4e1fd3aef09", "1761074342668-c38fc2e62e67"],
  "Maçon": ["1774931363306-5a896cd4dd02", "1617720356637-6264c1c0b4bb", "1593786267440-550458cc882a"],
  "Carreleur": ["1523350165414-082d792c4bcc", "1656646523907-97b094c7e63a", "1758832505443-26bfecea4669", "1782805153002-96e099970a9d", "1625646333826-c30c4e4d73d2"],
  "Plaquiste-plâtrier": ["1733431774078-692252a6605e", "1649766964924-1d257ddf0742"], // 27/11 : mur blanc uni retiré
  "Climatisation et pompe à chaleur": ["1700124113583-81aa99ea2aa2", "1718203862467-c33159fdc504", "1776860150250-757406c52438"],
  "Paysagiste": ["1784293449032-200db587788c", "1783451439661-152793447cbf", "1668120089662-42642838cfef", "1778869290979-6f09567a0eee"],
  "Isolation": ["1776604336398-decfacdc7c07", "1773649966953-9f8964b89881", "1768321914149-5a6428ec2f82"],
  "Panneaux solaires": ["1724041875334-0a6397111c7e", "1613665813446-82a78c468a1d"],
  "Façadier": ["1593786267440-550458cc882a", "1612935089040-89195ef54677", "1754329717646-8101c55a4b43", "1754329715538-365406fc183e"],
  "Poêles et cheminées": ["1761319914911-71b059a655d8", "1698933787134-af2d451985c7", "1714075853573-0bbf3c6f1d79", "1774612193273-96b6d25a64d7", "1603283297903-81277ca7ce8f"],
};
const CHANTIERS_PAR_DEFAUT = ["1773430272653-375174373c4f", "1770838773417-08b18661c62f", "1704005445445-2747074be8ac", "1772442198624-4fc4d7281e89"];

/** Toutes les photos (pour les vérifier d'un coup). */
export const TOUTES_PHOTOS_METIER: string[] = [...new Set([
  ...Object.values(PHOTOS).flat(), ...PAR_DEFAUT, ...Object.values(CHANTIERS).flat(), ...CHANTIERS_PAR_DEFAUT,
])];

export const urlPhotoUnsplash = (id: string, largeur = 1000) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${largeur}&q=70`;

/** Petit nombre stable tiré du nom (même entreprise = même photo à chaque visite). */
function hache(texte: string): number {
  let h = 0;
  for (const ch of texte) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

const idEnTete = (metier: string, nom: string) => {
  const liste = PHOTOS[metier] ?? PAR_DEFAUT;
  return liste[hache(nom) % liste.length];
};

/** Adresse de la photo du métier pour cette entreprise. */
export function photoMetier(metier: string, nom: string, largeur = 1000): string {
  return urlPhotoUnsplash(idEnTete(metier, nom), largeur);
}

/**
 * `n` photos de chantier pour cette entreprise (19/11), toutes différentes de celle de l'en-tête et entre elles
 * tant qu'il y en a assez ; l'ordre dépend du nom, donc deux artisans du même métier n'ont pas la même galerie.
 */
export function photosChantiers(metier: string, nom: string, n: number, largeur = 700): string[] {
  const enTete = idEnTete(metier, nom);
  const pool = [...new Set([...(CHANTIERS[metier] ?? CHANTIERS_PAR_DEFAUT), ...(PHOTOS[metier] ?? PAR_DEFAUT)])]
    .filter((id) => id !== enTete);
  const depart = hache(nom + "·chantiers") % pool.length;
  return Array.from({ length: n }, (_, i) => urlPhotoUnsplash(pool[(depart + i) % pool.length], largeur));
}

/**
 * Balise <img> prête à l'emploi : chargement prioritaire (en haut de page), et si l'image ne charge pas,
 * elle disparaît (le cadre parent garde sa couleur de fond, sans texte « Votre photo ici »).
 */
export function imgPhotoMetier(metier: string, nom: string, classe: string, alt: string): string {
  const src = photoMetier(metier, nom);
  const altSur = alt.replace(/[&<>"']/g, " ");
  return `<img class="${classe}" src="${src}" alt="${altSur}" width="1000" height="750" loading="eager" fetchpriority="high" referrerpolicy="no-referrer" onerror="this.remove()">`;
}

/** Toutes les photos rangées par métier (27/11, pour la planche de cadrage /demo/planche). */
export const PHOTOS_METIERS_PAR_GROUPE: Record<string, string[]> = Object.fromEntries([
  ...Object.entries(PHOTOS).map(([m, l]) => [`${m} · en-tête`, l] as const),
  ["Par défaut · en-tête", PAR_DEFAUT] as const,
  ...Object.entries(CHANTIERS).map(([m, l]) => [`${m} · chantiers`, l] as const),
  ["Par défaut · chantiers", CHANTIERS_PAR_DEFAUT] as const,
]);
