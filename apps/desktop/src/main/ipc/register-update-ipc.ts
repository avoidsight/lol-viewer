import { ipcMain } from 'electron';
import { UPDATE_CHECK, UPDATE_OPEN, versionSchema } from '../../shared/updates';
import { assertAuthorizedRenderer } from './authorization';
import type { UpdateService } from '../updates/service';
export function registerUpdateIpc(service: UpdateService) {
  ipcMain.handle(UPDATE_CHECK, event => { assertAuthorizedRenderer(event); return service.check(); });
  ipcMain.handle(UPDATE_OPEN, (event, version: unknown) => { assertAuthorizedRenderer(event); return service.open(versionSchema.parse(version)); });
}
