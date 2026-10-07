// Arquivos da equipe (PDFs de tarefas e documentos de projetos): bucket privado "task-files"
// no Storage, acessível a quem é membro ativo (migração 20261015000000_task_attachments.sql).

import { backend } from './backend';
import type { FileAttachment } from './types';
import { nowIso, uid } from './utils';

export const TEAM_FILES_BUCKET = 'task-files';
export const TEAM_FILES_MAX_BYTES = 15 * 1024 * 1024;
export const TEAM_FILES_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.dwg,application/pdf,image/*';

const safeName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.-]+/g, '-')
    .slice(-80);

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

/** Envia o arquivo para a pasta (ex.: id da tarefa, "projetos/<id>") e devolve o anexo. */
export async function uploadTeamFile(folder: string, file: File, userId: string | null): Promise<FileAttachment> {
  if (file.size > TEAM_FILES_MAX_BYTES) throw new Error(`"${file.name}" tem mais de 15 MB.`);
  const path = `${folder}/${uid()}-${safeName(file.name)}`;
  await backend.uploadFile(TEAM_FILES_BUCKET, path, file);
  return { id: uid(), name: file.name, path, size: file.size, type: file.type, uploaded_at: nowIso(), uploaded_by: userId };
}

export function removeTeamFiles(paths: string[]) {
  return paths.length ? backend.removeFiles(TEAM_FILES_BUCKET, paths).catch(() => undefined) : Promise.resolve();
}

/** Abre o arquivo em nova aba (link temporário do Storage). */
export async function openTeamFile(att: FileAttachment) {
  // A aba abre já no clique para o navegador não bloquear como pop-up
  const tab = window.open('', '_blank');
  try {
    const url = await backend.fileUrl(TEAM_FILES_BUCKET, att.path);
    if (tab) tab.location.href = url;
    else window.location.href = url;
  } catch (e) {
    tab?.close();
    throw e;
  }
}
