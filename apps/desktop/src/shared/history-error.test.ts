import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { historyRefreshMessage, safeHistoryError } from './history-error';

describe('history refresh errors', () => {
  it.each([
    ['League client is unavailable', '无法连接'],
    ['LCU request timed out', '超时'],
    ['LCU response did not match its schema', '格式不兼容'],
    ['SGP request failed with status 503', '接口请求失败'],
    ['secret-token-player-data', '暂时无法读取']
  ])('preserves safe reason across Electron wrapping: %s', (message, expected) => {
    const safe = safeHistoryError(new Error(message));
    const transported = new Error(`Error invoking remote method: ${safe.message}`);
    expect(historyRefreshMessage(transported)).toContain(expected);
    expect(safe.message).not.toContain(message);
  });
  it('does not expose validation input or paths', () => {
    const result = z.number().safeParse('private-data');
    if (!result.success) expect(historyRefreshMessage(safeHistoryError(result.error))).toContain('格式不兼容');
  });
});
