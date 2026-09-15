import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { FEEDBACK_CONTEXT_CHANNEL, FEEDBACK_SUBMIT_CHANNEL, feedbackContextSchema, feedbackInputSchema, feedbackResultSchema, type FeedbackApi } from '../../shared/feedback';
import { assertAuthorizedRenderer } from './authorization';

export function registerFeedbackIpc(service: FeedbackApi) {
  ipcMain.handle(FEEDBACK_CONTEXT_CHANNEL, async (event: IpcMainInvokeEvent) => {
    assertAuthorizedRenderer(event);
    try { return feedbackContextSchema.parse(await service.getFeedbackContext()); }
    catch { throw new Error('无法读取反馈设备信息，请重试。'); }
  });
  ipcMain.handle(FEEDBACK_SUBMIT_CHANNEL, async (event: IpcMainInvokeEvent, input: unknown) => {
    assertAuthorizedRenderer(event);
    const valid = feedbackInputSchema.safeParse(input);
    if (!valid.success) return { ok: false, error: '反馈字段无效，请检查后重试。' };
    return feedbackResultSchema.parse(await service.submitFeedback(valid.data));
  });
}
