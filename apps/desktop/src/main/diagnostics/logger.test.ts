// @vitest-environment node
import { mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import { DiagnosticLogger, lcuOperation, recordDiagnostic, safeIssues, safeLiveError, setDiagnosticLogger } from './logger';
import { diagnosticFromError } from '../../shared/diagnostics';
import { historyRefreshMessage, safeHistoryError } from '../../shared/history-error';

const environment = { version: '1.2.3', platform: 'win32', osVersion: '10.0.22631', arch: 'x64' };
const directories: string[] = [];
async function directory() {
  const path = await mkdtemp(join(tmpdir(), 'lol-diagnostics-unit-'));
  directories.push(path); return path;
}
afterEach(async () => {
  setDiagnosticLogger();
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});

it('records only fixed context and schema paths, and correlates IPC errors with the local log', async () => {
  const logger = new DiagnosticLogger(await directory(), environment);
  setDiagnosticLogger(logger);
  logger.setPhase('ChampSelect');
  const issues = new z.ZodError([{ code: 'custom', path: ['participants', 0, 'stats', 'kills'], message: 'secret-token player#12345' },
    { code: 'custom', path: ['private-player-puuid'], message: 'C:\\Users\\name' }]);
  const error = Object.assign(new Error('LCU response did not match its schema: private-body'), { code: 'LCU_INVALID_RESPONSE' });
  const diagnostic = logger.error('lcu.history', error, { source: 'lcu', status: 200, elapsedMs: 30.2, issues });
  expect(diagnostic).toEqual({ id: expect.stringMatching(/^D-[A-F0-9]{12}$/), reason: 'SCHEMA' });
  expect(recordDiagnostic('history.load', error)).toEqual(diagnostic);
  const ipcError = safeHistoryError(error);
  expect(diagnosticFromError(ipcError)).toEqual(diagnostic);
  expect(historyRefreshMessage(ipcError)).toContain(diagnostic!.id);
  expect(diagnosticFromError(safeLiveError(error, 'live.load'))).toEqual(diagnostic);
  const exported = await logger.exportText();
  for (const secret of ['secret-token', 'player#12345', 'private-player-puuid', 'private-body', 'Users', 'stack']) expect(exported).not.toContain(secret);
  const rows = exported.trim().split('\n').map(line => JSON.parse(line));
  expect(rows[0]).toMatchObject(environment);
  expect(rows.filter(row => row.id)).toEqual([expect.objectContaining({ ...diagnostic, operation: 'lcu.history', source: 'lcu',
    phase: 'ChampSelect', status: 200, elapsedMs: 30, issues: [{ path: 'participants.[].stats.kills', code: 'custom' }, { path: '*', code: 'custom' }] })]);
});

it('deduplicates repeated failures for 30 seconds and does not log cancellation', async () => {
  let now = Date.now();
  const logger = new DiagnosticLogger(await directory(), environment, () => now);
  const error = () => Object.assign(new Error('LCU is unavailable'), { code: 'LCU_UNAVAILABLE' });
  const first = logger.error('lcu.session', error());
  for (let n = 0; n < 10; n++) expect(logger.error('lcu.session', error())).toEqual(first);
  expect(logger.error('live.load', { code: 'MATCH_CANCELLED' })).toBeUndefined();
  now += 30_001;
  expect(logger.error('lcu.session', error())?.id).not.toBe(first!.id);
  const rows = (await logger.exportText()).trim().split('\n').map(line => JSON.parse(line));
  expect(rows.filter(row => row.reason)).toHaveLength(2);
  expect(rows).toContainEqual(expect.objectContaining({ id: first!.id, repeats: 10 }));
  expect(rows.some(row => row.operation === 'live.load')).toBe(false);
});

it('bounds disk files, write backlog, and metadata under a failure storm', async () => {
  const root = await directory();
  const logger = new DiagnosticLogger(root, environment, Date.now, 600);
  for (let n = 0; n < 1000; n++) logger.event('history.load', n);
  await logger.flush();
  const files = await readdir(root);
  expect(files.sort()).toEqual(['current.jsonl', 'previous-1.jsonl', 'previous-2.jsonl']);
  for (const name of files) expect((await stat(join(root, name))).size).toBeLessThanOrEqual(600);
  const rows = (await logger.exportText()).trim().split('\n').map(line => JSON.parse(line));
  expect(rows[0].dropped).toBeGreaterThan(0);
});

it('removes entries older than seven days even inside a newly modified file', async () => {
  const root = await directory();
  const now = Date.now();
  const old = JSON.stringify({ time: new Date(now - 8 * 86400_000).toISOString(), operation: 'phase' });
  const recent = JSON.stringify({ time: new Date(now - 86400_000).toISOString(), operation: 'startup' });
  await writeFile(join(root, 'current.jsonl'), `${old}\n${recent}\nnot-json\n`);
  await writeFile(join(root, 'unrelated.txt'), 'keep');
  const logger = new DiagnosticLogger(root, environment, () => now);
  const text = await logger.exportText();
  expect(text).not.toContain(old); expect(text).toContain(recent); expect(text).not.toContain('not-json');
  expect(await readFile(join(root, 'unrelated.txt'), 'utf8')).toBe('keep');
});

it('never overwrites a symlink target or breaks loading when storage is unavailable', async () => {
  const root = await directory();
  const target = join(root, 'keep.txt');
  await writeFile(target, 'unchanged');
  await symlink(target, join(root, 'current.jsonl'));
  const logger = new DiagnosticLogger(root, environment);
  expect(() => logger.error('live.load', new Error('storage unavailable'))).not.toThrow();
  await expect(logger.flush()).resolves.toBeUndefined();
  await expect(logger.exportText()).rejects.toThrow('Diagnostics storage unavailable');
  expect(await readFile(target, 'utf8')).toBe('unchanged');
});

it('uses a consistent snapshot when logging continues during export', async () => {
  const logger = new DiagnosticLogger(await directory(), environment);
  logger.event('history.load', 1);
  const first = logger.exportText();
  logger.event('history.load', 2);
  expect(await first).toContain('"count":1');
  expect(await first).not.toContain('"count":2');
  expect(await logger.exportText()).toContain('"count":2');
});

it('classifies paths without returning player IDs and bounds schema details', () => {
  expect(lcuOperation('/lol-summoner/v2/summoners/puuid/private-id')).toBe('lcu.summoner');
  expect(lcuOperation('/lol-match-history/v1/games/123')).toBe('lcu.detail');
  expect(lcuOperation('/unknown/private-id')).toBe('lcu.other');
  expect(safeIssues(new Error('secret'))).toEqual([]);
  const issues = new z.ZodError(Array.from({ length: 100 }, () => ({ code: 'custom', path: Array(20).fill('private-key'), message: 'secret' })));
  expect(safeIssues(issues)).toHaveLength(8);
  expect(safeIssues(issues)[0].path.split('.')).toHaveLength(10);
});
