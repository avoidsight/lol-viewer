// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { FeedbackService, feedbackEndpoint, FEEDBACK_ENDPOINT, validateScreenshot } from './feedback-service';
import { feedbackInputSchema, type FeedbackInput } from '../../shared/feedback';

const context = { deviceId: 'a'.repeat(64), clientVersion: '1.2.3', systemInfo: 'win32 10.0.26100 / x64' };
const input: FeedbackInput = { requestId: 'ca38b37d-6406-438b-8ad5-d1ee5e65fcc9', type: 'BUG', description: '切换总览后自己的玩家名称显示未知。', screenshots: [] };
const id = 'FB-1234567890ABCDEF1234';
const png = { mimeType: 'image/png' as const, data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=' };

describe('feedback submission', () => {
  it('builds a whitelisted multipart request with authoritative metadata and no local filename', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id }), { status: 201 }));
    const service = new FeedbackService(async () => context, FEEDBACK_ENDPOINT, request);
    expect(await service.submit({ ...input, screenshots: [png], contact: ' user@example.com ' })).toEqual({ ok: true, id });
    const [url, options] = request.mock.calls[0];
    expect(url).toBe(FEEDBACK_ENDPOINT);
    expect(options?.redirect).toBe('error');
    const form = options?.body as FormData;
    expect(form.get('deviceId')).toBe(context.deviceId);
    expect(form.get('requestId')).toBe(input.requestId);
    expect(form.get('clientVersion')).toBe('1.2.3');
    expect(form.get('contact')).toBe('user@example.com');
    const shot = form.get('screenshots') as File;
    expect(shot.name).toBe('screenshot-1.png');
    expect(shot.type).toBe('image/png');
    expect(Buffer.from(await shot.arrayBuffer()).toString('base64')).toBe(png.data);
  });
  it.each([200, 201])('accepts new and idempotent success status %s', async status => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id }), { status }));
    expect(await new FeedbackService(async () => context, FEEDBACK_ENDPOINT, request).submit(input)).toEqual({ ok: true, id });
  });
  it.each([400, 409, 413, 429, 500, 502])('reports errors safely for status %s', async status => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>proxy error</html>', { status }));
    const result = await new FeedbackService(async () => context, FEEDBACK_ENDPOINT, request).submit(input);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('<html>');
  });
  it('does not treat malformed success or a network timeout as success, and never auto-retries', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('{}', { status: 201 })).mockRejectedValueOnce(new Error('secret network detail'));
    const service = new FeedbackService(async () => context, FEEDBACK_ENDPOINT, request);
    expect((await service.submit(input)).ok).toBe(false);
    const result = await service.submit(input);
    expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain('secret');
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('rejects forged metadata and file paths before a network call', async () => {
    const request = vi.fn<typeof fetch>();
    const service = new FeedbackService(async () => context, FEEDBACK_ENDPOINT, request);
    expect((await service.submit({ ...input, deviceId: 'forged' } as FeedbackInput)).ok).toBe(false);
    expect((await service.submit({ ...input, screenshots: [{ path: '/etc/passwd' }] } as unknown as FeedbackInput)).ok).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
  it('validates screenshot count, byte signature and canonical base64', () => {
    expect(feedbackInputSchema.safeParse({ ...input, screenshots: [png, png, png, png] }).success).toBe(false);
    expect(() => validateScreenshot({ mimeType: 'image/png', data: Buffer.from('<script>alert(1)</script>').toString('base64') })).toThrow();
    expect(() => validateScreenshot({ ...png, mimeType: 'image/jpeg' })).toThrow();
    expect(() => validateScreenshot(png)).not.toThrow();
  });
  it('locks the production endpoint and restricts development overrides to loopback', () => {
    expect(feedbackEndpoint(true, 'http://evil.example')).toBe(FEEDBACK_ENDPOINT);
    expect(feedbackEndpoint(false, 'http://127.0.0.1:3100/api/feedback')).toBe('http://127.0.0.1:3100/api/feedback');
    expect(() => feedbackEndpoint(false, 'https://evil.example')).toThrow();
  });
});
