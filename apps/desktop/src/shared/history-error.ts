import { ZodError } from 'zod';
import { diagnosticFromError, diagnosticMarker } from './diagnostics';

const reasons = {
  CONNECTION: '无法连接英雄联盟客户端，请确认已登录',
  AUTH: '客户端授权已失效，请重新连接',
  NOT_READY: '客户端战绩数据尚未就绪，请稍后重试',
  TIMEOUT: '战绩请求超时，请稍后重试',
  RATE_LIMIT: '查询过于频繁，请稍后重试',
  PRIVACY: '该玩家战绩未公开，无法读取',
  SCHEMA: '战绩数据格式不兼容，解析失败',
  TOO_LARGE: '战绩数据超过读取上限',
  REQUEST: '战绩接口请求失败，请稍后重试',
  UNKNOWN: '暂时无法读取战绩，请稍后重试'
} as const;
type Reason = keyof typeof reasons;

const markerPattern = /\[HISTORY:(CONNECTION|AUTH|NOT_READY|TIMEOUT|RATE_LIMIT|PRIVACY|SCHEMA|TOO_LARGE|REQUEST|UNKNOWN)\]/;
const statusPattern = /status[^\d]{0,3}(\d{3})/i;
const retryableReasons = new Set<Reason>(['CONNECTION', 'NOT_READY', 'TIMEOUT', 'REQUEST']);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

// 只暴露来源与状态码用于分类和日志，绝不返回响应体、请求路径或令牌。
export function historyErrorSource(error: unknown): 'lcu' | 'sgp' | undefined {
  const code = (error as { code?: string } | null)?.code;
  if (code?.startsWith('LCU_')) return 'lcu';
  const message = errorMessage(error);
  if (/SGP request failed/i.test(message)) return 'sgp';
  return /\bLCU\b/.test(message) ? 'lcu' : undefined;
}

export function historyErrorStatus(error: unknown): number | undefined {
  const match = statusPattern.exec(errorMessage(error));
  return match ? Number(match[1]) : undefined;
}

export function historyErrorReason(error: unknown): Reason {
  const message = errorMessage(error);
  const marker = markerPattern.exec(message);
  if (marker) return marker[1] as Reason;
  if (error instanceof ZodError) return 'SCHEMA';
  const code = (error as { code?: string } | null)?.code;
  const status = historyErrorStatus(error);
  const source = historyErrorSource(error);
  if (code === 'LCU_AUTH') return 'AUTH';
  if (code === 'LCU_RESPONSE_TOO_LARGE') return 'TOO_LARGE';
  if (/timed out|timeout/i.test(message)) return 'TIMEOUT';
  if (/schema|invalid JSON/i.test(message)) return 'SCHEMA';
  if (status === 429) return 'RATE_LIMIT';
  if (source === 'sgp' && (status === 403 || status === 404)) return 'PRIVACY';
  if (code === 'LCU_UNAVAILABLE' || /League client is unavailable/i.test(message)) return 'CONNECTION';
  if (source === 'lcu' && status === 404) return 'NOT_READY';
  if (code === 'LCU_INVALID_RESPONSE' || /SGP request failed with status/i.test(message)) return 'REQUEST';
  if (status !== undefined && status >= 400) return 'REQUEST';
  return 'UNKNOWN';
}

// 只有可能自行恢复的瞬时故障才值得重试；授权失效、限流、隐私限制与结构不兼容重试也不会变好。
export function isTransientHistoryError(error: unknown): boolean {
  return retryableReasons.has(historyErrorReason(error));
}

// 主进程日志使用：只记录固定原因码、来源与状态码。
export function historyErrorDiagnostic(error: unknown): string {
  const status = historyErrorStatus(error);
  return [
    `reason=${historyErrorReason(error)}`,
    `source=${historyErrorSource(error) ?? 'unknown'}`,
    ...(status === undefined ? [] : [`status=${status}`])
  ].join(' ');
}

// Only a fixed reason code crosses Electron IPC; never expose raw responses or tokens.
export function safeHistoryError(error: unknown): Error {
  return Object.assign(new Error(`Personal history is unavailable [HISTORY:${historyErrorReason(error)}]${diagnosticMarker(diagnosticFromError(error))}`), { code: 'HISTORY_UNAVAILABLE' });
}

export function historyRefreshMessage(error: unknown): string {
  const diagnostic = diagnosticFromError(error);
  return `刷新失败：${reasons[historyErrorReason(error)]}${diagnostic ? `（${diagnostic.id}）` : ''}`;
}
