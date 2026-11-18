// Le « proxy » s'exécute avant chaque page.
// Son rôle : rafraîchir la session Supabase et renvoyer vers /login
// toute personne non connectée. En mode démo, il ne fait rien.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, supabaseKey, supabaseUrl } from "@/lib/supabase/config";
import { estDomaineProspection, SITE_VITRINE } from "@/lib/domaines-prospection";

// 5/11 : le tableau de bord tourne sur Google Cloud Run (gratuit, sans la limite de 10 ms de Cloudflare).
// Une fois NEXT_PUBLIC_TABLEAU_URL renseignée (variable GitHub TABLEAU_URL, voir docs/cloud-run.md), l'ancienne adresse
// app.devanture-artisans.fr ne garde que les pages publiques et renvoie tout le reste vers Cloud Run.
const TABLEAU_URL = (process.env.NEXT_PUBLIC_TABLEAU_URL ?? "").replace(/\/$/, "");
const PAGES_PUBLIQUES = ["/m/", "/bienvenue/"];
const API_PUBLIQUES = ["/api/devis", "/api/visite"];

function estPublique(path: string) {
  return PAGES_PUBLIQUES.some((p) => path.startsWith(p)) || API_PUBLIQUES.includes(path);
}

export async function proxy(request: NextRequest) {
  const path0 = request.nextUrl.pathname;
  // 9/11 : domaine de prospection (devanture-sites.fr) : seulement les maquettes ; le reste va vers le site vitrine
  // (ex. devanture-sites.fr/donnees-personnelles, cité en bas des e-mails de Valérie). Jamais le tableau de bord.
  if (estDomaineProspection(request.nextUrl.hostname)) {
    if (path0.startsWith("/m/")) return NextResponse.next();
    // 13/11 : la provenance est perdue après ce renvoi (une messagerie n'indique pas d'où vient le clic) ; on la note
    // dans ?src= pour le compteur du site vitrine : « maquette » si on vient d'une maquette, sinon « e-mail de prospection ».
    const q = new URLSearchParams(request.nextUrl.search);
    if (!q.has("src") && !q.has("utm_source")) {
      let depuisMaquette = false;
      try { depuisMaquette = new URL(request.headers.get("referer") ?? "").pathname.startsWith("/m/"); } catch { /* aucun */ }
      q.set("src", depuisMaquette ? "maquette" : "email");
    }
    return NextResponse.redirect(`${SITE_VITRINE}${path0}?${q.toString()}`, 302);
  }
  if (TABLEAU_URL && request.nextUrl.hostname === "app.devanture-artisans.fr" && !estPublique(path0)) {
    return NextResponse.redirect(`${TABLEAU_URL}${path0}${request.nextUrl.search}`, 307);
  }
  if (!isSupabaseConfigured) return NextResponse.next();
  // Maquettes publiques (/m/<slug>) : visibles par les artisans, sans connexion.
  if (request.nextUrl.pathname.startsWith("/m/")) return NextResponse.next();
  // Page d'accueil des nouveaux clients (/bienvenue/<jeton>, 29/10) : sans connexion, le jeton suffit.
  if (request.nextUrl.pathname.startsWith("/bienvenue/")) return NextResponse.next();
  // Formulaire de devis des sites des clients (30/10) : appelé depuis leurs sites, sans connexion.
  if (request.nextUrl.pathname === "/api/devis") return NextResponse.next();
  // Compteur de visites du site vitrine (2/11) : appelé depuis devanture-artisans.fr, sans connexion.
  if (request.nextUrl.pathname === "/api/visite") return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // getClaims() vérifie la signature du jeton : on peut s'y fier.
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims?.sub);
  const path = request.nextUrl.pathname;
  // Pages accessibles sans être connecté.
  const isLoginPage = path.startsWith("/login") || path.startsWith("/mot-de-passe-oublie");
  const isAuthCallback = path.startsWith("/auth/");

  if (isAuthCallback) return response;
  if (!isLoggedIn && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return response;
}

export const config = {
  // Ne s'applique pas aux fichiers statiques (images, CSS, polices…).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)"],
};
