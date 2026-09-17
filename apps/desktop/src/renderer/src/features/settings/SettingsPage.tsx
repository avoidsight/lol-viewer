import type { AppSettings } from '../../../../shared/ipc';
import './settings.css';

function SettingSwitch({
  title,
  description,
  checked,
  onChange
}: {
  title: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return <label className="settings-row"><span><strong>{title}</strong>{description && <small>{description}</small>}</span><span className="settings-switch"><input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span className="settings-switch__track" aria-hidden="true"><i /></span></span></label>;
}

export default function SettingsPage({
  settings,
  message,
  onAutoOpenChange,
  onAutoAcceptChange,
  onAutoCopyEnemyHistoryChange,
  onClearCache
}: {
  settings: AppSettings;
  message: string;
  onAutoOpenChange: (checked: boolean) => void;
  onAutoAcceptChange: (checked: boolean) => void;
  onAutoCopyEnemyHistoryChange?: (checked: boolean) => void;
  onClearCache: () => void;
}) {
  return <main className="settings-page"><div className="settings-page__inner">
    <header className="settings-page__heading"><h1>设置</h1></header>
    <section className="settings-page__section" aria-labelledby="match-settings"><h2 id="match-settings">游戏辅助</h2>
      <SettingSwitch title="自动打开对战信息" description="进入选人或游戏时，自动切到对战信息。" checked={settings.autoOpenLiveMatch} onChange={onAutoOpenChange} />
      <SettingSwitch title="自动接受匹配" checked={settings.autoAcceptReadyCheck} onChange={onAutoAcceptChange} />
      <SettingSwitch title="自动复制敌方战绩" description="在对战页加载战绩后，每局复制一次。会替换剪贴板内容，需自行粘贴发送。" checked={settings.autoCopyEnemyHistory === true} onChange={onAutoCopyEnemyHistoryChange ?? (() => {})} />
    </section>
    <section className="settings-page__section" aria-labelledby="maintenance-settings"><h2 id="maintenance-settings">本地维护</h2><div className="settings-row"><span><strong>清理缓存</strong><small>清除本地战绩缓存，不影响游戏战绩。</small></span><button type="button" onClick={onClearCache}>清理缓存</button></div></section>
    {message && <p className="settings-page__message" aria-live="polite">{message}</p>}
  </div></main>;
}
