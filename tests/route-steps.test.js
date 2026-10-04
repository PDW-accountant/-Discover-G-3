import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expressLinesOf, resolveSteps, trainKind } from '../src/js/lib/route-steps.js';

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
    { line: '9', train: 'express', from: stationsById.A, to: stationsById.B, minutes: 7 },
    { line: '2', train: null, from: stationsById.B, to: { id: 'X', name: 'X', lines: [] }, minutes: 3 }, // 모르는 역은 id를 이름으로
  ]);
  assert.deepEqual(resolveSteps(undefined, stationsById, new Set()), []);
});
