"use server";
// Actions exécutées sur le serveur (connexion, déconnexion, mot de passe).
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function signIn(formData: FormData) {
  if (!isSupabaseConfigured) redirect("/");
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect("/login?erreur=champs");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?erreur=identifiants");
  redirect("/");
}

export async function signOut() {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}

/** Adresse du site (http://localhost:3000 sur ton PC, l'adresse Vercel une fois en ligne). */
async function siteOrigin() {
  const h = await headers();
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Étape 1 : envoie l'e-mail « réinitialiser mon mot de passe ». */
export async function requestPasswordReset(formData: FormData) {
  if (!isSupabaseConfigured) redirect("/");
  const email = String(formData.get("email") ?? "").trim();
  if (!email) redirect("/mot-de-passe-oublie?erreur=champs");

  const supabase = await createClient();
  const origin = await siteOrigin();
  // Le lien de l'e-mail ramène sur /auth/confirm, qui ouvre une session
  // temporaire puis envoie vers la page « nouveau mot de passe ».
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/nouveau-mot-de-passe`,
  });
  // Même message que le compte existe ou non : on ne révèle pas quels e-mails sont inscrits.
  redirect("/mot-de-passe-oublie?envoye=1");
}

/** Étape 2 : enregistre le nouveau mot de passe (la personne a cliqué sur le lien). */
export async function updatePassword(formData: FormData) {
  if (!isSupabaseConfigured) redirect("/");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  if (password.length < 12) redirect("/nouveau-mot-de-passe?erreur=court");
  if (password !== confirmation) redirect("/nouveau-mot-de-passe?erreur=different");

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    const code = error.code === "same_password" ? "identique"
      : error.code === "weak_password" ? "faible"
      : "echec";
    redirect(`/nouveau-mot-de-passe?erreur=${code}`);
  }
  redirect("/?mdp=ok");
}
