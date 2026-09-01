export function isRankedQueue(queueId: number): boolean {
  return queueId === 420 || queueId === 440;
}

export function describeQueue(queueId: number): string {
  if (queueId === 420) return '单双排';
  if (queueId === 440) return '灵活排位';
  if (queueId === 400 || queueId === 430) return '匹配模式';
  if (queueId === 450) return '极地大乱斗';
  return '其他模式';
}
