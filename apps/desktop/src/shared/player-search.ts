import { z } from 'zod';
import { personalHistoryTargetSchema } from './ipc';

export const PLAYER_SEARCH = 'history:search-player';
export const playerSearchInputSchema = z.string().trim().min(3).max(100)
  .refine(value => !/[\u0000-\u001f\u007f]/.test(value) && /^[^#]+#[^#]+$/.test(value) && value.split('#').every(part => part.trim().length > 0), '请输入完整的名字#编号');
export const playerSearchResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), target: personalHistoryTargetSchema }),
  z.object({ ok: z.literal(false), error: z.enum(['unavailable', 'not-found', 'failed', 'busy']) })
]);
export type PlayerSearchResult = z.infer<typeof playerSearchResultSchema>;
