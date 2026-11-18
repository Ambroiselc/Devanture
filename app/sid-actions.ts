"use server";
// Action de la page « Sid » : lancer Sid, l'agent des maquettes (workflow GitHub « agent-demos.yml »).
// Même clé GitHub que pour Loïc (GITHUB_ACTIONS_TOKEN).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccess, loadDashboardData } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function launchSid(formData: FormData) {
  if (!isSupabaseConfigured) redirect("/sid?info=demo");
  const access = await getAccess();
  if (!access?.isAdmin) redirect("/sid?erreur=acces");

  const token = process.env.GITHUB_ACTIONS_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY_DEVANTURE || "Ambroiselc/Devanture";
  if (!token) redirect("/sid?erreur=cle");

  const limite = Number.parseInt(String(formData.get("limite") ?? ""), 10);
  if (!Number.isFinite(limite) || limite < 1 || limite > 20) redirect("/sid?erreur=invalide");

  const result = await loadDashboardData();
  if (result.mode === "supabase" && result.data.tasks.some((t) => t.agent === "site_demo" && t.status === "en_cours")) {
    redirect("/sid?erreur=occupe");
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/agent-demos.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      // Obligatoire pour GitHub ; sur Cloudflare, fetch n'en ajoute pas tout seul (sinon : refus 403).
      "User-Agent": "devanture-tableau-de-bord",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main", inputs: { limite: String(limite), prospect: "" } }),
    cache: "no-store",
  });
  if (!res.ok) {
    console.error("GitHub a refusé le lancement :", res.status, await res.text());
    redirect(`/sid?erreur=github`);
  }

  revalidatePath("/", "layout");
  redirect(`/sid?info=lance&depuis=${Date.now()}`);
}
