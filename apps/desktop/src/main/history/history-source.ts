import { historyErrorReason } from '../../shared/history-error';
import { diagnosticEvent, recordDiagnostic } from '../diagnostics/logger';
import { matchHistoryResponseSchema } from '../lcu/match-adapter';

type Source = { kind: 'lcu' | 'sgp'; read: () => Promise<unknown> };

// Both consumers validate at the same boundary. A failing optional source must not
// hide a healthy result from the other source, but explicit privacy/auth/rate limits stay errors.
export async function readHistorySource(primary: Source, fallback?: Source) {
  const read = async (source: Source) => {
    try { return matchHistoryResponseSchema.parse(await source.read()); }
    catch (error) {
      recordDiagnostic(source.kind === 'sgp' ? 'sgp.history' : 'lcu.history', error, { source: source.kind });
      throw error;
    }
  };
  try { return await read(primary); }
  catch (error) {
    if (!fallback || ['AUTH', 'PRIVACY', 'RATE_LIMIT'].includes(historyErrorReason(error))
      || (error as { code?: string } | null)?.code === 'MATCH_CANCELLED') throw error;
    diagnosticEvent('history.fallback');
    return read(fallback);
  }
}
