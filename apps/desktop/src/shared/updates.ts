import { z } from 'zod';
export const UPDATE_CHECK = 'updates:check';
export const UPDATE_DOWNLOAD = 'updates:download';
export const UPDATE_CANCEL = 'updates:cancel';
export const UPDATE_INSTALL = 'updates:install';
export const UPDATE_STATUS = 'updates:status';
export const UPDATE_STATE = 'updates:state';
export const versionSchema = z.string().regex(/^(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})$/);
export const updateSchema = z.object({ version: versionSchema, notes: z.string().max(5000), important: z.boolean() }).strict();
export type AvailableUpdate = z.infer<typeof updateSchema>;
export const updateDownloadSchema = z.object({
  phase: z.enum(['idle', 'checking', 'downloading', 'verifying', 'ready', 'installing', 'error']),
  version: versionSchema.optional(),
  receivedBytes: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  error: z.string().max(200).optional()
}).strict();
export type UpdateDownloadState = z.infer<typeof updateDownloadSchema>;
export const idleUpdateDownload: UpdateDownloadState = { phase: 'idle', receivedBytes: 0, totalBytes: 0 };
export function newerVersion(candidate: string, current: string): boolean {
  if (!versionSchema.safeParse(candidate).success || !versionSchema.safeParse(current).success) return false;
  const a = candidate.split('.').map(Number), b = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return false;
}
