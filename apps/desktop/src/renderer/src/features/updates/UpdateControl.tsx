import { useEffect, useRef, useState } from 'react';
import type { LolViewerApi } from '../../../../shared/ipc';
import { idleUpdateDownload, versionSchema, type AvailableUpdate, type UpdateDownloadState } from '../../../../shared/updates';
import './updates.css';
const IGNORED = 'lol-viewer:ignored-update-versions';
function ignoredVersions(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(IGNORED) ?? '[]');
    return Array.isArray(value) ? value.filter(v => versionSchema.safeParse(v).success).slice(-100) : [];
  } catch { return []; }
}
export function UpdateControl({ api, canAutoPrompt = false }: { api?: LolViewerApi; canAutoPrompt?: boolean }) {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [downloadState, setDownloadState] = useState<UpdateDownloadState>(idleUpdateDownload);
  const activeDownload = downloadState.version === update?.version ? downloadState : idleUpdateDownload;
  const transferring = ['checking', 'downloading', 'verifying'].includes(activeDownload.phase);
  const ready = activeDownload.phase === 'ready';
  const installing = activeDownload.phase === 'installing';
  const progress = activeDownload.totalBytes ? Math.min(100, Math.floor(activeDownload.receivedBytes / activeDownload.totalBytes * 100)) : 0;
  const dialog = useRef<HTMLDialogElement>(null);
  const known = useRef<string | undefined>(undefined);
  const prompted = useRef(new Set<string>());
  useEffect(() => {
    let disposed = false, receivedEvent = false;
    const unsubscribe = api?.onUpdateDownloadState?.(state => {
      receivedEvent = true;
      if (!disposed) setDownloadState(state);
    });
    void api?.getUpdateDownloadState?.().then(state => {
      if (!disposed && !receivedEvent) setDownloadState(state);
    }).catch(() => {});
    return () => { disposed = true; unsubscribe?.(); };
  }, [api]);
  useEffect(() => {
    let disposed = false, pending = false, checkedAt = -Infinity;
    const check = async () => {
      if (document.hidden || pending || Date.now() - checkedAt < 300000) return;
      pending = true; checkedAt = Date.now();
      try {
        const value = await api?.checkUpdate?.();
        if (disposed) return;
        const next = value ?? null;
        if (known.current !== next?.version) setOpen(false);
        known.current = next?.version; setUpdate(next);
      } catch { if (!disposed) { setUpdate(null); setOpen(false); } }
      finally { pending = false; }
    };
    void check();
    const timer = setInterval(() => void check(), 30 * 60 * 1000);
    window.addEventListener('focus', check); document.addEventListener('visibilitychange', check);
    return () => { disposed = true; clearInterval(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, [api]);
  useEffect(() => {
    const prompt = () => {
      if (!update?.important || !canAutoPrompt || document.hidden || !document.hasFocus()
        || prompted.current.has(update.version) || ignoredVersions().includes(update.version)
        || document.querySelector('dialog[open]')) return;
      prompted.current.add(update.version); setError(''); setOpen(true);
    };
    prompt();
    const timer = setInterval(prompt, 30000);
    window.addEventListener('focus', prompt); document.addEventListener('visibilitychange', prompt);
    return () => { clearInterval(timer); window.removeEventListener('focus', prompt); document.removeEventListener('visibilitychange', prompt); };
  }, [update, canAutoPrompt]);
  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) dialog.current.showModal();
    else if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  function ignore() {
    if (!update) return;
    try {
      localStorage.setItem(IGNORED, JSON.stringify([...new Set([...ignoredVersions(), update.version])].slice(-100)));
      setOpen(false); prompted.current.add(update.version);
    } catch { setError('无法保存忽略设置，请取消后重试。'); }
  }
  async function download() {
    if (!update || busy || transferring || installing) return;
    setBusy(true); setError('');
    try {
      const state = ready ? await api?.installUpdate?.(update.version) : await api?.downloadUpdate?.(update.version);
      if (state) setDownloadState(state);
      else setError('更新暂不可用，请稍后重试。');
    } catch { setError('更新失败，请稍后重试。'); }
    finally { setBusy(false); }
  }
  async function cancelDownload() {
    setError('');
    try {
      const state = await api?.cancelUpdateDownload?.();
      if (state) setDownloadState(state);
    } catch { setError('取消失败，请稍后重试。'); }
  }
  return <>
    {update && <button className="update-trigger" type="button" onClick={() => { prompted.current.add(update.version); setError(''); setOpen(true); }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v12m-5-5 5 5 5-5M5 17v3h14v-3" /></svg>新版本<span className="update-trigger__dot" /></button>}
    <dialog ref={dialog} className="update-dialog" aria-labelledby="update-title" onCancel={event => { event.preventDefault(); setOpen(false); }}>
      <span className="update-dialog__badge">{update?.important ? '重要更新' : '版本更新'}</span>
      <h2 id="update-title">新版本 {update?.version}</h2>
      <div className="update-dialog__notes">{update?.notes}</div>
      {(transferring || ready || installing) && <div className="update-download" aria-live="polite">
        <div className="update-download__label"><span>{ready ? '下载完成' : installing ? '正在启动安装…' : activeDownload.phase === 'verifying' ? '正在校验安装包…' : activeDownload.phase === 'checking' ? '正在检查版本…' : '正在下载'}</span><strong>{(activeDownload.phase === 'downloading' || ready) && `${progress}%`}</strong></div>
        <progress aria-label="安装包下载进度" max={100} value={progress} />
        {activeDownload.totalBytes > 0 && <div className="update-download__size">{(activeDownload.receivedBytes / 1048576).toFixed(1)} / {(activeDownload.totalBytes / 1048576).toFixed(1)} MB</div>}
      </div>}
      <p className="update-dialog__hint">{ready ? '安装时会退出峡谷雷达，请在本局结束后安装。' : '在应用内下载，完成后由你确认安装。'}</p>
      {(error || activeDownload.error) && <p role="alert" className="update-dialog__error">{error || activeDownload.error}</p>}
      <div className="update-dialog__actions">
        {transferring ? <button type="button" className="update-dialog__ignore" onClick={() => void cancelDownload()}>取消下载</button>
          : <button type="button" className="update-dialog__ignore" disabled={busy || installing} onClick={ignore}>该版本不再提示</button>}
        <button type="button" autoFocus disabled={installing} onClick={() => setOpen(false)}>{transferring ? '后台下载' : ready ? '稍后安装' : '取消'}</button>
        <button type="button" className="update-dialog__primary" disabled={busy || transferring || installing} onClick={() => void download()}>{installing ? '正在启动…' : ready ? '退出并安装' : transferring || busy ? '正在下载…' : activeDownload.phase === 'error' ? '重新下载' : '下载更新'}</button>
      </div>
    </dialog>
  </>;
}
