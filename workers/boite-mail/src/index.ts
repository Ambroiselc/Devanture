// =====================================================================
// Worker Cloudflare « boite-mail » : la porte d'entrée de la boîte mail de Devanture.
//
// Cloudflare (Email Routing) lui confie chaque e-mail reçu sur …@devanture-artisans.fr. Il :
//   1. lit l'e-mail (expéditeur, objet, texte, pièces jointes) ;
//   2. l'enregistre dans Supabase (table mailbox_messages, statut « nouveau ») ;
//   3. en envoie une copie dans ta boîte Gmail (FORWARD_TO), pièces jointes comprises ;
//   4. réveille l'agente des réponses sur GitHub (si GITHUB_TOKEN est rempli) pour qu'elle le traite tout de suite.
//
// Il ne refuse jamais un e-mail : en cas de problème avec Supabase, la copie Gmail part quand même.
//
// Réglages (Cloudflare > Workers > boite-mail > Settings > Variables and Secrets) :
//   SUPABASE_URL         variable  https://xxxx.supabase.co
//   SUPABASE_SECRET_KEY  secret    clé secrète Supabase (sb_secret_… ou service_role)
//   FORWARD_TO           variable  ton adresse Gmail (adresse vérifiée dans Email Routing)
//   GITHUB_TOKEN         secret    facultatif : clé GitHub « Actions : Read and write » (la même que le tableau de bord)
//   GITHUB_REPOSITORY    variable  facultatif : Ambroiselc/Devanture
// =====================================================================
import PostalMime from "postal-mime";

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  FORWARD_TO?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPOSITORY?: string;
}

/** Ce que Cloudflare nous donne pour chaque e-mail reçu. */
interface EmailMessage {
  readonly from: string;
  readonly to: string;
  readonly headers: Headers;
  readonly raw: ReadableStream<Uint8Array>;
  readonly rawSize: number;
  forward(rcptTo: string, headers?: Headers): Promise<void>;
}

interface Ctx {
  waitUntil(promise: Promise<unknown>): void;
}

const MAX_TEXTE = 100_000; // caractères gardés du texte
const MAX_HTML = 200_000;
const MAX_TAILLE = 15 * 1024 * 1024; // au-delà, on n'analyse pas : la copie Gmail suffit

function estAutomatique(h: Headers, sujet: string): boolean {
  const auto = (h.get("auto-submitted") ?? "").toLowerCase();
  if (auto && auto !== "no") return true;
  if (h.get("x-autoreply") || h.get("x-autorespond") || h.get("x-auto-response-suppress")?.toLowerCase().includes("all")) return true;
  if (/^(bulk|junk|list|auto_reply)$/i.test(h.get("precedence") ?? "")) return true;
  return /^(r[ée]ponse automatique|automatic reply|auto(matic)?[- ]?reply|absence|out of office|absent)/i.test(sujet.trim());
}

async function enregistrer(env: Env, ligne: Record<string, unknown>): Promise<void> {
  const cle = env.SUPABASE_SECRET_KEY;
  const headers: Record<string, string> = {
    apikey: cle,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
  // Ancienne clé « service_role » (un JWT) : elle se passe aussi en Authorization.
  if (cle.startsWith("eyJ")) headers.Authorization = `Bearer ${cle}`;
  const res = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/mailbox_messages`, {
    method: "POST",
    headers,
    body: JSON.stringify(ligne),
  });
  // 409 = même Message-ID déjà reçu (Cloudflare a réessayé) : doublon ignoré.
  if (!res.ok && res.status !== 409) throw new Error(`Supabase ${res.status} : ${(await res.text()).slice(0, 300)}`);
}

async function reveillerAgente(env: Env): Promise<void> {
  if (!env.GITHUB_TOKEN) return;
  const depot = env.GITHUB_REPOSITORY || "Ambroiselc/Devanture";
  const res = await fetch(`https://api.github.com/repos/${depot}/actions/workflows/agent-boite.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "devanture-boite-mail",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main" }),
  });
  if (!res.ok) console.log(`GitHub n'a pas lancé l'agente : ${res.status} ${(await res.text()).slice(0, 200)}`);
}

export default {
  async email(message: EmailMessage, env: Env, ctx: Ctx): Promise<void> {
    // 1. Copie dans Gmail d'abord : quoi qu'il arrive ensuite, l'e-mail n'est jamais perdu.
    if (env.FORWARD_TO) {
      try {
        await message.forward(env.FORWARD_TO);
      } catch (err) {
        console.log(`Copie vers ${env.FORWARD_TO} impossible : ${(err as Error).message}`);
      }
    }

    // 2. Lecture et enregistrement dans Supabase.
    try {
      if (message.rawSize > MAX_TAILLE) {
        await enregistrer(env, {
          direction: "entrant", status: "nouveau", from_email: message.from.toLowerCase(), to_email: message.to.toLowerCase(),
          subject: message.headers.get("subject") ?? "", body_text: "(E-mail trop lourd pour être analysé : voir la copie dans Gmail.)",
          message_id: message.headers.get("message-id"), received_at: new Date().toISOString(),
        });
      } else {
        const brut = await new Response(message.raw).arrayBuffer();
        const mail = await PostalMime.parse(brut);
        const sujet = mail.subject ?? "";
        await enregistrer(env, {
          direction: "entrant",
          status: "nouveau",
          from_email: (mail.from?.address ?? message.from).toLowerCase(),
          from_name: mail.from?.name || null,
          to_email: message.to.toLowerCase(),
          subject: sujet.slice(0, 500),
          body_text: (mail.text ?? "").slice(0, MAX_TEXTE),
          body_html: mail.html ? mail.html.slice(0, MAX_HTML) : null,
          message_id: mail.messageId ?? message.headers.get("message-id"),
          in_reply_to: mail.inReplyTo ?? null,
          references_ids: mail.references ?? null,
          attachments: (mail.attachments ?? []).map((a) => ({
            nom: a.filename ?? "sans nom",
            type: a.mimeType,
            taille: typeof a.content === "string" ? a.content.length : a.content.byteLength,
          })),
          auto_submitted: estAutomatique(message.headers, sujet),
          received_at: mail.date ? new Date(mail.date).toISOString() : new Date().toISOString(),
        });
      }
      // 3. On réveille l'agente sans faire attendre Cloudflare.
      ctx.waitUntil(reveillerAgente(env));
    } catch (err) {
      // Pas de rejet : l'expéditeur ne doit jamais recevoir d'erreur. La copie Gmail est déjà partie.
      console.log(`Enregistrement impossible : ${(err as Error).message}`);
    }
  },
};
