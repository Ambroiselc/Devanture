// Réveil des agents (19/11 pour Valérie, 20/11 pour tous) : GitHub lançait ses créneaux programmés avec des heures de
// retard (bilan de Coco à 1 h du matin au lieu de 18 h 13, Loïc à 21 h 34 au lieu de 13 h 17) ou pas du tout.
// Ce Worker tourne chaque minute (un seul Cron Trigger Cloudflare, gratuit) et lance par l'API GitHub les workflows
// dont l'horaire tombe à cette minute. Les horaires sont ceux des anciens « cron » GitHub, en UTC, recopiés aussi dans
// lib/prochaines-taches.ts (affichage du tableau de bord) : changer les deux ensemble.
interface Env { GITHUB_TOKEN: string }

const DEPOT = "Ambroiselc/Devanture";

interface Tache { workflow: string; cron: string; inputs?: Record<string, string> }
const TACHES: Tache[] = [
  { workflow: "agent-envoi.yml", cron: "7,37 7-16 * * 1-5" },            // Valérie : envoi, toutes les 30 min en journée
  { workflow: "agent-boite.yml", cron: "23 7-19/2 * * *" },              // Inès : boîte mail, toutes les 2 h
  { workflow: "agent-prospection.yml", cron: "17 6,12 * * *", inputs: { auto: "true" } }, // Loïc → Sid → Valérie
  { workflow: "agent-coco.yml", cron: "13 17 * * *" },                   // Coco : bilan du soir
  { workflow: "agent-site.yml", cron: "47 8 * * 1-5" },                  // Pedro : sites des clients
  { workflow: "controle-spam.yml", cron: "41 6 * * 1" },                 // contrôle anti-spam du lundi
  { workflow: "sauvegarde-supabase.yml", cron: "17 2 * * 1" },           // sauvegarde du lundi
];

/** Une partie d'expression cron (« 7,37 », « 7-16 », « 7-19/2 », « * », « 1-5 ») contient-elle cette valeur ? */
function correspond(champ: string, valeur: number): boolean {
  return champ.split(",").some((morceau) => {
    const [plage, pasTexte] = morceau.split("/");
    const pas = pasTexte ? Number(pasTexte) : 1;
    let debut: number, fin: number;
    if (plage === "*") { debut = 0; fin = 59; }
    else if (plage.includes("-")) { [debut, fin] = plage.split("-").map(Number); }
    else { debut = fin = Number(plage); if (pasTexte) fin = 59; }
    return valeur >= debut && valeur <= fin && (valeur - debut) % pas === 0;
  });
}

function aLHeure(cron: string, d: Date): boolean {
  const [min, heure, jourMois, mois, jourSemaine] = cron.trim().split(/\s+/);
  return correspond(min, d.getUTCMinutes()) && correspond(heure, d.getUTCHours())
    && correspond(jourMois, d.getUTCDate()) && correspond(mois, d.getUTCMonth() + 1)
    && correspond(jourSemaine, d.getUTCDay());
}

async function lancer(env: Env, t: Tache): Promise<void> {
  const res = await fetch(`https://api.github.com/repos/${DEPOT}/actions/workflows/${t.workflow}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "devanture-reveil", // obligatoire pour GitHub
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main", ...(t.inputs ? { inputs: t.inputs } : {}) }),
  });
  if (!res.ok) console.error(`GitHub a refusé de lancer ${t.workflow} : ${res.status} ${await res.text()}`);
  else console.log(`${t.workflow} lancé`);
}

export default {
  async scheduled(ctrl: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (!env.GITHUB_TOKEN) { console.error("Secret GITHUB_TOKEN manquant"); return; }
    const maintenant = new Date(ctrl.scheduledTime);
    const aLancer = TACHES.filter((t) => aLHeure(t.cron, maintenant));
    if (aLancer.length) ctx.waitUntil(Promise.all(aLancer.map((t) => lancer(env, t))).then(() => undefined));
  },
  async fetch(): Promise<Response> {
    return new Response("devanture-reveil : rien à voir ici.", { status: 404 });
  },
};
