import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import {
  CHAMPION_CATALOG_GET_CHANNEL, CHAMPION_DETAILS_GET_CHANNEL, CHAMPION_GUIDE_GET_CHANNEL,
  championCatalogSchema, championDetailsRequestSchema, championDetailsSchema,
  championGuideRequestSchema, championGuideSchema,
  type ChampionCatalogEntry, type ChampionDetails, type ChampionGuide, type ChampionLane
} from '../../shared/ipc';
import { assertAuthorizedRenderer } from './authorization';

interface ChampionService {
  getChampionGuide(id: number, lane: ChampionLane): Promise<ChampionGuide>;
  getCatalog(): Promise<ChampionCatalogEntry[]>;
  getDetails(id: number): Promise<ChampionDetails>;
}

export function registerChampionIpc(service: ChampionService): void {
  ipcMain.handle(CHAMPION_GUIDE_GET_CHANNEL, async (event: IpcMainInvokeEvent, input: unknown) => {
    assertAuthorizedRenderer(event);
    const request = championGuideRequestSchema.parse(input);
    return championGuideSchema.parse(await service.getChampionGuide(request.championId, request.lane));
  });
  ipcMain.handle(CHAMPION_CATALOG_GET_CHANNEL, async (event: IpcMainInvokeEvent) => {
    assertAuthorizedRenderer(event);
    return championCatalogSchema.parse(await service.getCatalog());
  });
  ipcMain.handle(CHAMPION_DETAILS_GET_CHANNEL, async (event: IpcMainInvokeEvent, input: unknown) => {
    assertAuthorizedRenderer(event);
    const request = championDetailsRequestSchema.parse(input);
    return championDetailsSchema.parse(await service.getDetails(request.championId));
  });
}