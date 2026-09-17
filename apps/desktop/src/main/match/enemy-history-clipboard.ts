import type Database from 'better-sqlite3';
import type { GameflowSessionIdentity, LiveMatch } from '../../shared/ipc';
import { enemyHistorySummary } from '../../shared/enemy-history';

export class EnemyHistoryClipboard {
  constructor(private readonly db: Database.Database, private readonly deps: {
    enabled(): boolean;
    identity(): Promise<GameflowSessionIdentity>;
    write(text: string): void;
    notify(): void;
  }) {}
  async copy(match: LiveMatch, signal?: AbortSignal): Promise<boolean> {
    try {
      if (signal?.aborted || !this.deps.enabled()) return false;
      const text = enemyHistorySummary(match);
      if (!text || this.db.prepare('SELECT 1 FROM copied_enemy_games WHERE game_id = ?').get(match.gameId)) return false;
      const identity = await this.deps.identity();
      if (signal?.aborted || !this.deps.enabled() || identity.connected === false || identity.gameId !== match.gameId
        || !['ChampSelect', 'GameStart', 'InProgress', 'Reconnect'].includes(identity.phase)) return false;
      // Recheck after awaiting identity so concurrent loads never write twice.
      if (this.db.prepare('SELECT 1 FROM copied_enemy_games WHERE game_id = ?').get(match.gameId)) return false;
      this.deps.write(text);
      this.db.prepare('INSERT INTO copied_enemy_games (game_id, copied_at) VALUES (?, ?)').run(match.gameId, Date.now());
      this.db.prepare('DELETE FROM copied_enemy_games WHERE game_id NOT IN (SELECT game_id FROM copied_enemy_games ORDER BY copied_at DESC, rowid DESC LIMIT 100)').run();
      this.deps.notify();
      return true;
    } catch {
      // Clipboard/identity failure must never fail a match request or trigger more fetching.
      return false;
    }
  }
}
