import { useEffect, useRef, useState, type FormEvent } from 'react';
import { feedbackTypes, MAX_SCREENSHOT_BYTES, MAX_SCREENSHOTS, type FeedbackApi, type FeedbackContext, type FeedbackInput, type FeedbackScreenshot } from '../../../../shared/feedback';
import './feedback.css';

type Preview = FeedbackScreenshot & { name: string };
export function readScreenshot(file: File): Promise<Preview> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !file.size || file.size > MAX_SCREENSHOT_BYTES) {
    return Promise.reject(new Error('请选择 PNG、JPG 或 WebP 图片，每张不超过 5MB。'));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, mimeType: file.type as FeedbackScreenshot['mimeType'], data: String(reader.result).split(',')[1] });
    reader.onerror = () => reject(new Error('图片读取失败，请重新选择。'));
    reader.readAsDataURL(file);
  });
}

export default function FeedbackDialog({ open, onClose, api }: { open: boolean; onClose: () => void; api?: Partial<FeedbackApi> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const descriptionField = useRef<HTMLTextAreaElement>(null);
  const requestId = useRef<string | undefined>(undefined);
  const pending = useRef(false);
  const [type, setType] = useState<FeedbackInput['type']>('BUG');
  const [description, setDescription] = useState('');
  const [contact, setContact] = useState('');
  const [screenshots, setScreenshots] = useState<Preview[]>([]);
  const [context, setContext] = useState<FeedbackContext>();
  const [contextRetry, setContextRetry] = useState(0);
  const [contextError, setContextError] = useState('');
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const descriptionError = !description.trim() ? '请填写问题描述。'
    : description.trim().length < 10 ? '请至少填写 10 个字，描述遇到的问题。'
    : description.trim().length > 5000 ? '问题描述不能超过 5000 个字。' : '';
  const showDescriptionError = validationAttempted && !!descriptionError;

  const edited = () => { requestId.current = undefined; setError(''); };
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  useEffect(() => {
    if (!open || context) return;
    let active = true;
    setContextError('');
    if (!api?.getFeedbackContext) { setContextError('当前版本不支持反馈，请更新客户端。'); return; }
    void api.getFeedbackContext().then(result => { if (active) setContext(result); })
      .catch(() => { if (active) setContextError('设备信息读取失败，请重试。'); });
    return () => { active = false; };
  }, [open, context, contextRetry, api]);

  async function addFiles(files: File[]) {
    if (busy || reading) return;
    if (files.length + screenshots.length > MAX_SCREENSHOTS) { setError('最多上传 3 张截图。'); return; }
    setReading(true);
    try { const additions = await Promise.all(files.map(readScreenshot)); edited(); setScreenshots(previous => [...previous, ...additions]); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '图片读取失败。'); }
    finally { setReading(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current || reading) return;
    setValidationAttempted(true);
    if (descriptionError) {
      setError('');
      descriptionField.current?.focus();
      descriptionField.current?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (!context || !api?.submitFeedback) { setError('反馈服务尚未就绪，请重试。'); return; }
    pending.current = true;
    setBusy(true); setError('');
    requestId.current ??= crypto.randomUUID();
    try {
      const result = await api.submitFeedback({ requestId: requestId.current, type, description: description.trim(), contact: contact.trim(), screenshots: screenshots.map(({ mimeType, data }) => ({ mimeType, data })) });
      if (!result.ok) { setError(result.error); return; }
      setSuccess(result.id);
      setDescription(''); setContact(''); setScreenshots([]); setValidationAttempted(false); requestId.current = undefined;
    } catch { setError('未能确认提交结果，内容已保留，请稍后重试。'); }
    finally { pending.current = false; setBusy(false); }
  }
  const close = () => { if (!pending.current) { onClose(); setSuccess(''); setError(''); setValidationAttempted(false); } };
  return <dialog ref={dialog} className="feedback-dialog" aria-labelledby="feedback-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header className="feedback-dialog__header"><div><h2 id="feedback-title">意见反馈</h2><p>遇到问题，或有想要的功能？告诉我们。</p></div><button type="button" className="feedback-icon-button" aria-label="关闭反馈" disabled={busy} onClick={close}>×</button></header>
    {success ? <section className="feedback-success" role="status"><span aria-hidden="true">✓</span><h3>反馈已提交</h3><p>感谢反馈，可保留编号以便后续沟通。</p><code>{success}</code><button type="button" onClick={close}>完成</button></section> :
      <form noValidate onSubmit={event => void submit(event)} className="feedback-form">
        <fieldset disabled={busy || reading}><legend>问题类型 <small>必填</small></legend><div className="feedback-types">{Object.entries(feedbackTypes).map(([value, label]) => <label key={value} className={type === value ? 'is-selected' : ''}><input type="radio" name="feedback-type" value={value} checked={type === value} onChange={() => { edited(); setType(value as FeedbackInput['type']); }} />{label}</label>)}</div>
          <label className="feedback-label" htmlFor="feedback-description">问题描述 <small>必填</small><span>{description.length}/5000</span></label>
          <textarea ref={descriptionField} id="feedback-description" required minLength={10} maxLength={5000} aria-invalid={showDescriptionError} aria-describedby={showDescriptionError ? 'feedback-description-error' : undefined} value={description} onChange={event => { edited(); setDescription(event.target.value); }} placeholder="例如：选完英雄后切换到总览，自己的名称变成了未知玩家。请说明操作步骤和实际表现。" />
          {showDescriptionError && <p id="feedback-description-error" className="feedback-field-error" role="alert">{descriptionError}</p>}
          <div className="feedback-label">截图 <small>选填 · 最多 3 张，每张 5MB</small></div>
          <div className="feedback-screenshots">{screenshots.map((shot, index) => <div className="feedback-screenshot" key={`${index}-${shot.name}`}><img src={`data:${shot.mimeType};base64,${shot.data}`} alt={`反馈截图 ${index + 1}`} /><button type="button" aria-label={`移除截图 ${index + 1}`} onClick={() => { edited(); setScreenshots(previous => previous.filter((_, i) => i !== index)); }}>×</button></div>)}
            {screenshots.length < MAX_SCREENSHOTS && <label className="feedback-upload"><span aria-hidden="true">＋</span><span>{reading ? '读取中…' : '添加截图'}</span><input type="file" aria-label="添加截图" accept="image/png,image/jpeg,image/webp" multiple onChange={event => { const files = [...(event.target.files ?? [])]; event.target.value = ''; void addFiles(files); }} /></label>}
          </div>
          <label className="feedback-label" htmlFor="feedback-contact">联系方式 <small>选填</small></label><input id="feedback-contact" maxLength={200} value={contact} onChange={event => { edited(); setContact(event.target.value); }} placeholder="邮箱或 QQ，方便需要时联系你" />
        </fieldset>
        <details className="feedback-context"><summary>自动附带设备 ID、软件与系统版本</summary>{context ? <dl><dt>设备 ID</dt><dd>{context.deviceId}</dd><dt>软件版本</dt><dd>{context.clientVersion}</dd><dt>系统</dt><dd>{context.systemInfo}</dd></dl> : <p>{contextError || '正在读取设备信息…'}</p>}<p>设备 ID 是应用专属标识，用于关联问题；不上传原始硬件编号，不用作身份验证。</p></details>
        {contextError && <p className="feedback-error" role="alert">{contextError} <button type="button" disabled={busy} onClick={() => setContextRetry(value => value + 1)}>重试</button></p>}
        <p className="feedback-privacy-note">截图请遮挡隐私，勿填写密码或令牌；不会自动收集日志。</p>
        {error && <p className="feedback-error" role="alert">{error}</p>}
        <footer><span>关闭后保留本次草稿，退出软件后清除</span><button type="submit" disabled={busy || reading}>{busy ? '正在提交…' : '提交反馈'}</button></footer>
      </form>}
  </dialog>;
}
