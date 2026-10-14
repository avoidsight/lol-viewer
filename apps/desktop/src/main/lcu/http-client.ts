import { request as httpsRequest } from 'node:https';
import type { RequestOptions } from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';
import type { z } from 'zod';
import { invalidateLcuConnection, type LcuConnection } from './discovery';
import { lcuOperation, recordDiagnostic } from '../diagnostics/logger';

export interface LcuError extends Error {
  code: 'LCU_UNAVAILABLE' | 'LCU_AUTH' | 'LCU_INVALID_RESPONSE' | 'LCU_RESPONSE_TOO_LARGE';
}

export type HttpsRequest = (
  options: RequestOptions,
  callback: (response: IncomingMessage) => void
) => ClientRequest;

export interface LcuClient {
  get<T>(path: string, schema: z.ZodType<T>): Promise<T>;
  post?(path: string): Promise<void>;
  postJson?<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T>;
}

export interface LcuWritableClient extends LcuClient {
  post(path: string): Promise<void>;
}

function lcuError(code: LcuError['code'], message: string): LcuError {
  return Object.assign(new Error(message), { code });
}

function validPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !/[\r\n]/.test(path);
}

export function createLcuClient(
  connection: LcuConnection,
  request: HttpsRequest = httpsRequest,
  maxResponseBytes = 2 * 1024 * 1024
): LcuWritableClient {
  function send<T>(method: 'GET' | 'POST', path: string, schema?: z.ZodType<T>, payload?: unknown): Promise<T | void> {
    const json = payload === undefined ? undefined : JSON.stringify(payload);
    if (!validPath(path)) {
      return Promise.reject(lcuError('LCU_INVALID_RESPONSE', 'LCU request path is invalid'));
    }

    return new Promise((resolve, reject) => {
        const started = Date.now();
        let status: number | undefined;
        const fail = (error: LcuError, issues?: unknown) => {
          recordDiagnostic(lcuOperation(path), error, { source: 'lcu', status, elapsedMs: Date.now() - started, issues });
          reject(error);
        };
        let settled = false;
        let deadline: ReturnType<typeof setTimeout> | undefined;
        const finish = (action: () => void): void => {
          if (settled) return;
          settled = true;
          clearTimeout(deadline);
          action();
        };
        const authorization = Buffer.from(`riot:${connection.password}`).toString('base64');
        const req = request(
          {
            protocol: 'https:',
            hostname: '127.0.0.1',
            port: connection.port,
            method,
            path,
            timeout: 5_000,
            rejectUnauthorized: false,
            headers: {
              Accept: 'application/json',
              ...(json === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) }),
              Authorization: `Basic ${authorization}`
            }
          },
          (response) => {
            status = response.statusCode;
            const chunks: Buffer[] = [];
            let receivedBytes = 0;
            response.on('data', (chunk: Buffer | string) => {
              const buffer = Buffer.from(chunk);
              receivedBytes += buffer.length;
              if (receivedBytes > maxResponseBytes) {
                response.destroy?.();
                finish(() => fail(lcuError('LCU_RESPONSE_TOO_LARGE', 'LCU response exceeded the size limit')));
                return;
              }
              chunks.push(buffer);
            });
            response.on('error', () =>
              finish(() => fail(lcuError('LCU_UNAVAILABLE', 'LCU response could not be read')))
            );
            const interrupted = () => finish(() => fail(lcuError('LCU_UNAVAILABLE', 'LCU response ended before completion')));
            response.on('aborted', interrupted);
            response.on('close', interrupted);
            response.on('end', () => {
              if (response.statusCode === 401 || response.statusCode === 403) {
                invalidateLcuConnection(connection);
                finish(() => fail(lcuError('LCU_AUTH', 'LCU authentication failed')));
                return;
              }
              if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
                finish(() => fail(lcuError(
                  'LCU_INVALID_RESPONSE',
                  `LCU returned an unexpected status${response.statusCode ? ` (${response.statusCode})` : ''}`
                )));
                return;
              }
              if (!schema) {
                finish(() => resolve());
                return;
              }
              try {
                const body = Buffer.concat(chunks).toString('utf8');
                const value: unknown = body ? JSON.parse(body) : null;
                const result = schema.safeParse(value);
                if (!result.success) {
                  finish(() =>
                    fail(lcuError('LCU_INVALID_RESPONSE', 'LCU response did not match its schema'), result.error)
                  );
                  return;
                }
                finish(() => resolve(result.data));
              } catch {
                finish(() => fail(lcuError('LCU_INVALID_RESPONSE', 'LCU returned invalid JSON')));
              }
            });
          }
        );

        req.on('timeout', () => {
          invalidateLcuConnection(connection);
          finish(() => fail(lcuError('LCU_UNAVAILABLE', 'LCU request timed out')));
          req.destroy();
        });
        req.on('error', () => {
          invalidateLcuConnection(connection);
          finish(() => fail(lcuError('LCU_UNAVAILABLE', 'LCU is unavailable')));
        });
        deadline = setTimeout(() => {
          finish(() => fail(lcuError('LCU_UNAVAILABLE', 'LCU request timed out')));
          req.destroy();
        }, 10_000);
        req.end(json);
      });
  }

  return {
    postJson<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
      return send('POST', path, schema, body) as Promise<T>;
    },
    get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
      return send('GET', path, schema) as Promise<T>;
    },
    post(path: string): Promise<void> {
      return send('POST', path) as Promise<void>;
    }
  };
}
