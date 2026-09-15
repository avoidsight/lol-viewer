import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const execute = promisify(execFile);
const namespace = 'cn.lolviewer.desktop/feedback-device/v1';
export function hashDeviceIdentity(platform: string, identity: string): string {
  return createHash('sha256').update(`${namespace}\0${platform}\0${identity.trim().toLowerCase()}`).digest('hex');
}
export function parseMachineGuid(output: string): string | undefined {
  return /MachineGuid\s+REG_SZ\s+([a-f0-9-]{36})/i.exec(output)?.[1];
}
export async function readSystemIdentity(platform: NodeJS.Platform): Promise<string | undefined> {
  if (platform === 'win32') {
    const { stdout } = await execute(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe'),
      ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid', '/reg:64'],
      { timeout: 3000, windowsHide: true, maxBuffer: 16 * 1024 });
    return parseMachineGuid(stdout);
  }
  if (platform === 'darwin') {
    const { stdout } = await execute('/usr/sbin/ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { timeout: 3000, maxBuffer: 64 * 1024 });
    return /"IOPlatformUUID"\s*=\s*"([a-f0-9-]{36})"/i.exec(stdout)?.[1];
  }
  if (platform === 'linux') return (await readFile('/etc/machine-id', 'utf8')).trim();
}

// Keep only the app-scoped hash, outside install/cache directories. Never log the source ID.
export function createDeviceIdProvider(directory: string, platform = process.platform,
  readIdentity: () => Promise<string | undefined> = () => readSystemIdentity(platform)) {
  let pending: Promise<string> | undefined;
  const file = join(directory, 'device-id');
  const load = async () => {
    try {
      const saved = (await readFile(file, 'utf8')).trim();
      if (/^[a-f0-9]{64}$/.test(saved)) return saved;
    } catch { /* First run or unavailable storage. */ }
    const raw = await readIdentity().catch(() => undefined);
    const id = hashDeviceIdentity(platform, raw?.trim() || randomUUID());
    await mkdir(directory, { recursive: true, mode: 0o700 });
    try { await writeFile(file, id, { flag: 'wx', mode: 0o600 }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const saved = (await readFile(file, 'utf8')).trim();
      if (!/^[a-f0-9]{64}$/.test(saved)) throw new Error('Invalid saved device identity');
      return saved;
    }
    return id;
  };
  return () => pending ??= load().catch(error => { pending = undefined; throw error; });
}
