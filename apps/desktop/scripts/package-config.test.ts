import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('desktop packaging metadata', () => {
  it('declares the workspace pnpm version for electron-builder dependency collection', () => {
    const desktop = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { packageManager?: string };
    const workspace = JSON.parse(readFileSync(resolve('../..', 'package.json'), 'utf8')) as { packageManager?: string };
    expect(desktop.packageManager).toBe('pnpm@10.13.1');
    expect(desktop.packageManager).toBe(workspace.packageManager);
  });

  it('requests administrator rights for Tencent LCU process discovery', () => {
    const desktop = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
      build?: { win?: { requestedExecutionLevel?: string; signAndEditExecutable?: boolean; signExecutable?: boolean } };
    };

    expect(desktop.build?.win?.requestedExecutionLevel).toBe('requireAdministrator');
    expect(desktop.build?.win?.signAndEditExecutable).toBe(true);
    expect(desktop.build?.win?.signExecutable).toBe(false);
  });

  it('provides a Windows one-click packaging entry point', () => {
    const workspaceRoot = resolve('../..');
    const workspace = JSON.parse(readFileSync(resolve(workspaceRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const launcher = readFileSync(resolve(workspaceRoot, 'package-windows.bat'), 'utf8');
    const packageScript = readFileSync(resolve(workspaceRoot, 'scripts/package-windows.ps1'), 'utf8');

    expect(workspace.scripts?.['package:win']).toBe('pnpm --dir apps/desktop package:win');
    expect(launcher).toContain('scripts\\package-windows.ps1');
    expect(packageScript).toContain('pnpm@$PnpmVersion');
    expect(packageScript).toContain('install", "--frozen-lockfile');
    expect(packageScript).toContain('"apps/desktop", "package:win"');
    expect(packageScript).toContain('$ReleaseDirectory');
  });
});
