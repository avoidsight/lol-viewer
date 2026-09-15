import { request as httpsRequest } from 'node:https';
import type { RequestOptions } from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';
import type { z } from 'zod';
import { invalidateLcuConnection, type LcuConnection } from './discovery';

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
  function send<T>(method: 'GET' | 'POST', path: string, schema?: z.ZodType<T>): Promise<T | void> {
    if (!validPath(path)) {
      return Promise.reject(lcuError('LCU_INVALID_RESPONSE', 'LCU request path is invalid'));
    }

    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (action: () => void): void => {
          if (settled) return;
          settled = true;
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
              Authorization: `Basic ${authorization}`
            }
          },
          (response) => {
            const chunks: Buffer[] = [];
            let receivedBytes = 0;
            response.on('data', (chunk: Buffer | string) => {
              const buffer = Buffer.from(chunk);
              receivedBytes += buffer.length;
              if (receivedBytes > maxResponseBytes) {
                response.destroy?.();
                finish(() => reject(lcuError('LCU_RESPONSE_TOO_LARGE', 'LCU response exceeded the size limit')));
                return;
              }
              chunks.push(buffer);
            });
            response.on('error', () =>
              finish(() => reject(lcuError('LCU_INVALID_RESPONSE', 'LCU response could not be read')))
            );
            response.on('end', () => {
              if (response.statusCode === 401 || response.statusCode === 403) {
                invalidateLcuConnection(connection);
                finish(() => reject(lcuError('LCU_AUTH', 'LCU authentication failed')));
                return;
              }
              if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
                finish(() => reject(lcuError(
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
                    reject(lcuError('LCU_INVALID_RESPONSE', 'LCU response did not match its schema'))
                  );
                  return;
                }
                finish(() => resolve(result.data));
              } catch {
                finish(() => reject(lcuError('LCU_INVALID_RESPONSE', 'LCU returned invalid JSON')));
              }
            });
          }
        );

        req.on('timeout', () => {
          req.destroy();
          invalidateLcuConnection(connection);
          finish(() => reject(lcuError('LCU_UNAVAILABLE', 'LCU request timed out')));
        });
        req.on('error', () => {
          invalidateLcuConnection(connection);
          finish(() => reject(lcuError('LCU_UNAVAILABLE', 'LCU is unavailable')));
        });
        req.end();
      });
  }

  return {
    get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
      return send('GET', path, schema) as Promise<T>;
    },
    post(path: string): Promise<void> {
      return send('POST', path) as Promise<void>;
    }
  };
}
