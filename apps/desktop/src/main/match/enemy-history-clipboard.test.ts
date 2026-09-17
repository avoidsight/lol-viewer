import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';
import { migrateDatabase } from '../cache/database';
import { createFixtureLiveMatch } from '../fixtures/live-match';
import { enemyHistorySummary } from '../../shared/enemy-history';
import { EnemyHistoryClipboard } from './enemy-history-clipboard';
const databases: Database.Database[] = [];
afterEach(() => { databases.splice(0).forEach(db => db.close()); });
function setup() {
  const db = new Database(':memory:'); databases.push(db); migrateDatabase(db);
  const match = { ...createFixtureLiveMatch('all'), gameId: '123', localTeamId: 100 };
  const deps = { enabled: vi.fn(() => true), identity: vi.fn(async () => ({ phase: 'InProgress', gameId: '123' })), write: vi.fn(), notify: vi.fn() };
  return { db, match, deps, copier: new EnemyHistoryClipboard(db, deps) };
}
it('formats only enemies, deduplicates samples and removes control/command characters', () => {
  const { match } = setup();
  const enemy = match.players.find(p => p.teamId !== 100)!;
  enemy.displayName = '/all\n坏名\u202e'; enemy.wins = 999;
  enemy.matches = [{ ...enemy.matches[0], matchId: 'one', win: true, queueId: 420 }, { ...enemy.matches[0], matchId: 'one', win: true, queueId: 420 }, { ...enemy.matches[0], matchId: 'two', win: false, queueId: 450 }];
  const text = enemyHistorySummary(match)!;
  expect(text).toContain('排位（单双/灵活）'); expect(text).toContain('all坏名：近1场1胜0负');
  expect(text).not.toContain('999'); expect(text).not.toMatch(/[\n\u202e]/);
  expect(text).not.toContain(match.players.find(p => p.teamId === 100)!.displayName);
  match.queueId = 450; expect(enemyHistorySummary(match)).toContain('all坏名：近2场1胜1负');
});
it('does not infer enemies or invent unavailable histories', () => {
  const { match } = setup();
  expect(enemyHistorySummary({ ...match, localTeamId: null })).toBeUndefined();
  expect(enemyHistorySummary({ ...match, gameId: undefined })).toBeUndefined();
  const enemies = match.players.filter(p => p.teamId !== 100);
  enemies[0].status = 'loading'; expect(enemyHistorySummary(match)).toBeUndefined();
  enemies[0].status = 'unavailable'; expect(enemyHistorySummary(match)).toContain('暂无数据');
  enemies.forEach(p => { p.status = 'unavailable'; }); expect(enemyHistorySummary(match)).toBeUndefined();
});
it('copies once across parallel loads and service recreation, then copies the next game', async () => {
  const { db, match, deps, copier } = setup();
  await Promise.all([copier.copy(match), copier.copy(match)]);
  expect(deps.write).toHaveBeenCalledTimes(1); expect(deps.notify).toHaveBeenCalledTimes(1);
  await new EnemyHistoryClipboard(db, deps).copy(match); expect(deps.write).toHaveBeenCalledTimes(1);
  match.gameId = '124'; deps.identity.mockResolvedValue({ phase: 'InProgress', gameId: '124' });
  expect(await copier.copy(match)).toBe(true); expect(deps.write).toHaveBeenCalledTimes(2);
});
it('disabled, stale, ended or aborted requests never overwrite clipboard', async () => {
  const { match, deps, copier } = setup();
  deps.enabled.mockReturnValue(false); expect(await copier.copy(match)).toBe(false); expect(deps.identity).not.toHaveBeenCalled();
  deps.enabled.mockReturnValue(true);
  deps.identity.mockResolvedValue({ phase: 'InProgress', gameId: 'another' }); expect(await copier.copy(match)).toBe(false);
  deps.identity.mockResolvedValue({ phase: 'EndOfGame', gameId: '123' }); expect(await copier.copy(match)).toBe(false);
  const controller = new AbortController();
  deps.identity.mockImplementation(async () => { controller.abort(); return { phase: 'InProgress', gameId: '123' }; });
  expect(await copier.copy(match, controller.signal)).toBe(false); expect(deps.write).not.toHaveBeenCalled();
});
it('rechecks opt-out after await and isolates clipboard failures', async () => {
  const { match, deps, copier } = setup();
  deps.identity.mockImplementation(async () => { deps.enabled.mockReturnValue(false); return { phase: 'InProgress', gameId: '123' }; });
  await copier.copy(match); expect(deps.write).not.toHaveBeenCalled();
  deps.enabled.mockReturnValue(true); deps.identity.mockResolvedValue({ phase: 'InProgress', gameId: '123' });
  deps.write.mockImplementationOnce(() => { throw new Error('clipboard unavailable'); });
  expect(await copier.copy(match)).toBe(false); expect(deps.notify).not.toHaveBeenCalled();
  expect(await copier.copy(match)).toBe(true);
});
