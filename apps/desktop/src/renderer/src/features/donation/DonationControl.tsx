import { useEffect, useRef, useState } from 'react';
import type { LolViewerApi } from '../../../../shared/ipc';
import './donation.css';

export function DonationControl({ api }: { api?: LolViewerApi }) {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const generation = useRef(0);
  const revision = useRef<number | undefined>(undefined);
  const close = () => { generation.current++; setOpen(false); setImage(null); };
  useEffect(() => {
    let disposed = false;
    let pending = false;
    let checkedAt = 0;
    const refresh = async () => {
      if (document.hidden || pending || Date.now() - checkedAt < 30000) return;
      pending = true; checkedAt = Date.now();
      try {
        const config = await api?.getDonationConfig?.();
        if (disposed) return;
        setEnabled(Boolean(config?.enabled));
        if (!config?.enabled || (revision.current !== undefined && revision.current !== config.revision)) close();
        revision.current = config?.revision;
      } catch { if (!disposed) { setEnabled(false); close(); } }
      finally { pending = false; }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 60000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { disposed = true; generation.current++; clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [api]);
  useEffect(() => {
    const element = dialog.current;
    if (open && element && !element.open) element.showModal();
    else if (!open && element?.open) element.close();
  }, [open]);
  async function show() {
    const current = ++generation.current;
    setOpen(true); setLoading(true); setImage(null);
    try {
      const value = await api?.getDonationImage?.();
      if (current === generation.current) setImage(value ?? null);
    } catch { if (current === generation.current) setImage(null); }
    finally { if (current === generation.current) setLoading(false); }
  }
  return <>
    {enabled && <button type="button" className="donation-trigger" onClick={() => void show()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /></svg>支持作者</button>}
    <dialog ref={dialog} className="donation-dialog" aria-labelledby="donation-title" onCancel={(e) => { e.preventDefault(); close(); }}>
      <button autoFocus type="button" className="donation-close" aria-label="关闭赞赏" onClick={close}>×</button>
      <div className="donation-heart" aria-hidden="true">♡</div><h2 id="donation-title">谢谢你的支持</h2>
      <p>如果 LOL Viewer 对你有帮助，可以请作者喝杯咖啡。</p>
      <div className="donation-code" aria-live="polite">{loading ? <span>正在加载赞赏码…</span> : image ? <img src={image} alt="微信赞赏码" onError={() => setImage(null)} /> : <span>赞赏暂不可用，请关闭后重试。</span>}</div>
      <strong>微信扫一扫</strong><small>自愿支持，不影响任何功能</small>
    </dialog>
  </>;
}
