import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { CHAMPION_GUIDE_GET_CHANNEL, championGuideRequestSchema, championGuideSchema, type ChampionGuide, type ChampionLane } from '../../shared/ipc';
import { assertAuthorizedRenderer } from './authorization';

export function registerChampionIpc(service: { getChampionGuide(id: number, lane: ChampionLane): Promise<ChampionGuide> }): void {
  ipcMain.handle(CHAMPION_GUIDE_GET_CHANNEL, async (event: IpcMainInvokeEvent, input: unknown) => {
    assertAuthorizedRenderer(event);
    const request = championGuideRequestSchema.parse(input);
    return championGuideSchema.parse(await service.getChampionGuide(request.championId, request.lane));
  });
}
