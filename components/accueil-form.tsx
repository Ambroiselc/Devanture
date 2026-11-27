"use client";
// Formulaire de la page d'accueil client (/bienvenue/<jeton>, 29/10).
// 1. Les photos trop lourdes sont réduites dans le téléphone (2 400 px au plus) pour aller vite sur la 4G.
// 2. Chaque fichier part directement dans le stockage Supabase, dossier « clients/<jeton>/ » (règle « clients_depot »).
// 3. Les infos et la liste des fichiers sont enregistrées par la fonction SQL accueil_enregistrer.
import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/config";

export interface ContenuAccueil {
  telephone?: string;
  horaires?: string;
  prestations?: string;
  zone?: string;
  domaine_souhaite?: string;
  /** 27/11 : lien de sa page Cal.com (photographes, coachs), intégré au site par Pedro. */
  reservation?: string;
  style?: string;
  message?: string;
}

const champ = "w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-base";
const MAX_FICHIERS = 30;
const REDUIRE = /^image\/(jpeg|png|webp)$/;

/** Réduit une photo trop lourde (au-delà de 2,5 Mo) en JPEG de 2 400 px au plus. Sinon, la garde telle quelle. */
async function reduire(f: File): Promise<Blob> {
  if (!REDUIRE.test(f.type) || f.size < 2_500_000) return f;
  try {
    const img = await createImageBitmap(f);
    const ratio = Math.min(1, 2400 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * ratio);
    canvas.height = Math.round(img.height * ratio);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
    return blob && blob.size < f.size ? blob : f;
  } catch {
    return f;
  }
}

const nomPropre = (nom: string) =>
  nom.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(-60) || "fichier";

/**
 * Grande case colorée pour choisir des photos (29/10, demande de Broise : le simple bouton du navigateur
 * passait inaperçu). Le vrai champ fichier est caché dedans ; la case affiche les photos choisies.
 */
function ZoneDepot({ name, titre, aide, multiple, accept, legendes }: {
  name: string; titre: string; aide: string; multiple?: boolean; accept: string;
  /** 30/10 : une petite légende facultative sous chaque photo choisie (champs « legende-<n> »). */
  legendes?: boolean;
}) {
  const [choisis, setChoisis] = useState<{ nom: string; url: string | null }[]>([]);
  return (
    <div>
    <label className="block cursor-pointer rounded-xl border-2 border-dashed border-shop bg-shop-soft px-4 py-5 text-center transition-colors hover:bg-shop-soft/70 focus-within:ring-2 focus-within:ring-shop">
      <input
        type="file" name={name} accept={accept} multiple={multiple} className="sr-only"
        onChange={(e) => {
          for (const c of choisis) if (c.url) URL.revokeObjectURL(c.url);
          setChoisis(Array.from(e.target.files ?? []).map((f) => ({
            nom: f.name, url: f.type.startsWith("image/") && !/hei[cf]/.test(f.type) ? URL.createObjectURL(f) : null,
          })));
        }}
      />
      <span aria-hidden className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-shop text-xl text-white dark:text-[var(--paper)]">
        {choisis.length > 0 ? "✓" : "+"}
      </span>
      <span className="block text-base font-semibold text-shop">
        {choisis.length > 0
          ? `${choisis.length} ${multiple ? (choisis.length > 1 ? "photos choisies" : "photo choisie") : "fichier choisi"}`
          : titre}
      </span>
      <span className="mt-1 block text-xs text-muted">{choisis.length > 0 ? "Appuyez de nouveau pour changer votre choix." : aide}</span>
      {choisis.length > 0 && (
        <span className="mt-3 flex flex-wrap justify-center gap-2">
          {choisis.slice(0, 12).map((c, i) => c.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={c.url} alt="" className="h-14 w-14 rounded-md object-cover" />
          ) : (
            <span key={i} className="flex h-14 w-14 items-center justify-center rounded-md bg-surface px-1 text-[10px] text-muted">{c.nom.slice(-12)}</span>
          ))}
          {choisis.length > 12 && <span className="self-center text-xs text-muted">+ {choisis.length - 12}</span>}
        </span>
      )}
    </label>
    {legendes && choisis.length > 0 && (
      <div className="mt-4 space-y-3">
        <p className="text-sm">
          <span className="font-medium">Un petit mot sous chaque photo ?</span>{" "}
          <span className="text-muted">Facultatif. Par exemple « Toiture en ardoise refaite à Croix » ou « Avant les travaux ».</span>
        </p>
        <ul className="space-y-2">
          {choisis.map((c, i) => (
            <li key={`${c.nom}-${i}`} className="flex items-center gap-3">
              {c.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.url} alt="" className="h-14 w-14 flex-none rounded-md object-cover" />
              ) : (
                <span className="flex h-14 w-14 flex-none items-center justify-center rounded-md bg-surface px-1 text-[10px] text-muted">{c.nom.slice(-12)}</span>
              )}
              <input name={`legende-${i}`} maxLength={90} placeholder="Ce que montre la photo (facultatif)"
                aria-label={`Légende de la photo ${i + 1}`}
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-base" />
            </li>
          ))}
        </ul>
      </div>
    )}
    </div>
  );
}

export function AccueilForm({ jeton, contenu, commune, pro, independant = false }: {
  jeton: string; contenu: ContenuAccueil; commune: string | null; pro: boolean;
  /** 27/11 : photographe ou coach (site « indépendant ») : autres consignes pour les photos. */
  independant?: boolean;
}) {
  const [etat, setEtat] = useState<"pret" | "envoi" | "fini" | "erreur">("pret");
  const [progres, setProgres] = useState("");
  const [erreur, setErreur] = useState("");

  async function envoyer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const logo = (form.getAll("logo") as File[]).filter((f) => f.size > 0).map((f) => ({ f, sorte: "logo" }));
    // La légende suit sa photo : on la lit avant de retirer les fichiers vides.
    const photos = (form.getAll("photos") as File[])
      .map((f, i) => ({ f, sorte: "photo", legende: String(form.get(`legende-${i}`) ?? "").trim().slice(0, 90) }))
      .filter((x) => x.f.size > 0);
    const fichiers: { f: File; sorte: string; legende?: string }[] = [...logo, ...photos];
    if (fichiers.length > MAX_FICHIERS) {
      setErreur(`${MAX_FICHIERS} fichiers au plus à la fois. Envoyez le reste ensuite, en revenant sur cette page.`);
      setEtat("erreur");
      return;
    }
    setEtat("envoi");
    setErreur("");
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
    const deposes: { chemin: string; nom: string; sorte: string; taille: number; legende?: string }[] = [];
    const rates: string[] = [];
    const lot = Date.now().toString(36);
    for (const [i, { f, sorte, legende }] of fichiers.entries()) {
      setProgres(`Envoi du fichier ${i + 1} sur ${fichiers.length}…`);
      const blob = await reduire(f);
      const reduit = blob !== f;
      const nom = reduit ? nomPropre(f.name).replace(/\.[a-z0-9]+$/i, "") + ".jpg" : nomPropre(f.name);
      const chemin = `${jeton}/${lot}-${String(i + 1).padStart(2, "0")}-${sorte}-${nom}`;
      const { error } = await supabase.storage.from("clients").upload(chemin, blob, {
        contentType: reduit ? "image/jpeg" : f.type || undefined, upsert: false,
      });
      if (error) rates.push(f.name);
      else deposes.push({ chemin, nom: f.name, sorte, taille: blob.size, ...(legende ? { legende } : {}) });
    }

    setProgres("Enregistrement…");
    const infos: ContenuAccueil = {};
    for (const k of ["telephone", "horaires", "prestations", "zone", "domaine_souhaite", "reservation", "style", "message"] as const) {
      const v = String(form.get(k) ?? "").trim();
      if (v) infos[k] = v.slice(0, 3000);
    }
    const { data: ok, error } = await supabase.rpc("accueil_enregistrer", {
      p_jeton: jeton, p_contenu: infos, p_fichiers: deposes,
    });
    if (error || !ok) {
      setErreur("L'enregistrement n'a pas marché. Réessayez dans un instant, ou répondez simplement à mon e-mail avec vos infos.");
      setEtat("erreur");
      return;
    }
    if (rates.length > 0) {
      setErreur(`Vos infos sont bien enregistrées, mais ${rates.length} fichier(s) n'ont pas pu partir (${rates.slice(0, 3).join(", ")}${rates.length > 3 ? "…" : ""}). Ils sont peut-être trop lourds (15 Mo au plus) : vous pouvez me les envoyer par e-mail.`);
      setEtat("erreur");
      return;
    }
    setEtat("fini");
  }

  if (etat === "fini") {
    return (
      <div className="mt-8 rounded-xl border border-line bg-surface px-5 py-6">
        <h2 className="font-display text-xl font-semibold">Merci, c&apos;est bien reçu !</h2>
        <p className="mt-2 text-muted">
          Je prépare votre site et je vous envoie un aperçu par e-mail. Un oubli ? Revenez sur cette page avec le même lien
          pour ajouter des photos ou compléter.
        </p>
      </div>
    );
  }

  const envoi = etat === "envoi";
  return (
    <form onSubmit={envoyer} className="mt-8 space-y-6">
      <fieldset className="space-y-4 rounded-xl border border-line bg-surface px-4 py-5 sm:px-5">
        <legend className="px-1 font-display text-lg font-semibold">Vos photos</legend>
        <ZoneDepot name="photos" accept="image/*" multiple legendes
          titre={independant ? `Appuyez ici pour ajouter vos plus belles photos${pro ? "" : " (10 environ)"}`
            : `Appuyez ici pour ajouter les photos de vos chantiers${pro ? "" : " (10 environ)"}`}
          aide={independant
            ? "Vos photos préférées, en bonne qualité. Ajoutez aussi un portrait de vous et écrivez « moi » dans sa légende : il ira dans la partie « À propos »."
            : "Avant / après, réalisations, vous au travail, votre camion… Prises au téléphone, c'est parfait."} />
        <ZoneDepot name="logo" accept="image/*,.pdf"
          titre="Votre logo, si vous en avez un"
          aide="Une photo ou un fichier, même un vieux papier à en-tête pris en photo." />
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border border-line bg-surface px-4 py-5 sm:px-5">
        <legend className="px-1 font-display text-lg font-semibold">Votre activité</legend>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Vos prestations</span>
          <textarea name="prestations" rows={4} defaultValue={contenu.prestations} className={champ}
            placeholder="Ex. : rénovation de toiture, zinguerie, démoussage, pose de Velux…" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Les communes où vous intervenez</span>
          <input name="zone" defaultValue={contenu.zone} className={champ}
            placeholder={commune ? `Ex. : ${commune} et 20 km autour` : "Ex. : Lille et 20 km autour"} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Vos horaires</span>
          <input name="horaires" defaultValue={contenu.horaires} className={champ} placeholder="Ex. : du lundi au vendredi, 8 h – 18 h" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Le numéro à afficher sur le site</span>
          <input name="telephone" type="tel" defaultValue={contenu.telephone} className={champ} placeholder="06 …" />
        </label>
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border border-line bg-surface px-4 py-5 sm:px-5">
        <legend className="px-1 font-display text-lg font-semibold">Votre site</legend>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">L&apos;adresse que vous aimeriez</span>
          <input name="domaine_souhaite" defaultValue={contenu.domaine_souhaite} className={champ} placeholder="Ex. : votre-entreprise.fr" />
          <span className="mt-1 block text-xs text-muted">Je vérifie qu&apos;elle est libre. Elle sera enregistrée à votre nom, une fois votre site validé.</span>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Votre page de réservation (facultatif)</span>
          <input name="reservation" type="url" defaultValue={contenu.reservation} className={champ} placeholder="Ex. : https://cal.com/votre-nom" />
          <span className="mt-1 block text-xs text-muted">Photographes, coachs… : le lien de votre compte Cal.com, que nous créons ensemble pendant l&apos;appel de lancement. Vos clients réserveront directement depuis votre site.</span>
        </label>
        <div className="text-sm">
          <span className="mb-1 block font-medium">Le style que vous préférez</span>
          {[["sobre", "Le sobre"], ["chaleureux", "Le chaleureux"], ["indifferent", "Je vous laisse choisir"]].map(([v, l]) => (
            <label key={v} className="mr-5 inline-flex items-center gap-2 py-1">
              <input type="radio" name="style" value={v} defaultChecked={contenu.style === v} className="h-4 w-4 accent-[var(--shop)]" />
              {l}
            </label>
          ))}
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Autre chose à me dire ?</span>
          <textarea name="message" rows={3} defaultValue={contenu.message} className={champ}
            placeholder="Ex. : mettre en avant la rénovation, ne pas afficher mon adresse…" />
        </label>
      </fieldset>

      {erreur && <p className="rounded-lg bg-[var(--t-danger-bg)] px-4 py-3 text-sm text-[var(--t-danger-fg)]">{erreur}</p>}
      <button type="submit" disabled={envoi}
        className="w-full rounded-lg bg-shop px-4 py-3 text-base font-semibold text-white hover:opacity-90 disabled:opacity-60 dark:text-[var(--paper)]">
        {envoi ? progres || "Envoi…" : "Envoyer"}
      </button>
    </form>
  );
}
