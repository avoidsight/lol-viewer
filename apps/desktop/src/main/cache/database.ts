import type Database from 'better-sqlite3';
import type { PlayerSnapshot, QueueScope } from '../../shared/domain';
import { playerSnapshotSchema } from '../../shared/ipc';

const PLAYER_HISTORY_TTL_MS = 15 * 60_000;

interface SnapshotRow {
  snapshot_json: string;
  cached_at: number;
}

export function migrateDatabase(database: Database.Database): void {
  database.transaction(() => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `);

    const migration = database
      .prepare('SELECT 1 FROM schema_migrations WHERE version = ?')
      .get(1);
    if (migration) return;

    database.exec(`
      CREATE TABLE player_snapshots (
        player_id TEXT NOT NULL,
        scope TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        cached_at INTEGER NOT NULL,
        PRIMARY KEY (player_id, scope)
      );
      CREATE TABLE app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        queue_scope TEXT NOT NULL,
        auto_open_live_match INTEGER NOT NULL,
        show_lane_differences INTEGER NOT NULL
      );
    `);
    database
      .prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
      .run(1, Date.now());
  })();
}

export class MatchCache {
  constructor(private readonly database: Database.Database) {}

  get(playerId: string, scope: QueueScope, now = Date.now()): PlayerSnapshot | null {
    const row = this.database
      .prepare('SELECT snapshot_json, cached_at FROM player_snapshots WHERE player_id = ? AND scope = ?')
      .get(playerId, scope) as SnapshotRow | undefined;
    if (!row || now - row.cached_at > PLAYER_HISTORY_TTL_MS) return null;
    return playerSnapshotSchema.parse(JSON.parse(row.snapshot_json));
  }

  put(snapshot: PlayerSnapshot, cachedAt = Date.now()): void {
    const validated = playerSnapshotSchema.parse(snapshot);
    this.database.prepare(`
      INSERT INTO player_snapshots (player_id, scope, snapshot_json, cached_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(player_id, scope) DO UPDATE SET
        snapshot_json = excluded.snapshot_json,
        cached_at = excluded.cached_at
    `).run(validated.playerId, validated.scope, JSON.stringify(validated), cachedAt);
  }

  clearPlayerSnapshots(): void {
    this.database.prepare('DELETE FROM player_snapshots').run();
  }
}
