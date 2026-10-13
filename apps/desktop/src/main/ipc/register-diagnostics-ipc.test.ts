import { beforeEach, expect, it, vi } from 'vitest';
const { handle, getAllWindows, showSaveDialog, writeFile } = vi.hoisted(() => ({ handle: vi.fn(), getAllWindows: vi.fn(), showSaveDialog: vi.fn(), writeFile: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle }, BrowserWindow: { getAllWindows }, dialog: { showSaveDialog } }));
vi.mock('node:fs/promises', () => ({ writeFile, default: { writeFile } }));
import { registerDiagnosticsIpc } from './register-diagnostics-ipc';
import type { DiagnosticLogger } from '../diagnostics/logger';
const sender = {};
const exportText = vi.fn();
let handler: (event: unknown, input?: unknown) => Promise<unknown>;
beforeEach(() => {
  vi.resetAllMocks();
  getAllWindows.mockReturnValue([{ webContents: sender, isDestroyed: () => false }]);
  registerDiagnosticsIpc({ exportText } as unknown as DiagnosticLogger);
  handler = handle.mock.calls[0][1];
});
it('requires the app renderer and refuses renderer-supplied paths', async () => {
  await expect(handler({ sender: {} })).rejects.toThrow('Unauthorized');
  await expect(handler({ sender }, { path: '/evil' })).rejects.toThrow();
  expect(showSaveDialog).not.toHaveBeenCalled();
});
it('exports only after native save confirmation', async () => {
  showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/chosen/log.txt' });
  exportText.mockResolvedValue('safe-log');
  await expect(handler({ sender })).resolves.toEqual({ status: 'saved' });
  expect(writeFile).toHaveBeenCalledExactlyOnceWith('/chosen/log.txt', 'safe-log', { encoding: 'utf8', mode: 0o600 });
});
it('cancels without reading or writing and serializes multiple clicks', async () => {
  let resolve!: (value: unknown) => void;
  showSaveDialog.mockReturnValue(new Promise(done => { resolve = done; }));
  const first = handler({ sender });
  await expect(handler({ sender })).resolves.toEqual({ status: 'busy' });
  resolve({ canceled: true });
  await expect(first).resolves.toEqual({ status: 'cancelled' });
  expect(exportText).not.toHaveBeenCalled(); expect(writeFile).not.toHaveBeenCalled();
});
it('sanitizes storage errors and allows retry', async () => {
  showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/chosen/log.txt' });
  exportText.mockRejectedValueOnce(new Error('private file path')).mockResolvedValue('safe-log');
  await expect(handler({ sender })).resolves.toEqual({ status: 'failed' });
  await expect(handler({ sender })).resolves.toEqual({ status: 'saved' });
});
