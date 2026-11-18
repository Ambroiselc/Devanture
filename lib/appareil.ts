// Type d'appareil, système et navigateur lus dans l'en-tête User-Agent (13/11, visites du site vitrine).
// Seulement des familles (« iPhone », « Safari ») : jamais la version complète ni rien qui identifie la personne.
export interface Appareil { appareil: "telephone" | "tablette" | "ordinateur"; systeme: string | null; navigateur: string | null }

export function lireAppareil(ua: string): Appareil {
  const u = ua || "";
  const tablette = /iPad|Tablet|Android(?!.*Mobile)/i.test(u);
  const telephone = !tablette && /iPhone|iPod|Android.*Mobile|Mobile Safari|Windows Phone/i.test(u);
  const systeme = /iPhone|iPod/.test(u) ? "iPhone" : /iPad/.test(u) ? "iPad" : /Android/.test(u) ? "Android"
    : /Windows/.test(u) ? "Windows" : /Macintosh|Mac OS X/.test(u) ? "Mac" : /CrOS/.test(u) ? "ChromeOS"
    : /Linux/.test(u) ? "Linux" : null;
  const navigateur = /Edg\//.test(u) ? "Edge" : /OPR\/|Opera/.test(u) ? "Opera" : /SamsungBrowser/.test(u) ? "Samsung"
    : /Firefox\/|FxiOS/.test(u) ? "Firefox" : /CriOS|Chrome\//.test(u) ? "Chrome"
    : /GSA\//.test(u) ? "Google" : /Safari\//.test(u) ? "Safari" : null;
  return { appareil: tablette ? "tablette" : telephone ? "telephone" : "ordinateur", systeme, navigateur };
}
