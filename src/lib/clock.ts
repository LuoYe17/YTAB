/**
 * 时间口。凡是「停住多久算数」这类规则都从这里取时间，
 * 测试传假时钟即可验证，不必真等。
 */
export type Clock = {
  now(): number;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
};

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (id) => window.clearTimeout(id),
};
