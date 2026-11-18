import type { Metadata } from "next";
import Link from "@/components/lien";
import { redirect } from "next/navigation";
import { requestPasswordReset } from "../actions";
import { AuthCard, buttonClass, inputClass } from "@/components/auth-card";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default async function ForgotPasswordPage({ searchParams }: {
  searchParams: Promise<{ envoye?: string; erreur?: string }>;
}) {
  if (!isSupabaseConfigured) redirect("/");
  const { envoye, erreur } = await searchParams;

  if (envoye) {
    return (
      <AuthCard title="E-mail envoyé" tone="success"
        intro="Si un compte existe avec cette adresse, tu vas recevoir un lien pour choisir un nouveau mot de passe."
        message="Pense à regarder dans les indésirables. Le lien n'est valable qu'une fois, pendant 1 heure.">
        <p className="text-center text-sm">
          <Link href="/login" className="text-shop hover:underline">Retour à la connexion</Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Mot de passe oublié"
      intro="Indique ton e-mail : tu recevras un lien pour en choisir un nouveau."
      message={erreur ? "Renseigne ton e-mail." : null}>
      <form action={requestPasswordReset} className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">E-mail</span>
          <input name="email" type="email" autoComplete="email" required className={inputClass} />
        </label>
        <button type="submit" className={buttonClass}>Recevoir le lien</button>
      </form>
      <p className="text-center text-sm">
        <Link href="/login" className="text-shop hover:underline">Retour à la connexion</Link>
      </p>
    </AuthCard>
  );
}
