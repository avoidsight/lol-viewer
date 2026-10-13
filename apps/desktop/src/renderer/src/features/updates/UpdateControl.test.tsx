import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { idleUpdateDownload, type UpdateDownloadState } from '../../../../shared/updates';
import type { LolViewerApi } from '../../../../shared/ipc';
import { UpdateControl } from './UpdateControl';
beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const readyState: UpdateDownloadState = { phase: 'ready', version: '1.1.0', receivedBytes: 100, totalBytes: 100 };
const apiFor = (version = '1.1.0') => ({
  checkUpdate: vi.fn().mockResolvedValue({ version, important: true, notes: '更新日志\n<script>不执行</script>' }),
  downloadUpdate: vi.fn().mockResolvedValue({ ...readyState, version }),
  installUpdate: vi.fn().mockResolvedValue({ ...readyState, version, phase: 'installing' }),
  getUpdateDownloadState: vi.fn().mockResolvedValue(idleUpdateDownload),
  cancelUpdateDownload: vi.fn().mockResolvedValue(idleUpdateDownload)
}) as unknown as LolViewerApi;
it('only opens on click, shows notes as text, cancellation retains entry', async () => {
  const api = apiFor(); const { container } = render(<UpdateControl api={api} />);
  const button = await screen.findByRole('button', { name: '新版本' });
  expect(screen.queryByRole('dialog')).toBeNull(); expect(api.downloadUpdate).not.toHaveBeenCalled();
  fireEvent.click(button); expect(screen.getByRole('dialog')).toBeVisible(); expect(container.querySelector('script')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(screen.queryByRole('dialog')).toBeNull(); expect(button).toBeVisible();
});
it('persists ignored version only and still shows a newer release', async () => {
  const api = apiFor(); const first = render(<UpdateControl api={api} />);
  fireEvent.click(await screen.findByRole('button', { name: '新版本' }));
  fireEvent.click(screen.getByRole('button', { name: '该版本不再提示' }));
  expect(screen.getByRole('button', { name: '新版本' })).toBeVisible(); first.unmount();
  const second = render(<UpdateControl api={api} />); await waitFor(() => expect(api.checkUpdate).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole('button', { name: '新版本' })).toBeVisible(); second.unmount();
  render(<UpdateControl api={apiFor('1.2.0')} />); expect(await screen.findByRole('button', { name: '新版本' })).toBeVisible();
});
it('shows download failures and retries in-app, then requires separate install confirmation', async () => {
  const api = apiFor(); vi.mocked(api.downloadUpdate!).mockResolvedValue({ ...idleUpdateDownload, version: '1.1.0', phase: 'error', error: '下载失败，请检查网络后重试。' });
  render(<UpdateControl api={api} />); fireEvent.click(await screen.findByRole('button', { name: '新版本' }));
  fireEvent.click(screen.getByRole('button', { name: '下载更新' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('下载失败'); expect(api.downloadUpdate).toHaveBeenCalledWith('1.1.0');
  vi.mocked(api.downloadUpdate!).mockResolvedValue(readyState); fireEvent.click(screen.getByRole('button', { name: '重新下载' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '退出并安装' })).toBeEnabled());
  expect(api.installUpdate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '稍后安装' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '新版本' }));
  fireEvent.click(screen.getByRole('button', { name: '退出并安装' }));
  await waitFor(() => expect(api.installUpdate).toHaveBeenCalledWith('1.1.0'));
});
it('shows progress, keeps background downloads, cancels, and unsubscribes on unmount', async () => {
  const api = apiFor(); let listener!: (state: UpdateDownloadState) => void;
  const unsubscribe = vi.fn(); api.onUpdateDownloadState = fn => { listener = fn; return unsubscribe; };
  const { unmount } = render(<UpdateControl api={api} />);
  fireEvent.click(await screen.findByRole('button', { name: '新版本' }));
  act(() => listener({ ...readyState, phase: 'downloading', receivedBytes: 47 }));
  expect(screen.getByRole('progressbar')).toHaveAttribute('value', '47');
  fireEvent.click(screen.getByRole('button', { name: '后台下载' }));
  expect(api.cancelUpdateDownload).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '新版本' }));
  expect(screen.getByText('47%')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '取消下载' }));
  await waitFor(() => expect(api.cancelUpdateDownload).toHaveBeenCalledOnce());
  await screen.findByRole('button', { name: '下载更新' });
  unmount(); expect(unsubscribe).toHaveBeenCalledOnce();
});
it('does not show an entry without an available update', async () => {
  const api = apiFor(); vi.mocked(api.checkUpdate!).mockResolvedValue(null);
  render(<UpdateControl api={api} />); await waitFor(() => expect(api.checkUpdate).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: '新版本' })).toBeNull();
});
it('defers important prompts until safe and focused, then prompts once per session', async () => {
  const focused = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
  const api = apiFor(); const { rerender } = render(<UpdateControl api={api} canAutoPrompt={false} />);
  await screen.findByRole('button', { name: '新版本' }); expect(screen.queryByRole('dialog')).toBeNull();
  rerender(<UpdateControl api={api} canAutoPrompt />); expect(screen.queryByRole('dialog')).toBeNull();
  focused.mockReturnValue(true); fireEvent(window, new Event('focus'));
  expect(await screen.findByRole('dialog')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '取消' })); fireEvent(window, new Event('focus'));
  expect(screen.queryByRole('dialog')).toBeNull(); expect(screen.getByRole('button', { name: '新版本' })).toBeVisible();
});
it('ignored important versions retain manual access and newer important versions prompt again', async () => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  const api = apiFor(); const first = render(<UpdateControl api={api} canAutoPrompt />);
  await screen.findByRole('dialog'); fireEvent.click(screen.getByRole('button', { name: '该版本不再提示' })); first.unmount();
  const second = render(<UpdateControl api={api} canAutoPrompt />);
  fireEvent.click(await screen.findByRole('button', { name: '新版本' })); expect(screen.getByRole('dialog')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '取消' })); fireEvent(window, new Event('focus'));
  expect(screen.queryByRole('dialog')).toBeNull(); second.unmount();
  render(<UpdateControl api={apiFor('1.2.0')} canAutoPrompt />); expect(await screen.findByRole('dialog')).toBeVisible();
});
it('ordinary releases never auto-prompt even in foreground', async () => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  const api = apiFor(); vi.mocked(api.checkUpdate!).mockResolvedValue({ version: '1.1.0', important: false, notes: '普通更新' });
  render(<UpdateControl api={api} canAutoPrompt />); await screen.findByRole('button', { name: '新版本' });
  fireEvent(window, new Event('focus')); expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '新版本' })); expect(screen.getByText('版本更新')).toBeVisible();
});
