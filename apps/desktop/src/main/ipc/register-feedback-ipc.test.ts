import { expect, it, vi } from 'vitest';
const electron = vi.hoisted(() => ({ handle: vi.fn(), getAllWindows: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle: electron.handle }, BrowserWindow: { getAllWindows: electron.getAllWindows } }));
import { registerFeedbackIpc } from './register-feedback-ipc';
import { FEEDBACK_CONTEXT_CHANNEL, FEEDBACK_SUBMIT_CHANNEL } from '../../shared/feedback';

it('authorizes feedback senders and blocks unexpected input fields', async () => {
  const sender = {};
  electron.getAllWindows.mockReturnValue([{ webContents: sender, isDestroyed: () => false }]);
  const service = { getFeedbackContext: vi.fn(async () => ({ deviceId: 'a'.repeat(64), clientVersion: '1.0.0', systemInfo: 'win32' })), submitFeedback: vi.fn(async () => ({ ok: true as const, id: 'FB-1234567890ABCDEF1234' })) };
  registerFeedbackIpc(service);
  const get = electron.handle.mock.calls.find(([key]) => key === FEEDBACK_CONTEXT_CHANNEL)![1];
  const submit = electron.handle.mock.calls.find(([key]) => key === FEEDBACK_SUBMIT_CHANNEL)![1];
  await expect(get({ sender: {} })).rejects.toThrow('Unauthorized');
  await expect(submit({ sender: {} }, {})).rejects.toThrow('Unauthorized');
  expect((await get({ sender })).deviceId).toHaveLength(64);
  expect(await submit({ sender }, { path: '/etc/passwd' })).toMatchObject({ ok: false });
  expect(service.submitFeedback).not.toHaveBeenCalled();
  const input = { requestId: 'ca38b37d-6406-438b-8ad5-d1ee5e65fcc9', type: 'BUG', description: '这是长度足够的问题反馈描述。', screenshots: [] };
  expect(await submit({ sender }, input)).toMatchObject({ ok: true });
});
