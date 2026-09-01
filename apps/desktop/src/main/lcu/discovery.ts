import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

export interface ProcessInfo {
  name?: string;
  commandLine: string;
}

export interface LcuConnection {
  port: number;
  password: string;
  protocol: 'https';
  region?: string;
  rsoPlatformId?: string;
}

const execFileAsync = promisify(execFile);
const unavailableRetryMs = 3_000;

function commandLineConnection(process: ProcessInfo): LcuConnection | null {
  if (process.name && !/^LeagueClientUx(?:\.exe)?$/i.test(process.name)) return null;

  const port = /(?:^|\s)"?--app-port=(?:"(\d+)"|(\d+))"?(?:\s|$)/.exec(
    process.commandLine
  );
  const token = /(?:^|\s)"?--remoting-auth-token=(?:"([^"]+)"|([^"\s]+))"?(?:\s|$)/.exec(
    process.commandLine
  );
  const portNumber = Number(port?.[1] ?? port?.[2]);
  const password = token?.[1] ?? token?.[2];

  if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65_535 || !password) return null;
  const region = /--region=(?:"([\w-]+)"|([\w-]+))/i.exec(process.commandLine);
  const platform = /--rso[_-]platform[_-]id=(?:"([\w-]+)"|([\w-]+))/i.exec(process.commandLine);
  const regionValue = region?.[1] ?? region?.[2];
  const platformValue = platform?.[1] ?? platform?.[2];
  return {
    port: portNumber,
    password,
    protocol: 'https',
    ...(regionValue ? { region: regionValue } : {}),
    ...(platformValue ? { rsoPlatformId: platformValue } : {})
  };
}

function lockfileConnection(contents: string): LcuConnection | null {
  const fields = contents.trim().split(':');
  if (fields.length !== 5) return null;
  const port = Number(fields[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65_535 || !fields[3] || fields[4] !== 'https') {
    return null;
  }
  return { port, password: fields[3], protocol: 'https' };
}

async function runningProcesses(): Promise<ProcessInfo[]> {
  if (process.platform !== 'win32') return [];
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name='LeagueClientUx.exe'\" | Select-Object Name,CommandLine | ConvertTo-Json -Compress"
      ],
      { windowsHide: true, timeout: 5_000 }
    );
    if (!stdout.trim()) return [];
    const result = JSON.parse(stdout) as
      | { Name?: string; CommandLine?: string }
      | Array<{ Name?: string; CommandLine?: string }>;
    return (Array.isArray(result) ? result : [result])
      .filter((item): item is { Name?: string; CommandLine: string } => Boolean(item.CommandLine))
      .map((item) => ({ name: item.Name, commandLine: item.CommandLine }));
  } catch {
    return [];
  }
}

function lockfilePaths(): string[] {
  if (process.env.LCU_LOCKFILE_PATH) return [process.env.LCU_LOCKFILE_PATH];
  const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(
    (root): root is string => Boolean(root)
  );
  return roots.map((root) => join(root, 'Riot Games', 'League of Legends', 'lockfile'));
}

async function discoverUncached(processes?: ProcessInfo[]): Promise<LcuConnection | null> {
  for (const processInfo of processes ?? (await runningProcesses())) {
    const connection = commandLineConnection(processInfo);
    if (connection) return connection;
  }

  for (const path of lockfilePaths()) {
    try {
      const connection = lockfileConnection(await fs.readFile(path, 'utf8'));
      if (connection) return connection;
    } catch {
      // A missing or temporarily locked lockfile simply means LCU is unavailable.
    }
  }
  return null;
}

type Discover = () => Promise<LcuConnection | null>;

export class LcuConnectionDiscovery {
  private cached: LcuConnection | undefined;
  private inFlight: Promise<LcuConnection | null> | undefined;
  private retryAfter = 0;

  constructor(
    private readonly discover: Discover,
    private readonly retryMs = unavailableRetryMs,
    private readonly now: () => number = Date.now
  ) {}

  get(): Promise<LcuConnection | null> {
    if (this.cached) return Promise.resolve(this.cached);
    if (this.inFlight) return this.inFlight;
    if (this.now() < this.retryAfter) return Promise.resolve(null);

    const request = this.discover()
      .then((connection) => {
        if (connection) {
          this.cached = connection;
          this.retryAfter = 0;
        } else {
          this.retryAfter = this.now() + this.retryMs;
        }
        return connection;
      })
      .finally(() => {
        if (this.inFlight === request) this.inFlight = undefined;
      });
    this.inFlight = request;
    return request;
  }

  invalidate(connection?: LcuConnection): void {
    if (
      connection &&
      this.cached &&
      (connection.port !== this.cached.port || connection.password !== this.cached.password)
    ) return;
    this.cached = undefined;
    this.retryAfter = 0;
  }
}

const sharedDiscovery = new LcuConnectionDiscovery(() => discoverUncached());

export function discoverLcuConnection(processes?: ProcessInfo[]): Promise<LcuConnection | null> {
  // Explicit process input is used by diagnostics/tests and must not alter the shared runtime cache.
  return processes === undefined ? sharedDiscovery.get() : discoverUncached(processes);
}

export function invalidateLcuConnection(connection?: LcuConnection): void {
  sharedDiscovery.invalidate(connection);
}
