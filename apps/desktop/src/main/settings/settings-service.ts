import type Database from 'better-sqlite3';
import { z } from 'zod';
import { type AppSettings, appSettingsPatchSchema, appSettingsSchema } from '../../shared/ipc';
import type { MatchCache } from '../cache/database';

const DEFAULT_SETTINGS: AppSettings = {
  queueScope: 'ranked-solo',
  autoOpenLiveMatch: true,
  showLaneDifferences: true
};

const settingsRowSchema = z.object({
  queue_scope: z.enum(['ranked-solo', 'all']),
  auto_open_live_match: z.union([z.literal(0), z.literal(1)]),
  show_lane_differences: z.union([z.literal(0), z.literal(1)])
}).strict();

export class SettingsService {
  constructor(
    private readonly database: Database.Database,
    private readonly cache: Pick<MatchCache, 'clearPlayerSnapshots'>
  ) {}

  get(): AppSettings {
    const rawRow = this.database.prepare(`
      SELECT queue_scope, auto_open_live_match, show_lane_differences
      FROM app_settings WHERE id = ?
    `).get(1);
    if (!rawRow) return { ...DEFAULT_SETTINGS };
    const row = settingsRowSchema.parse(rawRow);
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
    this.cache.clearPlayerSnapshots();
  }
}
