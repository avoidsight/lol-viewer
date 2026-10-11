import { z } from 'zod';

// Isolate malformed games, but never turn a wholly incompatible response into
// a successful empty history. Required combat values are not defaulted to zero.
export function compatibleGames<T extends z.ZodTypeAny>(schema: T) {
  return z.array(z.unknown()).transform((entries, ctx): z.output<T>[] => {
    const games = entries.flatMap(entry => {
      const result = schema.safeParse(entry);
      return result.success ? [result.data] : [];
    });
    if (entries.length && !games.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'No compatible history entries' });
      return z.NEVER;
    }
    return games;
  });
}
