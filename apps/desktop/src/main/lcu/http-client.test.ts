import { EventEmitter } from 'node:events';
import type { ClientRequest, IncomingMessage, RequestOptions } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { createLcuClient, type HttpsRequest } from './http-client';

function requestDouble(
  response: { statusCode: number; body?: string } | NodeJS.ErrnoException
): { request: HttpsRequest; options: () => RequestOptions } {
  let captured: RequestOptions = {};
  const request = vi.fn((options: RequestOptions, callback: (response: IncomingMessage) => void) => {
    captured = options;
    const req = new EventEmitter() as ClientRequest;
    req.end = vi.fn() as ClientRequest['end'];
    req.destroy = vi.fn() as ClientRequest['destroy'];
    queueMicrotask(() => {
      if (response instanceof Error) {
        req.emit('error', response);
        return;
      }
      const incoming = new EventEmitter() as IncomingMessage;
      incoming.statusCode = response.statusCode;
      callback(incoming);
      incoming.emit('data', Buffer.from(response.body ?? ''));
      incoming.emit('end');
    });
    return req;
  }) as unknown as HttpsRequest;
  return { request, options: () => captured };
}

describe('createLcuClient', () => {
  it('uses loopback HTTPS, five-second timeout, and Basic riot authentication', async () => {
    const transport = requestDouble({ statusCode: 200, body: '{"phase":"Lobby"}' });
    const client = createLcuClient(
      { port: 53122, password: 'secret', protocol: 'https' },
      transport.request
    );

    await expect(client.get('/lol-gameflow/v1/gameflow-phase')).resolves.toEqual({ phase: 'Lobby' });
    expect(transport.options()).toMatchObject({
      hostname: '127.0.0.1',
      port: 53122,
      method: 'GET',
      path: '/lol-gameflow/v1/gameflow-phase',
      timeout: 5_000,
      rejectUnauthorized: false
    });
    expect(transport.options().headers).toMatchObject({
      Authorization: `Basic ${Buffer.from('riot:secret').toString('base64')}`
    });
  });

  it('returns a typed unavailable error on ECONNREFUSED without exposing the token', async () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1'), {
      code: 'ECONNREFUSED'
    });
    const transport = requestDouble(refused);
    const client = createLcuClient(
      { port: 53122, password: 'secret', protocol: 'https' },
      transport.request
    );

    const error = await client.get('/lol-gameflow/v1/gameflow-phase').catch((caught) => caught);
    expect(error).toMatchObject({ code: 'LCU_UNAVAILABLE' });
    expect(JSON.stringify(error)).not.toContain('secret');
    expect(String(error)).not.toContain('secret');
  });

  it.each([
    [401, 'LCU_AUTH'],
    [500, 'LCU_INVALID_RESPONSE'],
    [200, 'LCU_INVALID_RESPONSE']
  ] as const)('maps status/body case %s to %s', async (statusCode, code) => {
    const body = statusCode === 200 ? 'not-json' : '{}';
    const transport = requestDouble({ statusCode, body });
    const client = createLcuClient(
      { port: 53122, password: 'secret', protocol: 'https' },
      transport.request
    );

    await expect(client.get('/endpoint')).rejects.toMatchObject({ code });
  });

  it('rejects paths that could escape the loopback origin', async () => {
    const transport = requestDouble({ statusCode: 200, body: '{}' });
    const client = createLcuClient(
      { port: 53122, password: 'secret', protocol: 'https' },
      transport.request
    );

    await expect(client.get('https://example.com/steal')).rejects.toMatchObject({
      code: 'LCU_INVALID_RESPONSE'
    });
    expect(transport.request).not.toHaveBeenCalled();
  });
});
