// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { DonationService } from './service';
const config = (enabled = true) => Response.json({ enabled, revision: 2 });
describe('voluntary donation service', () => {
  it('does not contact production from development/fixtures', async () => {
    const request = vi.fn(); const service = new DonationService(false, request);
    expect((await service.getConfig()).enabled).toBe(false); expect(await service.getImage()).toBeNull(); expect(request).not.toHaveBeenCalled();
  });
  it('fails closed for errors and invalid configuration', async () => {
    for (const response of [Response.json({ enabled: true }), new Response('broken'), new Response('', { status: 500 })]) {
      expect((await new DonationService(true, vi.fn().mockResolvedValue(response)).getConfig()).enabled).toBe(false);
    }
    expect((await new DonationService(true, vi.fn().mockRejectedValue(new Error())).getConfig()).enabled).toBe(false);
  });
  it('rechecks enabled before fetching any QR', async () => {
    const request = vi.fn().mockResolvedValue(config(false));
    expect(await new DonationService(true, request).getImage()).toBeNull(); expect(request).toHaveBeenCalledTimes(1);
  });
  it('uses fixed endpoint, bounded PNG and rejects non-PNG', async () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const request = vi.fn().mockResolvedValueOnce(config()).mockResolvedValueOnce(new Response(png, { headers: { 'Content-Type': 'image/png' } }));
    expect(await new DonationService(true, request).getImage()).toBe(`data:image/png;base64,${png.toString('base64')}`);
    expect(request.mock.calls[1][0]).toBe('https://lol.19950919.me/api/donation/image?revision=2');
    expect(request.mock.calls[1][1].redirect).toBe('error');
    for (const bytes of [Buffer.from('<svg/>'), Buffer.alloc(2 * 1024 * 1024 + 1)]) {
      const fetcher = vi.fn().mockResolvedValueOnce(config()).mockResolvedValueOnce(new Response(bytes, { headers: { 'Content-Type': 'image/png' } }));
      expect(await new DonationService(true, fetcher).getImage()).toBeNull();
    }
  });
});
