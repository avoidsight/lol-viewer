import { ZodError } from 'zod';

const reasons = {
  CONNECTION: '无法连接英雄联盟客户端，请确认已登录',
  AUTH: '客户端授权已失效，请重新连接',
  TIMEOUT: '战绩请求超时，请稍后重试',
  SCHEMA: '战绩数据格式不兼容，解析失败',
  TOO_LARGE: '战绩数据超过读取上限',
  REQUEST: '战绩接口请求失败，请稍后重试',
  UNKNOWN: '暂时无法读取战绩，请稍后重试'
} as const;
type Reason = keyof typeof reasons;

export function historyErrorReason(error: unknown): Reason {
  const message = error instanceof Error ? error.message : '';
  const marker = /\[HISTORY:(CONNECTION|AUTH|TIMEOUT|SCHEMA|TOO_LARGE|REQUEST|UNKNOWN)\]/.exec(message);
  if (marker) return marker[1] as Reason;
  if (error instanceof ZodError) return 'SCHEMA';
  const code = (error as { code?: string } | null)?.code;
  if (code === 'LCU_AUTH') return 'AUTH';
  if (code === 'LCU_RESPONSE_TOO_LARGE') return 'TOO_LARGE';
  if (/timed out|timeout/i.test(message)) return 'TIMEOUT';
  if (/schema|invalid JSON/i.test(message)) return 'SCHEMA';
  if (code === 'LCU_UNAVAILABLE' || /League client is unavailable/i.test(message)) return 'CONNECTION';
  if (code === 'LCU_INVALID_RESPONSE' || /SGP request failed with status/i.test(message)) return 'REQUEST';
  return 'UNKNOWN';
}

// Only a fixed reason code crosses Electron IPC; never expose raw responses or tokens.
export function safeHistoryError(error: unknown): Error {
  return Object.assign(new Error(`Personal history is unavailable [HISTORY:${historyErrorReason(error)}]`), { code: 'HISTORY_UNAVAILABLE' });
}

export function historyRefreshMessage(error: unknown): string {
  return `刷新失败：${reasons[historyErrorReason(error)]}`;
}
