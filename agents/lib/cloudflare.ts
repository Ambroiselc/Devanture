// Cloudflare, pour la mise en ligne des sites des clients (Pedro, 30/10).
// Clé : secret GitHub CLOUDFLARE_API_TOKEN (celle de la mise en ligne du tableau de bord), qui doit aussi avoir
// « Zone > DNS > Edit » pour brancher un domaine (voir docs/sites-clients.md). Compte : CLOUDFLARE_ACCOUNT_ID.
import { http } from "./http.ts";

/** Le Worker qui sert tous les sites des clients (workers/sites). */
export const WORKER_SITES = "devanture-sites";

interface Reponse<T> { success: boolean; errors?: { code: number; message: string }[]; result: T }

async function api<T>(chemin: string, init: RequestInit = {}): Promise<T> {
  const cle = process.env.CLOUDFLARE_API_TOKEN;
  if (!cle) throw new Error("CLOUDFLARE_API_TOKEN manquante (secret GitHub).");
  const res = await http(`https://api.cloudflare.com/client/v4${chemin}`, {
    ...init,
    headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  }, 30_000);
  const json = (await res.json().catch(() => ({ success: false, errors: [{ code: res.status, message: res.statusText }] }))) as Reponse<T>;
  if (!res.ok || !json.success) {
    const message = json.errors?.map((e) => `${e.code} ${e.message}`).join(" ; ") || String(res.status);
    if (res.status === 403 || /authentication|permission|not authorized/i.test(message)) {
      throw new Error(`Cloudflare refuse (${message}). La clé CLOUDFLARE_API_TOKEN doit avoir « Workers Scripts : Edit », `
        + "« Workers Routes : Edit » et « DNS : Edit » sur toutes les zones (docs/sites-clients.md).");
    }
    throw new Error(`Cloudflare (${chemin.split("?")[0]}) : ${message}`);
  }
  return json.result;
}

const compte = () => {
  const id = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!id) throw new Error("CLOUDFLARE_ACCOUNT_ID manquant (secret GitHub).");
  return id;
};

/** La zone Cloudflare du domaine (il doit avoir été ajouté avec « + Add → Connect a domain »). */
export async function zoneDuDomaine(domaine: string): Promise<{ id: string; statut: string }> {
  const zones = await api<{ id: string; status: string }[]>(`/zones?name=${encodeURIComponent(domaine)}&account.id=${compte()}`);
  if (!zones.length) {
    throw new Error(`${domaine} n'est pas encore dans Cloudflare : « + Add → Connect a domain », plan Free, `
      + "puis recopier les 2 serveurs DNS de Cloudflare chez OVH (docs/apres-signature.md, étape 6).");
  }
  return { id: zones[0].id, statut: zones[0].status };
}

/**
 * Relie une adresse (domaine ou www.domaine) au Worker des sites. Cloudflare crée l'enregistrement DNS et le certificat.
 * Les anciens enregistrements A, AAAA ou CNAME de cette adresse (souvent recopiés depuis OVH : page de parking) bloquent
 * le branchement : on les retire d'abord. Rien d'autre n'est touché (MX, TXT : e-mails du client).
 */
export async function brancherAdresse(adresse: string, zoneId: string): Promise<void> {
  const existants = await api<{ hostname: string; service: string }[]>(`/accounts/${compte()}/workers/domains?hostname=${encodeURIComponent(adresse)}`);
  if (existants.some((d) => d.hostname === adresse && d.service === WORKER_SITES)) return;

  const enregistrements = await api<{ id: string; type: string; name: string; meta?: { read_only?: boolean } }[]>(
    `/zones/${zoneId}/dns_records?name=${encodeURIComponent(adresse)}&per_page=50`);
  for (const r of enregistrements) {
    if (["A", "AAAA", "CNAME"].includes(r.type) && !r.meta?.read_only) {
      await api(`/zones/${zoneId}/dns_records/${r.id}`, { method: "DELETE" });
    }
  }
  await api(`/accounts/${compte()}/workers/domains`, {
    method: "PUT",
    body: JSON.stringify({ environment: "production", hostname: adresse, service: WORKER_SITES, zone_id: zoneId }),
  });
}

/** Le Worker des sites existe-t-il déjà ? (Il est publié par le workflow « Sites des clients — serveur ».) */
export async function workerSitesExiste(): Promise<boolean> {
  try {
    await api(`/accounts/${compte()}/workers/scripts/${WORKER_SITES}/settings`);
    return true;
  } catch {
    return false;
  }
}
