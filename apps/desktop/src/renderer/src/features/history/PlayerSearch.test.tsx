import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PlayerSearch from './PlayerSearch';
afterEach(() => { cleanup(); delete window.lolViewer; });
it('fills a focused empty input without submitting or overwriting typed text', async () => {
  let finish!: (value: string) => void;
  const read = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
  window.lolViewer = { readClipboardPlayerId: read } as unknown as NonNullable<typeof window.lolViewer>;
  const onSelect = vi.fn();
  render(<PlayerSearch onSelect={onSelect} />);
  const input = screen.getByRole('textbox');
  input.focus(); finish('测试#12345');
  await waitFor(() => expect(input).toHaveValue('测试#12345'));
  expect(onSelect).not.toHaveBeenCalled();
  input.blur(); input.focus(); expect(read).toHaveBeenCalledTimes(1);
  fireEvent.change(input, { target: { value: '' } }); input.blur(); input.focus();
  fireEvent.change(input, { target: { value: '手动' } }); finish('其他#12345');
  await waitFor(() => expect(input).toHaveValue('手动'));
});
it('ignores invalid clipboard contents and failed reads', async () => {
  const read = vi.fn().mockResolvedValueOnce('普通内容').mockRejectedValueOnce(new Error('denied'));
  window.lolViewer = { readClipboardPlayerId: read } as unknown as NonNullable<typeof window.lolViewer>;
  render(<PlayerSearch onSelect={vi.fn()} />);
  const input = screen.getByRole('textbox');
  input.focus(); await waitFor(() => expect(read).toHaveBeenCalledOnce());
  expect(input).toHaveValue(''); input.blur(); input.focus();
  await waitFor(() => expect(read).toHaveBeenCalledTimes(2)); expect(input).toHaveValue('');
});
