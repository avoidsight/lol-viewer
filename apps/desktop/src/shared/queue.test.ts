import { describe, expect, it } from 'vitest';
import { describeQueue } from './queue';

describe('describeQueue', () => {
  it.each([
    [420, '单双排'],
    [440, '灵活排位'],
    [430, '匹配模式'],
    [450, '极地大乱斗'],
    [1700, '其他模式']
  ])('labels queue %i', (queueId, label) => {
    expect(describeQueue(queueId)).toBe(label);
  });
});
