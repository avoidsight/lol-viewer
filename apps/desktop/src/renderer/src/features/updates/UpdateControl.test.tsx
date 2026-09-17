import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { LolViewerApi } from '../../../../shared/ipc';
import { UpdateControl } from './UpdateControl';
beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => vi.unstubAllGlobals());
const apiFor = (version = '1.1.0') => ({ checkUpdate: vi.fn().mockResolvedValue({ version, notes: '更新日志\n<script>不执行</script>' }), openUpdate: vi.fn().mockResolvedValue(true) }) as unknown as LolViewerApi;
it('only opens on click, shows notes as text, cancellation retains entry', async () => {
  const api = apiFor(); const { container } = render(<UpdateControl api={api} />);
  const button = await screen.findByRole('button', { name: '新版本' });
  expect(screen.queryByRole('dialog')).toBeNull(); expect(api.openUpdate).not.toHaveBeenCalled();
  fireEvent.click(button); expect(screen.getByRole('dialog')).toBeVisible(); expect(container.querySelector('script')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(screen.queryByRole('dialog')).toBeNull(); expect(button).toBeVisible();
});
it('persists ignored version only and still shows a newer release', async () => {
  const api = apiFor(); const first = render(<UpdateControl api={api} />);
  fireEvent.click(await screen.findByRole('button', { name: '新版本' }));
  fireEvent.click(screen.getByRole('button', { name: '该版本不再提示' }));
  expect(screen.queryByRole('button', { name: '新版本' })).toBeNull(); first.unmount();
  const second = render(<UpdateControl api={api} />); await waitFor(() => expect(api.checkUpdate).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('button', { name: '新版本' })).toBeNull(); second.unmount();
  render(<UpdateControl api={apiFor('1.2.0')} />); expect(await screen.findByRole('button', { name: '新版本' })).toBeVisible();
});
it('opens only selected version and exposes failure for retry', async () => {
  const api = apiFor(); vi.mocked(api.openUpdate!).mockResolvedValue(false);
  render(<UpdateControl api={api} />); fireEvent.click(await screen.findByRole('button', { name: '新版本' }));
  fireEvent.click(screen.getByRole('button', { name: '更新' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('暂时无法下载'); expect(api.openUpdate).toHaveBeenCalledWith('1.1.0');
  vi.mocked(api.openUpdate!).mockResolvedValue(true); fireEvent.click(screen.getByRole('button', { name: '更新' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
it('does not show an entry without an available update', async () => {
  const api = apiFor(); vi.mocked(api.checkUpdate!).mockResolvedValue(null);
  render(<UpdateControl api={api} />); await waitFor(() => expect(api.checkUpdate).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: '新版本' })).toBeNull();
});
