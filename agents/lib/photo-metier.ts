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

/** Toutes les photos (pour les vérifier d'un coup). */
export const TOUTES_PHOTOS_METIER: string[] = [...new Set([...Object.values(PHOTOS).flat(), ...PAR_DEFAUT])];

export const urlPhotoUnsplash = (id: string, largeur = 1000) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${largeur}&q=70`;

/** Petit nombre stable tiré du nom (même entreprise = même photo à chaque visite). */
function hache(texte: string): number {
  let h = 0;
  for (const ch of texte) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** Adresse de la photo du métier pour cette entreprise. */
export function photoMetier(metier: string, nom: string, largeur = 1000): string {
  const liste = PHOTOS[metier] ?? PAR_DEFAUT;
  return urlPhotoUnsplash(liste[hache(nom) % liste.length], largeur);
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
