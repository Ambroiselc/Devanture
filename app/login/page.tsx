import type { Metadata } from "next";
import Link from "@/components/lien";
import { redirect } from "next/navigation";
import { signIn } from "../actions";
import { AuthCard, buttonClass, inputClass } from "@/components/auth-card";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Connexion" };

const messages: Record<string, string> = {
  champs: "Renseigne ton e-mail et ton mot de passe.",
  identifiants: "E-mail ou mot de passe incorrect. Vérifie aussi que le compte existe dans Supabase > Authentication.",
  lien: "Ce lien ne marche plus (il a expiré ou a déjà servi). Redemande-en un avec « Mot de passe oublié ? », en bas.",
};

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  if (!isSupabaseConfigured) redirect("/"); // mode démo : pas de connexion
  const { erreur } = await searchParams;
  const message = erreur ? messages[erreur] ?? "La connexion a échoué." : null;

  return (
    <AuthCard title="Devanture" intro="Connecte-toi pour ouvrir le tableau de bord." message={message}>
      <form action={signIn} className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">E-mail</span>
          <input name="email" type="email" autoComplete="email" required className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Mot de passe</span>
          <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
        </label>
        <button type="submit" className={buttonClass}>Se connecter</button>
      </form>
      <p className="text-center text-sm">
        <Link href="/mot-de-passe-oublie" className="text-shop hover:underline">Mot de passe oublié ?</Link>
      </p>
    </AuthCard>
  );
}
