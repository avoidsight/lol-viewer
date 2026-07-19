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
}

const execFileAsync = promisify(execFile);

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
  return { port: portNumber, password, protocol: 'https' };
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
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='LeagueClientUx.exe'\" | Select-Object Name,CommandLine | ConvertTo-Json -Compress"
    ]);
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

export async function discoverLcuConnection(
  processes?: ProcessInfo[]
): Promise<LcuConnection | null> {
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
