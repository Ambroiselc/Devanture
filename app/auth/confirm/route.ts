// Arrivée depuis un lien envoyé par Supabase (mot de passe oublié, invitation…).
// On échange le jeton du lien contre une session, puis on redirige.
import { type NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

// N'accepte que des chemins internes (évite de renvoyer vers un autre site).
function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNext(url.searchParams.get("next"));
  const fail = new URL("/login?erreur=lien", request.url);
  if (!isSupabaseConfigured) return NextResponse.redirect(new URL("/", request.url));

  const supabase = await createClient();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  // Deux formats de lien possibles selon le modèle d'e-mail de Supabase.
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("lien incomplet") };

  if (error) return NextResponse.redirect(fail);
  return NextResponse.redirect(new URL(next, request.url));
}
