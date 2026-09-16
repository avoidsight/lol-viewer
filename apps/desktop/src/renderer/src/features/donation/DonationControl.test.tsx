import { beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { LolViewerApi } from '../../../../shared/ipc';
import { DonationControl } from './DonationControl';
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
const fakeApi = (enabled = true) => ({ getDonationConfig: vi.fn().mockResolvedValue({ enabled, revision: 1 }), getDonationImage: vi.fn().mockResolvedValue('data:image/png;base64,AA==') }) as unknown as LolViewerApi;
it('hides disabled entry and never opens itself or eagerly loads image', async () => {
  const api = fakeApi(false); render(<DonationControl api={api} />);
  await waitFor(() => expect(api.getDonationConfig).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: '支持作者' })).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(api.getDonationImage).not.toHaveBeenCalled();
});
it('opens on click, shows QR, and handles cancellation', async () => {
  const api = fakeApi(); render(<DonationControl api={api} />);
  fireEvent.click(await screen.findByRole('button', { name: '支持作者' }));
  expect(await screen.findByAltText('微信赞赏码')).toBeVisible();
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(screen.queryByAltText('微信赞赏码')).not.toBeInTheDocument();
});
it('ignores late image response after close', async () => {
  let resolve!: (value: string) => void;
  const api = fakeApi(); api.getDonationImage = vi.fn(() => new Promise<string>(done => { resolve = done; }));
  render(<DonationControl api={api} />);
  fireEvent.click(await screen.findByRole('button', { name: '支持作者' }));
  fireEvent.click(screen.getByRole('button', { name: '关闭赞赏' }));
  await act(async () => resolve('data:image/png;base64,AA=='));
  expect(screen.queryByAltText('微信赞赏码')).not.toBeInTheDocument();
});
it('shows unavailable state without a broken or stale QR', async () => {
  const api = fakeApi(); api.getDonationImage = vi.fn().mockResolvedValue(null);
  render(<DonationControl api={api} />); fireEvent.click(await screen.findByRole('button', { name: '支持作者' }));
  expect(await screen.findByText('赞赏暂不可用，请关闭后重试。')).toBeVisible();
  expect(screen.queryByAltText('微信赞赏码')).not.toBeInTheDocument();
});
