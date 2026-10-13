import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LolViewerApi } from '../../../../shared/ipc';
import SettingsPage from './SettingsPage';
afterEach(() => { delete window.lolViewer; });

describe('SettingsPage', () => {
  it.each(['saved', 'cancelled', 'failed'] as const)('handles diagnostic export result %s', async status => {
    const exportDiagnostics = vi.fn().mockResolvedValue({ status });
    window.lolViewer = { exportDiagnostics } as unknown as LolViewerApi;
    render(<SettingsPage settings={{ autoOpenLiveMatch: true, autoAcceptReadyCheck: false, showLaneDifferences: true }} message="" onAutoOpenChange={vi.fn()} onAutoAcceptChange={vi.fn()} onClearCache={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '导出日志' }));
    expect(screen.getByRole('button', { name: '正在导出…' })).toBeDisabled();
    expect(await screen.findByRole('button', { name: '导出日志' })).toBeEnabled();
    expect(exportDiagnostics).toHaveBeenCalledOnce();
    if (status === 'saved') expect(screen.getByRole('status')).toHaveTextContent('诊断日志已保存');
    else if (status === 'failed') expect(screen.getByRole('status')).toHaveTextContent('导出失败');
    else expect(screen.queryByRole('status')).toBeNull();
  });
  it('keeps accessible native switches behind the shared visual control', () => {
    const onAutoAcceptChange = vi.fn();
    const onCopy = vi.fn();
    render(<SettingsPage settings={{ autoOpenLiveMatch: true, autoAcceptReadyCheck: false, showLaneDifferences: true }} message="" onAutoCopyEnemyHistoryChange={onCopy} onAutoOpenChange={vi.fn()} onAutoAcceptChange={onAutoAcceptChange} onClearCache={vi.fn()} />);
    expect(screen.getByRole('switch', { name: /自动复制双方战绩/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole('switch', { name: /自动复制双方战绩/ }));
    expect(onCopy).toHaveBeenCalledWith(true);

    const autoAccept = screen.getByRole('switch', { name: /自动接受匹配/ });
    expect(autoAccept).not.toBeChecked();
    expect(autoAccept.nextElementSibling).toHaveClass('settings-switch__track');
    fireEvent.click(autoAccept);
    expect(onAutoAcceptChange).toHaveBeenCalledWith(true);
  });
});
