import { z } from 'zod';

export const FEEDBACK_CONTEXT_CHANNEL = 'feedback:get-context';
export const FEEDBACK_SUBMIT_CHANNEL = 'feedback:submit';
export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
export const MAX_SCREENSHOTS = 3;
export const feedbackTypes = { BUG: '功能异常', SUGGESTION: '改进建议', OTHER: '其他问题' } as const;
export const feedbackContextSchema = z.object({
  deviceId: z.string().regex(/^[a-f0-9]{64}$/),
  clientVersion: z.string().min(1).max(64),
  systemInfo: z.string().min(1).max(500)
}).strict();
export const screenshotSchema = z.object({
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  data: z.string().min(4).max(Math.ceil(MAX_SCREENSHOT_BYTES / 3) * 4).refine(value => value.length % 4 === 0 && !/[^A-Za-z0-9+/=]/.test(value))
}).strict();
export const feedbackInputSchema = z.object({
  requestId: z.string().uuid(),
  type: z.enum(['BUG', 'SUGGESTION', 'OTHER']),
  description: z.string().trim().min(10).max(5000),
  contact: z.string().trim().max(200).optional(),
  screenshots: z.array(screenshotSchema).max(MAX_SCREENSHOTS)
}).strict();
export const feedbackResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), id: z.string().regex(/^FB-[A-F0-9]{20}$/) }).strict(),
  z.object({ ok: z.literal(false), error: z.string().min(1).max(500) }).strict()
]);
export type FeedbackContext = z.infer<typeof feedbackContextSchema>;
export type FeedbackInput = z.infer<typeof feedbackInputSchema>;
export type FeedbackResult = z.infer<typeof feedbackResultSchema>;
export type FeedbackScreenshot = z.infer<typeof screenshotSchema>;
export interface FeedbackApi {
  getFeedbackContext(): Promise<FeedbackContext>;
  submitFeedback(input: FeedbackInput): Promise<FeedbackResult>;
}
