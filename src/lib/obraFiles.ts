// Fotos e documentos das obras: mesmo bucket privado dos arquivos da equipe ("task-files"), na pasta
// obras/<id>. As fotos são reduzidas no navegador antes do envio (celular manda fotos de 4–8 MB).

import { backend } from './backend';
import { TEAM_FILES_BUCKET, uploadTeamFile } from './teamFiles';
import type { ObraPhoto } from './types';

/** Reduz a foto para no máximo `maxDim` px no maior lado, em JPEG. Outros arquivos voltam iguais. */
export async function compressImage(file: File, maxDim = backend.mode === 'local' ? 1024 : 1920, quality = backend.mode === 'local' ? 0.72 : 0.82): Promise<File> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) || typeof createImageBitmap === 'undefined') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    // Já pequena e leve: mantém o original
    if (scale === 1 && file.size < 900_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export async function uploadObraPhoto(obraId: string, file: File, userId: string | null, extra?: Partial<ObraPhoto>): Promise<ObraPhoto> {
  const small = await compressImage(file);
  const att = await uploadTeamFile(`obras/${obraId}/fotos`, small, userId);
  return { ...att, caption: null, stage_id: null, ...extra };
}

export const isImage = (f: { type: string; name: string }) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif)$/i.test(f.name);

// Links temporários das fotos (Supabase: assinados por 5 min; local: blob). Guardados por 4 min.
const cache = new Map<string, { url: string; at: number }>();
const pending = new Map<string, Promise<string>>();

export function photoUrl(path: string): Promise<string> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < 4 * 60_000) return Promise.resolve(hit.url);
  const running = pending.get(path);
  if (running) return running;
  const p = backend
    .fileUrl(TEAM_FILES_BUCKET, path)
    .then((url) => {
      cache.set(path, { url, at: Date.now() });
      return url;
    })
    .finally(() => pending.delete(path));
  pending.set(path, p);
  return p;
}
