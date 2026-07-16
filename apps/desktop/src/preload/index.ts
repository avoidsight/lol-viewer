import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('lolViewer', Object.freeze({}));
