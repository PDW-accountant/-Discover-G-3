import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadData } from '../src/js/lib/data.js';
import { changeText, expressLinesOf, resolveSteps, trainKind } from '../src/js/lib/route-steps.js';

// 환승 줄 문구를 data/copy.json에서 읽도록, 화면처럼 loadData()로 문구를 불러 둔다(departure.test.js와 같은 방식).
before(async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = new URL(`../${url}`, import.meta.url);
    const body = String(url).endsWith('copy.json') ? await readFile(path, 'utf8') : '{}';
    return { json: async () => JSON.parse(body) };
  };
  try { await loadData(); } finally { globalThis.fetch = original; }
});

// 실행: npm test
// #53 추천 결과 경로 카드·개인 경로 화면이 같이 쓰는 구간 표시. 그리는 부분(badgeNode·stepList)은 브라우저에서 확인한다.

const graph = { routes: [{ id: '9', line: '9', express: false }, { id: '9-express', line: '9', express: true }, { id: '2-main', line: '2', express: false }] };

test('#53: 급행 계통이 있는 호선만 급행 노선으로 본다', () => {
  assert.deepEqual([...expressLinesOf(graph)], ['9']);
  assert.deepEqual([...expressLinesOf(null)], []);
});

test("#53: 급행이 있는 노선은 '급행'/'일반', 없는 노선은 표시 없음", () => {
  const lines = expressLinesOf(graph);
  assert.equal(trainKind({ line: '9', express: true }, lines), 'express');
  assert.equal(trainKind({ line: '9', express: false }, lines), 'local');
  assert.equal(trainKind({ line: '2', express: false }, lines), null);
});

test('#53: 계산 결과 구간(역 id)을 화면용 구간(역 정보·급행 표시)으로 바꾼다', () => {
  const stationsById = { A: { id: 'A', name: '가' }, B: { id: 'B', name: '나' }, C: { id: 'C', name: '다' } };
  const steps = resolveSteps([
    { line: '9', express: true, from: 'A', to: 'B', minutes: 7 },
    { line: '2', express: false, from: 'B', to: 'X', minutes: 3 },
  ], stationsById, expressLinesOf(graph));
  assert.deepEqual(steps, [
    { line: '9', train: 'express', from: stationsById.A, to: stationsById.B, minutes: 7, via: [] },
    { line: '2', train: null, from: stationsById.B, to: { id: 'X', name: 'X', lines: [] }, minutes: 3, via: [] }, // 모르는 역은 id를 이름으로
  ]);
  // 지나는 역(via, 지도 경로선용 #16)도 역 정보로 바꾼다
  const [withVia] = resolveSteps([{ line: '3', express: false, from: 'A', to: 'C', minutes: 5, via: ['A', 'B', 'C'] }], stationsById, new Set());
  assert.deepEqual(withVia.via, [stationsById.A, stationsById.B, stationsById.C]);
  assert.deepEqual(resolveSteps(undefined, stationsById, new Set()), []);
});

test('#53·#25: 계산 결과의 갈아타기 정보(change)를 구간에 그대로 넘긴다', () => {
  const stationsById = { A: { id: 'A', name: '가' }, B: { id: 'B', name: '나' }, C: { id: 'C', name: '다' } };
  const steps = resolveSteps([
    { line: '3', express: false, from: 'A', to: 'B', minutes: 5 },
    { line: '2', express: false, from: 'B', to: 'C', minutes: 4, change: { type: 'transfer', walk: 1, wait: 3 } },
  ], stationsById, new Set());
  assert.equal(steps[0].change, undefined);
  assert.deepEqual(steps[1].change, { type: 'transfer', walk: 1, wait: 3 });
});

test('#53·#25: 환승 줄은 도보·대기 분을 보여주고, 급행↔일반 갈아타기는 대기만', () => {
  const at = (name) => ({ id: name, name });
  assert.equal(changeText({ line: '3', train: null, from: at('신사'), change: { type: 'transfer', walk: 1, wait: 3 } }, { line: '신분당' }),
    '신사역에서 환승 · 도보 1분 + 대기 3분');
  assert.equal(changeText({ line: '2', train: null, from: at('잠실'), change: { type: 'transfer', walk: 0, wait: 3 } }, { line: '8' }),
    '잠실역에서 환승 · 대기 3분'); // 도보 1분 미만이면 대기만
  assert.equal(changeText({ line: '9', train: 'express', from: at('당산'), change: { type: 'swap', walk: 0, wait: 3 } }, { line: '9' }),
    '당산역에서 급행으로 갈아타기 · 대기 3분');
  assert.equal(changeText({ line: '2', train: null, from: at('시청') }, { line: '1' }), '시청역에서 환승'); // change가 없는 예전 결과
  assert.equal(changeText({ line: '1', train: null, from: at('서울') }, { line: '1' }), null);
});
