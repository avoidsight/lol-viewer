import { z } from 'zod';
export const UPDATE_CHECK = 'updates:check';
export const UPDATE_OPEN = 'updates:open';
export const versionSchema = z.string().regex(/^(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})$/);
export const updateSchema = z.object({ version: versionSchema, notes: z.string().max(5000), important: z.boolean() }).strict();
export type AvailableUpdate = z.infer<typeof updateSchema>;
export function newerVersion(candidate: string, current: string): boolean {
  if (!versionSchema.safeParse(candidate).success || !versionSchema.safeParse(current).success) return false;
  const a = candidate.split('.').map(Number), b = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return false;
}
