// Page d'ACCUEIL d'un nouveau client (29/10) : /bienvenue/<jeton>, le lien de l'e-mail de bienvenue.
// Visible sans connexion (exception dans proxy.ts). Le jeton (64 caractères aléatoires) est la seule clé :
// la page ne montre que le nom de l'entreprise et ce que le client a déjà envoyé (fonction SQL accueil_client).
// Le formulaire dépose les fichiers directement dans le stockage Supabase (pas par le serveur, trop lent sur
// le plan gratuit de Cloudflare), puis enregistre les infos avec accueil_enregistrer.
import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { AccueilForm, type ContenuAccueil } from "@/components/accueil-form";
import { isSupabaseConfigured, supabaseKey, supabaseUrl } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Votre site avec Devanture",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

interface Accueil {
  entreprise: string;
  metier: string | null;
  commune: string | null;
  formule: "essentiel" | "pro";
  etape: string;
  contenu: ContenuAccueil;
  nb_fichiers: number;
  ouvert: boolean;
}

function Cadre({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <p className="font-display text-lg font-semibold text-shop">Devanture</p>
      {children}
      <p className="mt-12 text-xs text-muted">
        Ambroise Le Clerc EI (Devanture) · Vos informations servent uniquement à créer votre site.{" "}
        <a className="underline" href="https://devanture-artisans.fr/donnees-personnelles">Données personnelles</a>
      </p>
    </main>
  );
}

export default async function BienvenuePage({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  let accueil: Accueil | null = null;
  if (isSupabaseConfigured && /^[0-9a-f]{64}$/.test(jeton)) {
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
    const { data } = await supabase.rpc("accueil_client", { p_jeton: jeton });
    accueil = (data as Accueil | null) ?? null;
  }

  if (!accueil) {
    return (
      <Cadre>
        <h1 className="mt-6 font-display text-2xl font-semibold">Ce lien ne fonctionne pas</h1>
        <p className="mt-3 text-muted">Il est peut-être incomplet. Répondez simplement à mon e-mail : je vous le renvoie.</p>
      </Cadre>
    );
  }

  if (!accueil.ouvert) {
    return (
      <Cadre>
        <h1 className="mt-6 font-display text-2xl font-semibold">{accueil.entreprise}</h1>
        <p className="mt-3">Votre site est déjà validé, merci ! Pour un changement, répondez simplement à l&apos;un de mes e-mails.</p>
      </Cadre>
    );
  }

  return (
    <Cadre>
      <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight">Bienvenue, {accueil.entreprise}</h1>
      <p className="mt-3 text-muted">
        Merci pour votre confiance ! Cette page sert à me donner ce qu&apos;il faut pour votre site. Remplissez ce que vous
        pouvez : rien n&apos;est obligatoire, et vous pouvez revenir ajouter des photos plus tard.
      </p>
      {accueil.nb_fichiers > 0 && (
        <p className="mt-4 rounded-lg bg-shop-soft px-4 py-3 text-sm">
          J&apos;ai déjà bien reçu {accueil.nb_fichiers} fichier{accueil.nb_fichiers > 1 ? "s" : ""}. Vous pouvez en ajouter d&apos;autres.
        </p>
      )}
      <AccueilForm jeton={jeton} contenu={accueil.contenu ?? {}} commune={accueil.commune} pro={accueil.formule === "pro"} />
    </Cadre>
  );
}
