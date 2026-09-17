import { useEffect, useRef, useState } from 'react';
import type { LolViewerApi } from '../../../../shared/ipc';
import { versionSchema, type AvailableUpdate } from '../../../../shared/updates';
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
  const dialog = useRef<HTMLDialogElement>(null);
  const known = useRef<string | undefined>(undefined);
  const prompted = useRef(new Set<string>());
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
    if (!update || busy) return;
    setBusy(true); setError('');
    try {
      if (await api?.openUpdate?.(update.version)) setOpen(false);
      else setError('暂时无法下载，版本可能已撤下或网络不可用，请稍后重试。');
    } catch { setError('打开下载失败，请稍后重试。'); }
    finally { setBusy(false); }
  }
  return <>
    {update && <button className="update-trigger" type="button" onClick={() => { prompted.current.add(update.version); setError(''); setOpen(true); }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m-5 5 5-5 5 5M5 16v4h14v-4" /></svg>新版本<span className="update-trigger__dot" /></button>}
    <dialog ref={dialog} className="update-dialog" aria-labelledby="update-title" onCancel={event => { event.preventDefault(); setOpen(false); }}>
      <span className="update-dialog__badge">{update?.important ? '重要更新' : '版本更新'}</span>
      <h2 id="update-title">新版本 {update?.version}</h2>
      <div className="update-dialog__notes">{update?.notes}</div>
      <p className="update-dialog__hint">更新将打开官方下载链接，请下载安装包后覆盖安装。不会自动退出或安装。</p>
      {error && <p role="alert" className="update-dialog__error">{error}</p>}
      <div className="update-dialog__actions">
        <button type="button" className="update-dialog__ignore" disabled={busy} onClick={ignore}>该版本不再提示</button>
        <button type="button" autoFocus onClick={() => setOpen(false)}>取消</button>
        <button type="button" className="update-dialog__primary" disabled={busy} onClick={() => void download()}>{busy ? '正在检查…' : '更新'}</button>
      </div>
    </dialog>
  </>;
}
