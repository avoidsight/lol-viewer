import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  historyErrorDiagnostic,
  historyRefreshMessage,
  isTransientHistoryError,
  safeHistoryError
} from './history-error';

describe('history refresh errors', () => {
  it.each([
    ['League client is unavailable', '无法连接'],
    ['LCU request timed out', '超时'],
    ['LCU response did not match its schema', '格式不兼容'],
    ['LCU returned an unexpected status (404)', '尚未就绪'],
    ['LCU returned an unexpected status (500)', '接口请求失败'],
    ['SGP request failed with status 503', '接口请求失败'],
    ['SGP request failed with status 429', '频繁'],
    ['SGP request failed with status 403', '未公开'],
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
  it('keeps the diagnostic to a fixed reason, source and status code', () => {
    expect(historyErrorDiagnostic(new Error('SGP request failed with status 429')))
      .toBe('reason=RATE_LIMIT source=sgp status=429');
    expect(historyErrorDiagnostic(new Error('LCU returned an unexpected status (500)')))
      .toBe('reason=REQUEST source=lcu status=500');
    const opaque = historyErrorDiagnostic(new Error('secret-token-player-data'));
    expect(opaque).toBe('reason=UNKNOWN source=unknown');
    expect(opaque).not.toContain('secret-token-player-data');
  });
  it('retries only failures that can recover on their own', () => {
    expect(isTransientHistoryError(new Error('LCU request timed out'))).toBe(true);
    expect(isTransientHistoryError(Object.assign(new Error('LCU is unavailable'), { code: 'LCU_UNAVAILABLE' }))).toBe(true);
    expect(isTransientHistoryError(new Error('LCU returned an unexpected status (404)'))).toBe(true);
    expect(isTransientHistoryError(new Error('SGP request failed with status 503'))).toBe(true);
    expect(isTransientHistoryError(new Error('SGP request failed with status 429'))).toBe(false);
    expect(isTransientHistoryError(new Error('SGP request failed with status 403'))).toBe(false);
    expect(isTransientHistoryError(Object.assign(new Error('LCU authentication failed'), { code: 'LCU_AUTH' }))).toBe(false);
    expect(isTransientHistoryError(new Error('LCU response did not match its schema'))).toBe(false);
    expect(isTransientHistoryError(new Error('mystery failure'))).toBe(false);
  });
});
