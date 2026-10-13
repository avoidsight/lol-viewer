import { expect, it } from 'vitest';
import { diagnosticFromError, diagnosticMarker, diagnosticSchema } from './diagnostics';

const diagnostic = { id: 'D-012345ABCDEF', reason: 'SCHEMA' } as const;
it('accepts structured diagnostics and the safe marker preserved by Electron IPC', () => {
  expect(diagnosticFromError({ diagnostic })).toEqual(diagnostic);
  expect(diagnosticFromError(new Error(`Error invoking remote method: Live data unavailable${diagnosticMarker(diagnostic)}`))).toEqual(diagnostic);
});
it('rejects malformed IDs, reasons and payloads', () => {
  expect(diagnosticSchema.safeParse({ ...diagnostic, raw: 'secret' }).success).toBe(false);
  for (const error of [undefined, null, {}, new Error('[DIAG:D-012345ABCDEF:EVIL]'), new Error('[DIAG:private-name:SCHEMA]')]) {
    expect(diagnosticFromError(error)).toBeUndefined();
  }
});
