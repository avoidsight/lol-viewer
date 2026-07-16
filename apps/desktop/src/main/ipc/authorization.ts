import { BrowserWindow, type IpcMainInvokeEvent } from 'electron';

export function assertAuthorizedRenderer(event: IpcMainInvokeEvent): void {
  const authorized = BrowserWindow.getAllWindows()
    .some((window) => window.webContents === event.sender && !window.isDestroyed());
  if (!authorized) throw new Error('Unauthorized IPC sender');
}
