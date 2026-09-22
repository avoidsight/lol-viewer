import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { nativeScript } from './native-script';

// One process per explicit request. Encoding applies only to fixed source, never user text.
export function typeWithWindowsHelper(text: string, signal: AbortSignal, validate: () => Promise<boolean>, spawnHelper: typeof spawn = spawn): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('cancelled')); return; }
    const executable = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const child = spawnHelper(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(nativeScript, 'utf16le').toString('base64')], {
      windowsHide: true, stdio: ['pipe', 'pipe', 'ignore']
    });
    let settled = false;
    let ready = false;
    let output = '';
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      child.stdin.destroy();
      if (child.exitCode === null) child.kill();
      if (error) reject(error); else resolve();
    };
    const cancel = () => finish(new Error('cancelled'));
    const timer = setTimeout(() => finish(new Error('timeout')), 8000);
    signal.addEventListener('abort', cancel, { once: true });
    child.on('error', () => finish(new Error('helper unavailable')));
    child.stdin.on('error', () => finish(new Error('helper disconnected')));
    child.on('close', code => finish(code === 0 && ready ? undefined : new Error('input interrupted')));
    child.stdout.on('data', (data: Buffer) => {
      output += data.toString('ascii');
      if (output.length > 64) { finish(new Error('invalid helper response')); return; }
      if (ready || !output.includes('\n')) return;
      if (output.trim() !== 'READY') { finish(new Error('invalid helper response')); return; }
      ready = true;
      void validate().then(valid => {
        if (settled) return;
        if (!valid || signal.aborted) { finish(new Error('stale game')); return; }
        child.stdin.end(Buffer.from(text, 'utf8').toString('base64') + '\n');
      }).catch(() => finish(new Error('game unavailable')));
    });
  });
}
