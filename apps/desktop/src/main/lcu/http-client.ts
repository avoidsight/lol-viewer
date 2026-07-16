import { request as httpsRequest } from 'node:https';
import type { RequestOptions } from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';
import type { z } from 'zod';
import type { LcuConnection } from './discovery';

export interface LcuError extends Error {
  code: 'LCU_UNAVAILABLE' | 'LCU_AUTH' | 'LCU_INVALID_RESPONSE';
}

export type HttpsRequest = (
  options: RequestOptions,
  callback: (response: IncomingMessage) => void
) => ClientRequest;

export interface LcuClient {
  get<T>(path: string, schema: z.ZodType<T>): Promise<T>;
}

function lcuError(code: LcuError['code'], message: string): LcuError {
  return Object.assign(new Error(message), { code });
}

function validPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !/[\r\n]/.test(path);
}

export function createLcuClient(
  connection: LcuConnection,
  request: HttpsRequest = httpsRequest
): LcuClient {
  return {
    get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
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
            method: 'GET',
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
            response.on('data', (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)));
            response.on('error', () =>
              finish(() => reject(lcuError('LCU_INVALID_RESPONSE', 'LCU response could not be read')))
            );
            response.on('end', () => {
              if (response.statusCode === 401 || response.statusCode === 403) {
                finish(() => reject(lcuError('LCU_AUTH', 'LCU authentication failed')));
                return;
              }
              if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
                finish(() => reject(lcuError('LCU_INVALID_RESPONSE', 'LCU returned an unexpected status')));
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
          finish(() => reject(lcuError('LCU_UNAVAILABLE', 'LCU request timed out')));
        });
        req.on('error', () =>
          finish(() => reject(lcuError('LCU_UNAVAILABLE', 'LCU is unavailable')))
        );
        req.end();
      });
    }
  };
}
