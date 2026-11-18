import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { updatePassword } from "../actions";
import { AuthCard, buttonClass, inputClass } from "@/components/auth-card";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

const messages: Record<string, string> = {
  court: "Choisis au moins 12 caractères.",
  different: "Les deux mots de passe ne sont pas identiques.",
  identique: "C'est déjà ton mot de passe actuel : choisis-en un autre.",
  faible: "Ce mot de passe est trop facile à deviner. Mélange lettres, chiffres et symboles.",
  echec: "L'enregistrement a échoué. Redemande un lien depuis « Mot de passe oublié ».",
};

// On n'arrive ici qu'avec une session : soit via le lien de l'e-mail,
// soit en étant déjà connecté (pour changer son mot de passe). Le proxy s'en assure.
export default async function NewPasswordPage({ searchParams }: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  if (!isSupabaseConfigured) redirect("/");
  const { erreur } = await searchParams;
  const message = erreur ? messages[erreur] ?? messages.echec : null;

  return (
    <AuthCard title="Nouveau mot de passe" intro="Au moins 12 caractères. Une phrase courte marche très bien." message={message}>
      <form action={updatePassword} className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Nouveau mot de passe</span>
          <input name="password" type="password" autoComplete="new-password" minLength={12} required className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Encore une fois</span>
          <input name="confirmation" type="password" autoComplete="new-password" minLength={12} required className={inputClass} />
        </label>
        <button type="submit" className={buttonClass}>Enregistrer</button>
      </form>
    </AuthCard>
  );
}
