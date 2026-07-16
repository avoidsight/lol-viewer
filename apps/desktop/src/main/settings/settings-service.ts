import type Database from 'better-sqlite3';
import { type AppSettings, appSettingsPatchSchema, appSettingsSchema } from '../../shared/ipc';

const DEFAULT_SETTINGS: AppSettings = {
  queueScope: 'ranked-solo',
  autoOpenLiveMatch: true,
  showLaneDifferences: true
};

interface SettingsRow {
  queue_scope: string;
  auto_open_live_match: number;
  show_lane_differences: number;
}

export class SettingsService {
  constructor(private readonly database: Database.Database) {}

  get(): AppSettings {
    const row = this.database.prepare(`
      SELECT queue_scope, auto_open_live_match, show_lane_differences
      FROM app_settings WHERE id = ?
    `).get(1) as SettingsRow | undefined;
    if (!row) return { ...DEFAULT_SETTINGS };
    return appSettingsSchema.parse({
      queueScope: row.queue_scope,
      autoOpenLiveMatch: row.auto_open_live_match === 1,
      showLaneDifferences: row.show_lane_differences === 1
    });
  }

  update(patch: Partial<AppSettings>): AppSettings {
    const next = appSettingsSchema.parse({ ...this.get(), ...appSettingsPatchSchema.parse(patch) });
    this.database.prepare(`
      INSERT INTO app_settings (
        id, queue_scope, auto_open_live_match, show_lane_differences
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        queue_scope = excluded.queue_scope,
        auto_open_live_match = excluded.auto_open_live_match,
        show_lane_differences = excluded.show_lane_differences
    `).run(1, next.queueScope, Number(next.autoOpenLiveMatch), Number(next.showLaneDifferences));
    return next;
  }

  clearCache(): void {
    this.database.prepare('DELETE FROM player_snapshots').run();
  }
}
