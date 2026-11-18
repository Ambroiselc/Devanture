// Zone et codes postaux d'une commune, lus sur l'API officielle geo.api.gouv.fr (gratuite, sans clé).
import { httpTenace } from "./http.ts";
import { TOUTES_COMMUNES_MEL } from "./metiers.ts";

export interface Commune {
  code: string;
  nom: string;
  codesPostaux: string[];
  /** Rectangle qui englobe la commune : Google ne renvoie que ce qui est dedans. */
  zone: { sud: number; ouest: number; nord: number; est: number };
}

export async function lireCommune(code: string): Promise<Commune> {
  if (!TOUTES_COMMUNES_MEL[code]) {
    throw new Error(`Commune ${code} inconnue : l'ajouter dans agents/lib/metiers.ts.`);
  }
  const res = await httpTenace(`https://geo.api.gouv.fr/communes/${code}?fields=nom,codesPostaux,bbox&format=json`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`geo.api.gouv.fr : erreur ${res.status} pour la commune ${code}`);
  const data = (await res.json()) as {
    nom: string;
    codesPostaux?: string[];
    bbox?: { coordinates?: number[][][] };
  };
  const points = data.bbox?.coordinates?.[0] ?? [];
  if (points.length === 0) throw new Error(`geo.api.gouv.fr : pas de zone pour la commune ${code}`);
  const lngs = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return {
    code,
    nom: data.nom || TOUTES_COMMUNES_MEL[code],
    codesPostaux: data.codesPostaux ?? [],
    zone: { sud: Math.min(...lats), ouest: Math.min(...lngs), nord: Math.max(...lats), est: Math.max(...lngs) },
  };
}

/**
 * Communes voisines d'une commune hors de la métropole (élargissement de zone, 27/10) : les communes de plus de
 * 2 000 habitants les plus proches, dans son département, la commune elle-même en premier. Sert à Sid pour la
 * « zone d'intervention » de la maquette. Liste vide si la commune est introuvable.
 */
export async function communesVoisines(nom: string, codePostal: string | null, combien = 15): Promise<string[]> {
  const dep = codePostal && /^\d{5}$/.test(codePostal) ? (codePostal.startsWith("97") ? codePostal.slice(0, 3) : codePostal.slice(0, 2)) : null;
  if (!dep) return [];
  const champs = "fields=nom,population,centre&format=json";
  const res = await httpTenace(`https://geo.api.gouv.fr/departements/${dep}/communes?${champs}`, { headers: { accept: "application/json" } });
  if (!res.ok) return [];
  const toutes = (await res.json()) as { nom: string; population?: number; centre?: { coordinates: [number, number] } }[];
  const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const ici = toutes.find((c) => norm(c.nom) === norm(nom));
  if (!ici?.centre) return [];
  const [x0, y0] = ici.centre.coordinates;
  const km = (c: { centre?: { coordinates: [number, number] } }) => {
    if (!c.centre) return Infinity;
    const [x, y] = c.centre.coordinates;
    const dx = (x - x0) * 111 * Math.cos((y0 * Math.PI) / 180);
    const dy = (y - y0) * 111;
    return Math.sqrt(dx * dx + dy * dy);
  };
  const voisines = toutes
    .filter((c) => c !== ici && (c.population ?? 0) >= 2000 && km(c) <= 30)
    .sort((a, b) => km(a) - km(b))
    .slice(0, combien - 1)
    .map((c) => c.nom);
  return [ici.nom, ...voisines];
}
