import test from 'node:test';
import assert from 'node:assert/strict';
import { groupIdFromEvent, validateGateway } from './qq-group-id.mjs';

test('only extracts group ID from group mention event', () => {
  assert.equal(groupIdFromEvent({ op: 0, t: 'GROUP_AT_MESSAGE_CREATE', d: {
    group_openid: 'ABC_123', author: { member_openid: 'USER' },
  } }), 'ABC_123');
  for (const event of [null, {}, { op: 0, t: 'C2C_MESSAGE_CREATE', d: { group_openid: '123' } },
    { op: 0, t: 'GROUP_AT_MESSAGE_CREATE', d: { group_openid: '\nsecret' } }]) {
    assert.equal(groupIdFromEvent(event), null);
  }
});

test('credentials may only be sent to QQ secure gateway', () => {
  assert.equal(validateGateway('wss://api.sgroup.qq.com/websocket/'), 'wss://api.sgroup.qq.com/websocket/');
  for (const url of ['ws://api.sgroup.qq.com', 'wss://qq.com.evil.test', 'wss://evilqq.com',
    'wss://user@api.sgroup.qq.com', 'not a url']) assert.throws(() => validateGateway(url));
});
