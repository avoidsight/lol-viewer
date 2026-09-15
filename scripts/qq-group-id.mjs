// One-shot QQ group ID lookup. Node.js 22+, no dependencies or stored secrets.
import { pathToFileURL } from 'node:url';

export function groupIdFromEvent(event) {
  return event?.op === 0 && event?.t === 'GROUP_AT_MESSAGE_CREATE' &&
    typeof event.d?.group_openid === 'string' && /^[\w-]{1,256}$/.test(event.d.group_openid)
    ? event.d.group_openid : null;
}

export function validateGateway(value) {
  const url = new URL(value);
  if (url.protocol !== 'wss:' || !url.hostname.endsWith('.qq.com') || url.username || url.password) {
    throw new Error('QQ 返回了不受信任的连接地址');
  }
  return url.href;
}

async function readSecret() {
  if (!process.stdin.isTTY) throw new Error('请在交互式终端中运行，以安全输入 Secret');
  process.stdout.write('AppSecret（输入不回显）：');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let secret = '';
    const cleanup = () => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    const onData = (chunk) => {
      for (const character of chunk.toString()) {
        if (character === '\u0003') {
          cleanup(); reject(new Error('已取消')); return;
        }
        if (character === '\r' || character === '\n') {
          cleanup(); resolve(secret.trim()); return;
        }
        if (character === '\u007f' || character === '\b') secret = secret.slice(0, -1);
        else if (character >= ' ') secret += character;
      }
    };
    process.stdin.on('data', onData);
  });
}

async function requestJson(url, options, stage) {
  let response;
  try {
    response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
  } catch {
    throw new Error(`${stage}：网络失败或超时`);
  }
  if (!response.ok) {
    // Only expose numeric platform error codes, never raw response bodies or credentials.
    const body = await response.json().catch(() => null);
    const code = String(body?.code ?? body?.errcode ?? '');
    const suffix = /^\d{1,12}$/.test(code) ? `，QQ 错误码 ${code}` : '';
    if (body?.message === '接口访问源IP不在白名单') {
      throw new Error(`${stage}：HTTP ${response.status}${suffix}，接口访问源 IP 不在白名单`);
    }
    throw new Error(`${stage}：HTTP ${response.status}${suffix}`);
  }
  try { return await response.json(); }
  catch { throw new Error(`${stage}：响应不是有效 JSON`); }
}

async function main() {
  const appId = process.argv[2];
  if (!/^\d+$/.test(appId ?? '')) throw new Error('用法：node scripts/qq-group-id.mjs <AppID>');
  let secret = await readSecret();
  if (!secret) throw new Error('Secret 不能为空');
  const auth = await requestJson('https://bots.qq.com/app/getAppAccessToken', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId, clientSecret: secret }),
  }, '获取 Token');
  secret = '';
  if (typeof auth.access_token !== 'string' || !auth.access_token) throw new Error('未获取到 Token，请检查凭据');
  console.log('Token 获取成功（不显示凭据）。正在连接事件服务……');
  const gateway = await requestJson('https://api.sgroup.qq.com/gateway', {
    headers: { Authorization: `QQBot ${auth.access_token}` },
  }, '获取事件连接地址');
  const endpoint = validateGateway(gateway.url);
  await new Promise((resolve, reject) => {
    const socket = new WebSocket(endpoint);
    let sequence = null;
    let heartbeat;
    let acknowledged = true;
    let done = false;
    const finish = (error) => {
      if (done) return;
      done = true;
      clearInterval(heartbeat);
      clearTimeout(connectionTimeout);
      clearTimeout(deadline);
      socket.close();
      if (error) reject(error); else resolve();
    };
    const connectionTimeout = setTimeout(() => finish(new Error('连接或鉴权超时；可能需要使用 Webhook 回调')), 30000);
    const deadline = setTimeout(() => finish(new Error('10 分钟内未收到群 @ 消息；检查机器人入群和群事件权限')), 600000);
    socket.addEventListener('error', () => finish(new Error('事件连接失败；请检查网络或使用 Webhook 回调')));
    socket.addEventListener('close', (event) => finish(new Error(`事件连接关闭（${event.code}）；请检查事件权限或使用 Webhook 回调`)));
    socket.addEventListener('message', (message) => {
      if (done) return;
      let event;
      try { event = JSON.parse(message.data); } catch { return; }
      if (Number.isInteger(event.s)) sequence = event.s;
      if (event.op === 10) {
        const interval = event.d?.heartbeat_interval;
        if (!Number.isFinite(interval) || interval < 1000 || interval > 120000) {
          finish(new Error('无效的心跳设置')); return;
        }
        clearInterval(heartbeat);
        socket.send(JSON.stringify({ op: 2, d: {
          token: `QQBot ${auth.access_token}`, intents: 1 << 25, shard: [0, 1], properties: {},
        } }));
        heartbeat = setInterval(() => {
          if (!acknowledged) { finish(new Error('事件连接心跳超时')); return; }
          acknowledged = false;
          socket.send(JSON.stringify({ op: 1, d: sequence }));
        }, interval);
      }
      if (event.op === 11) acknowledged = true;
      if (event.op === 9 || event.op === 7) finish(new Error('事件会话不可用，请检查群事件权限后重试'));
      if (event.op === 0 && event.t === 'READY') {
        clearTimeout(connectionTimeout);
        console.log('已连接。请在目标 QQ 群中 @机器人 测试（等待最多 10 分钟）。');
      }
      const groupId = groupIdFromEvent(event);
      if (groupId) {
        console.log(`group_openid: ${groupId}`);
        console.log('已获取群 ID，监听结束；没有发送任何消息。');
        finish();
      }
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
