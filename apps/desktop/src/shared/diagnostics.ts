import { z } from 'zod';
export const DIAGNOSTICS_EXPORT = 'diagnostics:export';
export const LIVE_DIAGNOSTIC = 'diagnostics:live-error';
export const diagnosticReasonSchema = z.enum(['CONNECTION', 'AUTH', 'NOT_READY', 'TIMEOUT', 'RATE_LIMIT', 'PRIVACY', 'SCHEMA', 'TOO_LARGE', 'REQUEST', 'UNKNOWN']);
export const diagnosticSchema = z.object({ id: z.string().regex(/^D-[A-F0-9]{12}$/), reason: diagnosticReasonSchema }).strict();
export type Diagnostic = z.infer<typeof diagnosticSchema>;
export const liveDiagnosticEventSchema = z.object({ generation: z.number().int().nonnegative(), diagnostic: diagnosticSchema }).strict();
export const diagnosticExportSchema = z.object({ status: z.enum(['saved', 'cancelled', 'failed', 'busy']) }).strict();
export type DiagnosticExportResult = z.infer<typeof diagnosticExportSchema>;
export function diagnosticFromError(error: unknown): Diagnostic | undefined {
  const direct = diagnosticSchema.safeParse((error as { diagnostic?: unknown } | null)?.diagnostic);
  if (direct.success) return direct.data;
  const match = /\[DIAG:(D-[A-F0-9]{12}):([A-Z_]+)\]/.exec(error instanceof Error ? error.message : '');
  const parsed = match && diagnosticSchema.safeParse({ id: match[1], reason: match[2] });
  return parsed && parsed.success ? parsed.data : undefined;
}
export function diagnosticMarker(value?: Diagnostic): string {
  return value ? ` [DIAG:${value.id}:${value.reason}]` : '';
}
export const diagnosticLabels: Record<Diagnostic['reason'], string> = {
  CONNECTION: '客户端连接中断', AUTH: '客户端授权失效', NOT_READY: '数据尚未就绪', TIMEOUT: '请求超时',
  RATE_LIMIT: '查询过于频繁', PRIVACY: '战绩受访问限制', SCHEMA: '数据格式不兼容',
  TOO_LARGE: '数据超过读取上限', REQUEST: '接口请求失败', UNKNOWN: '数据暂时无法读取'
};
