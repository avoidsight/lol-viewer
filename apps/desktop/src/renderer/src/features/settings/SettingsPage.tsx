import type { AppSettings } from '../../../../shared/ipc';
import './settings.css';

function SettingSwitch({
  title,
  description,
  checked,
  onChange
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return <label className="settings-row"><span><strong>{title}</strong><small>{description}</small></span><span className="settings-switch"><input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span className="settings-switch__track" aria-hidden="true"><i /></span></span></label>;
}

export default function SettingsPage({
  settings,
  message,
  onAutoOpenChange,
  onAutoAcceptChange,
  onUsageStatisticsChange,
  onLaneDifferencesChange,
  onClearCache
}: {
  settings: AppSettings;
  message: string;
  onAutoOpenChange: (checked: boolean) => void;
  onAutoAcceptChange: (checked: boolean) => void;
  onUsageStatisticsChange: (checked: boolean) => void;
  onLaneDifferencesChange: (checked: boolean) => void;
  onClearCache: () => void;
}) {
  return <main className="settings-page"><div className="settings-page__inner">
    <header className="settings-page__heading"><span>PREFERENCES</span><h1>设置</h1><p>管理匹配确认、隐私和本地缓存。</p></header>
    <section className="settings-page__section" aria-labelledby="match-settings"><h2 id="match-settings">游戏辅助</h2>
      <SettingSwitch title="自动打开对战信息" description="检测到英雄选择或进入游戏时，自动切换到实时对局。" checked={settings.autoOpenLiveMatch} onChange={onAutoOpenChange} />
      <SettingSwitch title="自动接受匹配" description="检测到准备确认后自动点击接受，可随时关闭。" checked={settings.autoAcceptReadyCheck} onChange={onAutoAcceptChange} />
      <SettingSwitch title="显示对位差异" description="位置可靠时，标出与标准分路不一致的玩家。" checked={settings.showLaneDifferences} onChange={onLaneDifferencesChange} />
    </section>
    <section className="settings-page__section" aria-labelledby="privacy-settings"><h2 id="privacy-settings">隐私</h2>
      <SettingSwitch title="使用统计" description="启动及跨天时上报应用专属设备标识、客户端版本、系统版本和架构，用于统计设备数量和版本使用情况。不收集玩家账号、战绩或原始硬件编号。可随时关闭，不影响使用和反馈；关闭后停止新上报，已有统计不会自动删除。" checked={settings.usageStatistics !== false} onChange={onUsageStatisticsChange} />
    </section>
    <section className="settings-page__section" aria-labelledby="maintenance-settings"><h2 id="maintenance-settings">本地维护</h2><div className="settings-row"><span><strong>清理缓存</strong><small>移除本地战绩缓存，下次打开时重新读取。</small></span><button type="button" onClick={onClearCache}>清理缓存</button></div></section>
    {message && <p className="settings-page__message" aria-live="polite">{message}</p>}
  </div></main>;
}
