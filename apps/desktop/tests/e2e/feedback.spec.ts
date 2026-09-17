import { _electron as electron, expect, test } from '@playwright/test';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

test('feedback selects screenshots, preserves failed drafts and retries with one request ID', async () => {
  const received: FormData[] = [];
  const server = createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const request = new Request('http://127.0.0.1/api/feedback', { method: 'POST', headers: { 'content-type': req.headers['content-type']! }, body: Buffer.concat(chunks) });
      received.push(await request.formData());
      res.writeHead(received.length === 1 ? 503 : 201, { 'content-type': 'application/json' });
      res.end(JSON.stringify(received.length === 1 ? { error: 'Unavailable' } : { id: 'FB-1234567890ABCDEF1234' }));
    } catch { res.writeHead(500).end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test address');
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js'), '--fixture-live-match'],
    env: { ...process.env, PLAYWRIGHT_TEST: '1', LOL_VIEWER_FEEDBACK_URL: `http://127.0.0.1:${address.port}/api/feedback` }
  });
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1184, height: 735 });
    await page.getByRole('button', { name: '反馈', exact: true }).click();
    const modal = page.getByRole('dialog', { name: '意见反馈' });
    await expect(modal).toBeVisible();
    const submit = modal.getByRole('button', { name: '提交反馈' });
    await expect(submit).toBeEnabled();
    await expect(modal.getByRole('checkbox')).toHaveCount(0);
    const description = modal.getByLabel('问题描述', { exact: false });
    await expect(description).toHaveAttribute('aria-invalid', 'false');
    await submit.click();
    await expect(description).toHaveAttribute('aria-invalid', 'true');
    await expect(description).toBeFocused();
    await expect(description).toHaveCSS('border-top-color', 'rgb(255, 113, 138)');
    await expect(modal.getByRole('alert')).toHaveText('请填写问题描述。');
    await description.fill('   ');
    await submit.click();
    await expect(modal.getByRole('alert')).toHaveText('请填写问题描述。');
    await description.fill('描述太短');
    await submit.click();
    await expect(modal.getByRole('alert')).toContainText('至少填写 10 个字');
    expect(received).toHaveLength(0);
    await modal.getByLabel('问题描述', { exact: false }).fill('进入英雄选择后，我的名字显示成未知玩家，请帮忙检查。');
    await expect(description).toHaveAttribute('aria-invalid', 'false');
    await expect(modal.getByRole('alert')).toHaveCount(0);
    await modal.getByLabel('联系方式', { exact: false }).fill('feedback-test@example.invalid');
    const bytes = await readFile(join(process.cwd(), 'resources/icon.png'));
    await modal.getByLabel('添加截图', { exact: true }).setInputFiles({ name: 'private-original-name.png', mimeType: 'image/png', buffer: bytes });
    await expect(modal.getByRole('img', { name: '反馈截图 1' })).toBeVisible();
    await modal.getByText('随反馈发送的设备信息').click();
    await expect(modal.getByText('f'.repeat(64), { exact: true })).toBeVisible();
    await submit.click();
    await expect(modal.getByRole('alert')).toContainText('暂不可用');
    await modal.getByRole('button', { name: '关闭反馈' }).click();
    await page.getByRole('button', { name: '反馈', exact: true }).click();
    await expect(modal.getByLabel('问题描述', { exact: false })).toHaveValue('进入英雄选择后，我的名字显示成未知玩家，请帮忙检查。');
    await expect(modal.getByRole('img', { name: '反馈截图 1' })).toBeVisible();
    await submit.click();
    await expect(modal.getByText('反馈已提交', { exact: true })).toBeVisible();
    expect(received).toHaveLength(2);
    expect(received[0].get('requestId')).toBe(received[1].get('requestId'));
    expect(received[1].get('deviceId')).toBe('f'.repeat(64));
    expect(received[1].get('clientVersion')).toBe(JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf8')).version);
    const file = received[1].get('screenshots') as File;
    expect(file.name).toBe('screenshot-1.png');
    expect(Buffer.from(await file.arrayBuffer())).toEqual(bytes);
    await modal.getByRole('button', { name: '完成' }).click();
    await page.getByRole('button', { name: '反馈', exact: true }).click();
    await expect(modal.getByLabel('问题描述', { exact: false })).toHaveValue('');
    await expect(modal.getByRole('img')).toHaveCount(0);
    await modal.getByLabel('添加截图', { exact: true }).setInputFiles({ name: 'test.txt', mimeType: 'text/plain', buffer: Buffer.from('not a screenshot') });
    await expect(modal.getByRole('alert')).toContainText('PNG');
    await description.fill('只有问题描述也应能提交，不要求截图和联系方式。');
    await submit.click();
    await expect(modal.getByText('反馈已提交', { exact: true })).toBeVisible();
    expect(received).toHaveLength(3);
    expect(received[2].get('type')).toBe('BUG');
    expect(received[2].getAll('screenshots')).toHaveLength(0);
    expect(received[2].get('contact') || '').toBe('');
  } finally { await app.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
