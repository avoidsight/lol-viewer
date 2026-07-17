import type Database from 'better-sqlite3';
import { z } from 'zod';
import type { PlayerSnapshot, QueueScope } from '../../shared/domain';
import { playerSnapshotSchema } from '../../shared/ipc';
import { championGuideSnapshotSchema, type ChampionGuideSnapshot, type ChampionLane } from '../../shared/ipc';

const PLAYER_HISTORY_TTL_MS = 15 * 60_000;

const snapshotRowSchema = z.object({
  snapshot_json: z.string(),
  cached_at: z.number().int().nonnegative()
}).strict();
const cacheTimeSchema = z.number().int().nonnegative();

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
    if (!migration) database.exec(`
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
    if (!migration) database
      .prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
      .run(1, Date.now());
    const guideMigration = database.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(2);
    if (!guideMigration) {
      database.exec(`CREATE TABLE champion_guide_snapshots (
        patch TEXT NOT NULL, champion_id INTEGER NOT NULL, lane TEXT NOT NULL,
        snapshot_json TEXT NOT NULL, cached_at INTEGER NOT NULL,
        PRIMARY KEY (patch, champion_id, lane)
      );`);
      database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(2, Date.now());
    }
  })();
}

export class ChampionGuideCache {
  constructor(private readonly database: Database.Database) {}
  get(patch: string, championId: number, lane: ChampionLane): ChampionGuideSnapshot | null {
    const row = snapshotRowSchema.safeParse(this.database.prepare(
      'SELECT snapshot_json, cached_at FROM champion_guide_snapshots WHERE patch = ? AND champion_id = ? AND lane = ?'
    ).get(patch, championId, lane));
    if (!row.success) return null;
    try { return championGuideSnapshotSchema.parse(JSON.parse(row.data.snapshot_json)); } catch { return null; }
  }
  put(snapshot: ChampionGuideSnapshot, cachedAt = Date.now()): void {
    const value = championGuideSnapshotSchema.parse(snapshot);
    this.database.prepare(`INSERT INTO champion_guide_snapshots (patch, champion_id, lane, snapshot_json, cached_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(patch, champion_id, lane) DO UPDATE SET snapshot_json=excluded.snapshot_json, cached_at=excluded.cached_at`
    ).run(value.patch, value.championId, value.lane, JSON.stringify(value), cacheTimeSchema.parse(cachedAt));
  }
  clear(): void { this.database.prepare('DELETE FROM champion_guide_snapshots').run(); }
}

export class MatchCache {
  constructor(private readonly database: Database.Database) {}

  get(playerId: string, scope: QueueScope, now = Date.now()): PlayerSnapshot | null {
    const rowResult = snapshotRowSchema.safeParse(this.database
      .prepare('SELECT snapshot_json, cached_at FROM player_snapshots WHERE player_id = ? AND scope = ?')
      .get(playerId, scope));
    if (!rowResult.success) return null;
    const row = rowResult.data;
    if (row.cached_at > now || now - row.cached_at > PLAYER_HISTORY_TTL_MS) return null;
    try {
      return playerSnapshotSchema.parse(JSON.parse(row.snapshot_json));
    } catch {
      return null;
    }
  }

  put(snapshot: PlayerSnapshot, cachedAt = Date.now()): void {
    const validated = playerSnapshotSchema.parse(snapshot);
    const validatedCachedAt = cacheTimeSchema.parse(cachedAt);
    this.database.prepare(`
      INSERT INTO player_snapshots (player_id, scope, snapshot_json, cached_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(player_id, scope) DO UPDATE SET
        snapshot_json = excluded.snapshot_json,
        cached_at = excluded.cached_at
    `).run(validated.playerId, validated.scope, JSON.stringify(validated), validatedCachedAt);
  }

  clearPlayerSnapshots(): void {
    this.database.prepare('DELETE FROM player_snapshots').run();
  }
}
