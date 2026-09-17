import type Database from 'better-sqlite3';
import { z } from 'zod';
import { type AppSettings, appSettingsPatchSchema, appSettingsSchema } from '../../shared/ipc';
import type { MatchCache } from '../cache/database';

const DEFAULT_SETTINGS: AppSettings = {
  autoCopyEnemyHistory: false,
  autoOpenLiveMatch: true,
  showLaneDifferences: true,
  autoAcceptReadyCheck: false,
  usageStatistics: true
};

const settingsRowSchema = z.object({
  auto_copy_enemy_history: z.union([z.literal(0), z.literal(1)]),
  auto_open_live_match: z.union([z.literal(0), z.literal(1)]),
  show_lane_differences: z.union([z.literal(0), z.literal(1)]),
  auto_accept_ready_check: z.union([z.literal(0), z.literal(1)]),
  usage_statistics: z.union([z.literal(0), z.literal(1)])
}).strict();

export class SettingsService {
  constructor(
    private readonly database: Database.Database,
    private readonly cache: Pick<MatchCache, 'clearPlayerSnapshots'>,
    private readonly publicGuideCache?: { clear(): void },
    private readonly personalHistoryCache?: { clear(): void }
  ) {}

  get(): AppSettings {
    const rawRow = this.database.prepare(`
      SELECT auto_open_live_match, show_lane_differences, auto_accept_ready_check, usage_statistics, auto_copy_enemy_history
      FROM app_settings WHERE id = ?
    `).get(1);
    if (!rawRow) return { ...DEFAULT_SETTINGS };
    const row = settingsRowSchema.parse(rawRow);
    return appSettingsSchema.parse({
      autoCopyEnemyHistory: row.auto_copy_enemy_history === 1,
      autoOpenLiveMatch: row.auto_open_live_match === 1,
      showLaneDifferences: row.show_lane_differences === 1,
      autoAcceptReadyCheck: row.auto_accept_ready_check === 1,
      usageStatistics: row.usage_statistics === 1
    });
  }

  update(patch: Partial<AppSettings>): AppSettings {
    const next = appSettingsSchema.parse({ ...this.get(), ...appSettingsPatchSchema.parse(patch) });
    this.database.prepare(`
      INSERT INTO app_settings (
        id, queue_scope, auto_open_live_match, show_lane_differences, auto_accept_ready_check, usage_statistics, auto_copy_enemy_history
      ) VALUES (?, 'all', ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        auto_open_live_match = excluded.auto_open_live_match,
        show_lane_differences = excluded.show_lane_differences,
        auto_accept_ready_check = excluded.auto_accept_ready_check,
        usage_statistics = excluded.usage_statistics,
        auto_copy_enemy_history = excluded.auto_copy_enemy_history
    `).run(1, Number(next.autoOpenLiveMatch), Number(next.showLaneDifferences), Number(next.autoAcceptReadyCheck), Number(next.usageStatistics !== false), Number(next.autoCopyEnemyHistory === true));
    return next;
  }

  clearCache(): void {
    this.cache.clearPlayerSnapshots();
    this.publicGuideCache?.clear();
    this.personalHistoryCache?.clear();
  }
}
