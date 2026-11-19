// Réveil de Valérie (voir wrangler.jsonc). Aucune donnée, aucune base : un simple appel à l'API GitHub.
interface Env { GITHUB_TOKEN: string }

const DEPOT = "Ambroiselc/Devanture";
const WORKFLOWS = ["agent-envoi.yml"];

async function lancer(env: Env, workflow: string): Promise<void> {
  const res = await fetch(`https://api.github.com/repos/${DEPOT}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "devanture-reveil", // obligatoire pour GitHub
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main" }),
  });
  if (!res.ok) console.error(`GitHub a refusé de lancer ${workflow} : ${res.status} ${await res.text()}`);
  else console.log(`${workflow} lancé`);
}

export default {
  async scheduled(_ctrl: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (!env.GITHUB_TOKEN) { console.error("Secret GITHUB_TOKEN manquant"); return; }
    ctx.waitUntil(Promise.all(WORKFLOWS.map((w) => lancer(env, w))).then(() => undefined));
  },
  async fetch(): Promise<Response> {
    return new Response("devanture-reveil : rien à voir ici.", { status: 404 });
  },
};
