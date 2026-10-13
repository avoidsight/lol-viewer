import { dialog, ipcMain } from 'electron';
import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { DIAGNOSTICS_EXPORT, type DiagnosticExportResult } from '../../shared/diagnostics';
import type { DiagnosticLogger } from '../diagnostics/logger';
import { assertAuthorizedRenderer } from './authorization';

export function registerDiagnosticsIpc(logger: DiagnosticLogger) {
  let exporting = false;
  ipcMain.handle(DIAGNOSTICS_EXPORT, async (event, input: unknown): Promise<DiagnosticExportResult> => {
    assertAuthorizedRenderer(event); z.undefined().parse(input);
    if (exporting) return { status: 'busy' };
    exporting = true;
    try {
      const selection = await dialog.showSaveDialog({ title: '导出诊断日志',
        defaultPath: `峡谷雷达-诊断-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`,
        filters: [{ name: '诊断日志', extensions: ['txt'] }] });
      if (selection.canceled || !selection.filePath) return { status: 'cancelled' };
      const content = await logger.exportText();
      await writeFile(selection.filePath, content, { encoding: 'utf8', mode: 0o600 });
      return { status: 'saved' };
    } catch { return { status: 'failed' }; }
    finally { exporting = false; }
  });
}
