import { z } from 'zod';
import { feedbackInputSchema, feedbackContextSchema, MAX_SCREENSHOT_BYTES, type FeedbackInput, type FeedbackContext, type FeedbackResult, type FeedbackScreenshot } from '../../shared/feedback';

export const FEEDBACK_ENDPOINT = 'https://lol.19950919.me/api/feedback';
export function validateScreenshot(screenshot: FeedbackScreenshot): Buffer {
  const bytes = Buffer.from(screenshot.data, 'base64');
  const mime = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : '';
  if (!bytes.length || bytes.length > MAX_SCREENSHOT_BYTES || bytes.toString('base64') !== screenshot.data || mime !== screenshot.mimeType) throw new Error('Invalid screenshot');
  return bytes;
}
export function feedbackEndpoint(packaged: boolean, override?: string): string {
  if (!packaged && override) {
    const url = new URL(override);
    if (url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname) && !url.username && !url.password) return url.href;
    throw new Error('Feedback test endpoint must use localhost');
  }
  return FEEDBACK_ENDPOINT;
}

export class FeedbackService {
  private submitting = false;
  constructor(private readonly context: () => Promise<FeedbackContext>, private readonly endpoint = FEEDBACK_ENDPOINT,
    private readonly request: typeof fetch = fetch) {}

  async getContext() { return feedbackContextSchema.parse(await this.context()); }

  async submit(raw: FeedbackInput): Promise<FeedbackResult> {
    if (this.submitting) return { ok: false, error: '正在提交，请稍候。' };
    const parsed = feedbackInputSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: '请检查问题类型、描述长度和截图大小。' };
    this.submitting = true;
    try {
      const input = parsed.data;
      let screenshots: Buffer[];
      try { screenshots = input.screenshots.map(validateScreenshot); }
      catch { return { ok: false, error: '截图格式不正确或超过 5MB，请重新选择。' }; }
      const context = await this.getContext();
      const body = new FormData();
      for (const [key, value] of Object.entries({ ...context, requestId: input.requestId, type: input.type, description: input.description, contact: input.contact ?? '' })) body.set(key, value);
      screenshots.forEach((bytes, index) => {
        const type = input.screenshots[index].mimeType;
        body.append('screenshots', new Blob([new Uint8Array(bytes)], { type }), `screenshot-${index + 1}.${type === 'image/jpeg' ? 'jpg' : type.split('/')[1]}`);
      });
      const response = await this.request(this.endpoint, { method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(30_000) });
      // Bound error/success responses; never log feedback content or raw network errors.
      const reader = response.body?.getReader();
      let text = '';
      if (reader) {
        const decoder = new TextDecoder();
        let total = 0;
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          total += chunk.value.byteLength;
          if (total > 16 * 1024) { await reader.cancel(); throw new Error('Response too large'); }
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
      }
      let result: unknown;
      try { result = JSON.parse(text); } catch { result = undefined; }
      if (response.status === 201 || response.status === 200) {
        const valid = z.object({ id: z.string().regex(/^FB-[A-F0-9]{20}$/) }).safeParse(result);
        if (valid.success) return { ok: true, id: valid.data.id };
        return { ok: false, error: '未能确认提交结果，内容已保留，可稍后重试。' };
      }
      if (response.status === 429) return { ok: false, error: '提交较频繁，请稍后再试。' };
      if (response.status === 413) return { ok: false, error: '截图过大，请减少图片或压缩后重试。' };
      if (response.status === 400 || response.status === 422 || response.status === 409) {
        const error = z.object({ error: z.string().min(1).max(300) }).safeParse(result);
        return { ok: false, error: error.success ? error.data.error : '反馈内容未通过校验，请检查后重试。' };
      }
      return { ok: false, error: '反馈服务暂不可用，内容已保留，请稍后重试。' };
    } catch {
      return { ok: false, error: '网络异常或提交超时，未能确认结果。内容已保留，可稍后重试。' };
    } finally { this.submitting = false; }
  }
}
