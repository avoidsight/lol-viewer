import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SettingsPage from './SettingsPage';

describe('SettingsPage', () => {
  it('keeps accessible native switches behind the shared visual control', () => {
    const onAutoAcceptChange = vi.fn();
    const onUsageStatisticsChange = vi.fn();
    const onCopy = vi.fn();
    render(<SettingsPage settings={{ autoOpenLiveMatch: true, autoAcceptReadyCheck: false, showLaneDifferences: true }} message="" onAutoCopyEnemyHistoryChange={onCopy} onUsageStatisticsChange={onUsageStatisticsChange} onAutoOpenChange={vi.fn()} onAutoAcceptChange={onAutoAcceptChange} onLaneDifferencesChange={vi.fn()} onClearCache={vi.fn()} />);
    expect(screen.getByRole('switch', { name: /自动复制敌方战绩/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole('switch', { name: /自动复制敌方战绩/ }));
    expect(onCopy).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('switch', { name: /使用统计/ }));
    expect(onUsageStatisticsChange).toHaveBeenCalledWith(false);

    const autoAccept = screen.getByRole('switch', { name: /自动接受匹配/ });
    expect(autoAccept).not.toBeChecked();
    expect(autoAccept.nextElementSibling).toHaveClass('settings-switch__track');
    fireEvent.click(autoAccept);
    expect(onAutoAcceptChange).toHaveBeenCalledWith(true);
  });
});
