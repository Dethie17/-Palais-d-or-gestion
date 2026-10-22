import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * Pièces jointes des réclamations.
 * Bucket PRIVÉ `reclamation-photos` : aucune image n'est publiquement listable,
 * chaque affichage passe par une URL signée à durée courte.
 */

const BUCKET = 'reclamation-photos';
const MAX_EDGE = 1200;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

export const COMPLAINT_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';

export type PhotoUploadResult =
  | { ok: true; path: string }
  | { ok: false; message: string };

/** Réduit l'image (côté client) pour rester sous les limites de Storage. */
async function resizeImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.82),
  );
  return blob ?? file;
}

/**
 * Envoie une photo et renvoie son chemin de stockage (à stocker en base).
 * Hors ligne / sans Supabase : échec explicite, le texte de la réclamation
 * reste envoyé normalement.
 */
export async function uploadComplaintPhoto(file: File, complaintId: string): Promise<PhotoUploadResult> {
  if (!ALLOWED.includes(file.type)) {
    return { ok: false, message: 'Photo JPG, PNG ou WebP uniquement.' };
  }
  if (file.size > MAX_SOURCE_BYTES) {
    return { ok: false, message: 'Photo trop lourde (8 Mo maximum).' };
  }
  if (!isSupabaseConfigured) {
    return { ok: false, message: 'Envoi de photo indisponible hors connexion.' };
  }
  try {
    const blob = await resizeImage(file);
    const ext = 'jpg';
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const path = `${complaintId}/${name}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) return { ok: false, message: 'Envoi de la photo impossible.' };
    return { ok: true, path };
  } catch {
    return { ok: false, message: 'Envoi de la photo impossible.' };
  }
}

/** URL signée temporaire (1 h) — jamais de lien public sur une preuve. */
export async function signedComplaintUrl(path: string | undefined): Promise<string | null> {
  if (!path) return null;
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600);
    if (error || !data) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}