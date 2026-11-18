"use server";
// « Ce site m'intéresse » (13/11) : marquer un artisan intéressé comme traité (vue d'ensemble).
import { revalidatePath } from "next/cache";
import { getAccess } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function marquerInteretTraite(formData: FormData) {
  if (!isSupabaseConfigured) return;
  const access = await getAccess();
  if (!access?.isAdmin) return;
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  const supabase = await createClient();
  await supabase.from("maquette_interets").update({ traite_le: new Date().toISOString() }).eq("id", id);
  revalidatePath("/");
}
