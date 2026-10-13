import { BrowserWindow, ipcMain } from 'electron';
import { UPDATE_CANCEL, UPDATE_CHECK, UPDATE_DOWNLOAD, UPDATE_INSTALL, UPDATE_STATE, UPDATE_STATUS, versionSchema } from '../../shared/updates';
import { assertAuthorizedRenderer } from './authorization';
import type { UpdateService } from '../updates/service';
export function registerUpdateIpc(service: UpdateService) {
  ipcMain.handle(UPDATE_CHECK, event => { assertAuthorizedRenderer(event); return service.check(); });
  ipcMain.handle(UPDATE_STATUS, event => { assertAuthorizedRenderer(event); return service.status(); });
  ipcMain.handle(UPDATE_DOWNLOAD, (event, version: unknown) => { assertAuthorizedRenderer(event); return service.download(versionSchema.parse(version)); });
  ipcMain.handle(UPDATE_CANCEL, event => { assertAuthorizedRenderer(event); return service.cancel(); });
  ipcMain.handle(UPDATE_INSTALL, (event, version: unknown) => { assertAuthorizedRenderer(event); return service.install(versionSchema.parse(version)); });
  service.subscribe(state => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send(UPDATE_STATE, state);
    }
  });
}
