import { ipcMain } from 'electron';
import { DONATION_CONFIG_CHANNEL, DONATION_IMAGE_CHANNEL } from '../../shared/donation';
import { assertAuthorizedRenderer } from './authorization';
import type { DonationService } from '../donation/service';
export function registerDonationIpc(service: DonationService) {
  ipcMain.handle(DONATION_CONFIG_CHANNEL, (event) => { assertAuthorizedRenderer(event); return service.getConfig(); });
  ipcMain.handle(DONATION_IMAGE_CHANNEL, (event) => { assertAuthorizedRenderer(event); return service.getImage(); });
}
