// Toutes les requêtes Internet de l'agent passent par ici.
// En mode simulation (DEVANTURE_SIMULATION=1), aucune requête ne part :
// des réponses fictives sont renvoyées à la place (voir fake.ts).
import { fakeFetch } from "./fake.ts";

export const SIMULATION = process.env.DEVANTURE_SIMULATION === "1";

export const USER_AGENT =
  "DevantureBot/1.0 (+https://devanture.fr ; prospection B2B, contact@devanture.fr)";

export function http(url: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<Response> {
  if (SIMULATION) return fakeFetch(url, init);
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, SIMULATION ? 0 : ms));

/**
 * Comme http(), mais réessaie quand le réseau coupe (« fetch failed ») ou que le serveur répond 5xx/429 (12/11 : une
 * coupure de geo.api.gouv.fr avait fait échouer tout le passage RGE de Loïc). 3 essais, 2 puis 6 s d'attente.
 * Seulement pour les lectures (GET) vers des API publiques : jamais pour un envoi.
 */
export async function httpTenace(url: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<Response> {
  for (let essai = 1; ; essai++) {
    try {
      const res = await http(url, init, timeoutMs);
      if ((res.status < 500 && res.status !== 429) || essai >= 3) return res;
    } catch (err) {
      if (essai >= 3) throw err;
    }
    await sleep(essai === 1 ? 2_000 : 6_000);
  }
}

/**
 * Appel à l'API Claude qui réessaie (13/11 : Anthropic a répondu « 503 credential validation failed » plusieurs minutes
 * de suite, et Loïc s'arrêtait après 3 artisans ratés). Réessaie sur coupure réseau, 429, 5xx et 529 (surcharge) :
 * 4 essais, après 5, 20 puis 45 s. Un appel raté ne coûte rien (rien n'est facturé sans réponse).
 */
export async function httpClaude(url: string, init: RequestInit = {}, timeoutMs = 60_000): Promise<Response> {
  const attentes = [5_000, 20_000, 45_000];
  for (let essai = 0; ; essai++) {
    try {
      const res = await http(url, init, timeoutMs);
      if ((res.status < 500 && res.status !== 429) || essai >= attentes.length) return res;
      console.log(`API Claude : erreur ${res.status}, nouvel essai dans ${attentes[essai] / 1000} s`);
    } catch (err) {
      if (essai >= attentes.length) throw err;
      console.log(`API Claude : ${(err as Error).message}, nouvel essai dans ${attentes[essai] / 1000} s`);
    }
    await sleep(attentes[essai]);
  }
}
