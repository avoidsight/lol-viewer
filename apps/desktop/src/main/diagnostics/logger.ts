import { randomBytes } from 'node:crypto';
import { appendFile, lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { diagnosticFromError, diagnosticMarker, type Diagnostic } from '../../shared/diagnostics';
import { historyErrorReason, historyErrorSource, historyErrorStatus } from '../../shared/history-error';

const operations = ['startup', 'phase', 'lcu.session', 'lcu.selection', 'lcu.summoner', 'lcu.history', 'lcu.detail', 'lcu.rank', 'lcu.token', 'lcu.assets', 'lcu.other',
  'sgp.history', 'sgp.rank', 'live.load', 'live.roster', 'live.player', 'history.load', 'history.detail', 'history.parse', 'history.cache', 'export'] as const;
export type DiagnosticOperation = typeof operations[number];
const phases = new Set(['None', 'Lobby', 'Matchmaking', 'ReadyCheck', 'ChampSelect', 'GameStart', 'InProgress', 'Reconnect', 'WaitingForStats', 'PreEndOfGame', 'EndOfGame', 'TerminatedInError']);
const fields = new Set(('games gameData gameId gameCreation gameDuration queue queueId id phase teamOne teamTwo myTeam theirTeam participants participantIdentities participantId player stats win kills deaths assists championId summonerId summonerName puuid displayName gameName tagLine playerAlias profileIconId selectedPosition assignedPosition teamId localPlayerCellId cellId isLocalPlayer queues queueType tier division rank leaguePoints json totalDamageDealtToChampions totalDamageTaken goldEarned totalMinionsKilled neutralMinionsKilled item0 item1 item2 item3 item4 item5 item6 spell1Id spell2Id summoner1Id summoner2Id timeline lane accessToken').split(' '));
type Context = { source?: 'lcu' | 'sgp' | 'app'; status?: number; elapsedMs?: number; issues?: unknown; attempt?: number };
type SafeIssue = { path: string; code: string; expected?: string; received?: string };
export function safeIssues(error: unknown): SafeIssue[] {
  if (!(error instanceof z.ZodError)) return [];
  const result: SafeIssue[] = [];
  const visit = (issues: z.ZodIssue[], depth: number) => {
    for (const issue of issues.slice(0, 8)) {
      if (result.length >= 8) break;
      if (issue.code === 'invalid_union' && depth < 2) { for (const nested of issue.unionErrors.slice(0, 3)) visit(nested.issues, depth + 1); continue; }
      result.push({ path: issue.path.slice(0, 10).map(p => typeof p === 'number' ? '[]' : fields.has(p) ? p : '*').join('.') || '$',
        code: Object.values(z.ZodIssueCode).includes(issue.code) ? issue.code : 'custom',
        ...(issue.code === 'invalid_type' ? {
          expected: Object.values(z.ZodParsedType).includes(issue.expected) ? issue.expected : 'unknown',
          received: Object.values(z.ZodParsedType).includes(issue.received) ? issue.received : 'unknown'
        } : {}) });
    }
  };
  visit(error.issues, 0); return result;
}
const files = ['current.jsonl', 'previous-1.jsonl', 'previous-2.jsonl'];
export class DiagnosticLogger {
  private queue: Promise<void>;
  private pending = 0;
  private failed = false;
  private dropped = 0;
  private lastPruned = 0;
  private phase = 'unknown';
  private recent = new Map<string, { info: Diagnostic; at: number; repeats: number }>();
  private readonly maxBytes: number;
  constructor(private root: string, private environment: { version: string; platform: string; osVersion: string; arch: string },
    private now = Date.now, maxBytes = 1024 * 1024) {
    this.maxBytes = maxBytes;
    this.queue = this.initialize().catch(() => { this.failed = true; });
    this.enqueue({ operation: 'startup', phase: this.phase, ...this.safeEnvironment() });
  }
  private async initialize() {
    await mkdir(this.root, { recursive: true });
    await this.prune();
  }
  private async fileInfo(path: string) {
    const info = await lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error; return undefined; });
    if (info && !info.isFile()) throw new Error('Invalid diagnostics file');
    return info;
  }
  private async prune() {
    const cutoff = this.now() - 7 * 86400_000;
    for (const name of files) {
      const path = join(this.root, name);
      const info = await this.fileInfo(path);
      if (!info) continue;
      if (info.mtimeMs < cutoff || info.size > this.maxBytes) { await unlink(path); continue; }
      const text = await readFile(path, 'utf8');
      const kept = text.split('\n').filter(line => {
        try { return Date.parse(JSON.parse(line).time) >= cutoff; } catch { return false; }
      }).join('\n');
      if (!kept) await unlink(path);
      else if (kept + '\n' !== text) await writeFile(path, kept + '\n', { mode: 0o600 });
    }
    this.lastPruned = this.now();
  }
  setPhase(value: string) {
    const next = phases.has(value) ? value : 'unknown';
    if (next !== this.phase) { this.phase = next; this.event('phase'); }
  }
  private enqueue(record: Record<string, unknown>) {
    if (this.pending >= 128) { this.dropped++; return; }
    const line = JSON.stringify({ time: new Date(this.now()).toISOString(), ...record }) + '\n';
    if (Buffer.byteLength(line) > this.maxBytes) { this.dropped++; return; }
    this.pending++;
    this.queue = this.queue.then(async () => {
      if (this.failed) return;
      if (this.now() - this.lastPruned > 86400_000) await this.prune();
      const path = join(this.root, files[0]);
      const size = (await this.fileInfo(path))?.size ?? 0;
      if (size + Buffer.byteLength(line) > this.maxBytes) {
        await unlink(join(this.root, files[2])).catch(error => { if (error.code !== 'ENOENT') throw error; });
        for (let i = 1; i >= 0; i--) await rename(join(this.root, files[i]), join(this.root, files[i + 1])).catch(error => { if (error.code !== 'ENOENT') throw error; });
      }
      await appendFile(path, line, { mode: 0o600 });
    }).catch(() => { this.failed = true; }).finally(() => { this.pending--; });
  }
  event(operation: DiagnosticOperation, count?: number) {
    this.enqueue({ operation: operations.includes(operation) ? operation : 'live.load', phase: this.phase,
      ...(count === undefined ? {} : { count: Math.min(1e6, Math.max(0, count)) }) });
  }
  error(operation: DiagnosticOperation, error: unknown, context: Context = {}): Diagnostic | undefined {
    if ((error as { code?: string } | null)?.code === 'MATCH_CANCELLED') return undefined;
    const existing = diagnosticFromError(error);
    if (existing) return existing;
    const reason = historyErrorReason(error);
    const source = context.source ?? historyErrorSource(error) ?? 'app';
    const rawStatus = context.status ?? historyErrorStatus(error);
    const status = Number.isInteger(rawStatus) && rawStatus! >= 100 && rawStatus! <= 599 ? rawStatus : undefined;
    const record = { operation: operations.includes(operation) ? operation : 'live.load', phase: this.phase, reason,
      source: ['lcu', 'sgp', 'app'].includes(source) ? source : 'app', status, issues: safeIssues(context.issues ?? error) };
    const key = JSON.stringify(record);
    const previous = this.recent.get(key);
    if (previous && this.now() - previous.at < 30_000) {
      previous.repeats++;
      this.attach(error, previous.info); return previous.info;
    }
    if (previous?.repeats) this.enqueue({ operation: record.operation, id: previous.info.id, repeats: previous.repeats });
    if (this.recent.size >= 100) this.recent.delete(this.recent.keys().next().value!);
    const info: Diagnostic = { id: `D-${randomBytes(6).toString('hex').toUpperCase()}`, reason };
    this.recent.set(key, { info, at: this.now(), repeats: 0 });
    this.attach(error, info);
    this.enqueue({ ...record, id: info.id,
      ...(Number.isFinite(context.elapsedMs) ? { elapsedMs: Math.min(3600_000, Math.max(0, Math.round(context.elapsedMs!))) } : {}),
      ...(Number.isInteger(context.attempt) ? { attempt: Math.min(100, Math.max(0, context.attempt!)) } : {}) });
    return info;
  }
  private attach(error: unknown, diagnostic: Diagnostic) {
    if (error && typeof error === 'object') { try { Object.assign(error, { diagnostic }); } catch { /* Frozen error. */ } }
  }
  async exportText(): Promise<string> {
    for (const entry of this.recent.values()) if (entry.repeats) {
      this.enqueue({ id: entry.info.id, repeats: entry.repeats }); entry.repeats = 0;
    }
    const snapshot = this.queue.then(() => this.snapshot());
    this.queue = snapshot.then(() => {}, () => {});
    return snapshot;
  }
  private safeEnvironment() {
    const safe = (s: string) => s.replace(/[^a-zA-Z0-9 ._-]/g, '').slice(0, 80);
    return { version: safe(this.environment.version), platform: safe(this.environment.platform),
      osVersion: safe(this.environment.osVersion), arch: safe(this.environment.arch) };
  }
  private async snapshot(): Promise<string> {
    if (this.failed) throw new Error('Diagnostics storage unavailable');
    await this.prune();
    const header = JSON.stringify({ exportedAt: new Date(this.now()).toISOString(),
      ...this.safeEnvironment(), dropped: this.dropped });
    const logs: string[] = [];
    for (const name of [...files].reverse()) {
      const path = join(this.root, name);
      const info = await this.fileInfo(path);
      if (info && this.now() - info.mtimeMs <= 7 * 86400_000 && info.size <= this.maxBytes) logs.push(await readFile(path, 'utf8'));
    }
    return header + '\n' + logs.join('');
  }
  async flush(): Promise<void> { await this.queue; }
}
let current: DiagnosticLogger | undefined;
export function setDiagnosticLogger(logger?: DiagnosticLogger) { current = logger; }
export function recordDiagnostic(operation: DiagnosticOperation, error: unknown, context?: Context): Diagnostic | undefined {
  return current?.error(operation, error, context);
}
export function diagnosticPhase(phase: string) { current?.setPhase(phase); }
export function diagnosticEvent(operation: DiagnosticOperation, count?: number) { current?.event(operation, count); }
export function safeLiveError(error: unknown, operation: DiagnosticOperation): Error {
  const diagnostic = recordDiagnostic(operation, error);
  return new Error(`Live data unavailable${diagnosticMarker(diagnostic)}`);
}
export function lcuOperation(path: string): DiagnosticOperation {
  if (path.startsWith('/lol-gameflow/')) return 'lcu.session';
  if (path.startsWith('/lol-champ-select/')) return 'lcu.selection';
  if (path.startsWith('/lol-summoner/')) return 'lcu.summoner';
  if (path.startsWith('/lol-match-history/v1/games/')) return 'lcu.detail';
  if (path.startsWith('/lol-match-history/')) return 'lcu.history';
  if (path.startsWith('/lol-ranked/')) return 'lcu.rank';
  if (path.includes('token')) return 'lcu.token';
  if (path.startsWith('/lol-game-data/')) return 'lcu.assets';
  return 'lcu.other';
}
