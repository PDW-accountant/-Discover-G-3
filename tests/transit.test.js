import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { travelTime, travelTimes, WAIT_MINUTES } from '../src/js/lib/transit.js';

// 실행: npm test

const graph = JSON.parse(readFileSync(new URL('../data/transit-graph.json', import.meta.url), 'utf8'));
const stations = JSON.parse(readFileSync(new URL('../data/stations.json', import.meta.url), 'utf8'));
const stationsById = Object.fromEntries(stations.map((s) => [s.id, s]));
const byName = (name) => stations.find((s) => s.name === name);

// 작은 가짜 그래프: A─(5)─B─(5)─C (L1),  B 환승(2분) L2: B─(4)─D,  A는 L3에도 있음: A─(30)─C (L3)
// 급행: C─(1)─E (L1x, L1 급행), C에서 L1 ↔ L1x 갈아타기(swap)
const both = (from, to, minutes, type = 'ride') => [{ from, to, minutes, type }, { from: to, to: from, minutes, type }];
const fake = {
  routes: [
    { id: 'L1', line: '1', express: false }, { id: 'L1x', line: '1', express: true },
    { id: 'L2', line: '2', express: false }, { id: 'L3', line: '3', express: false },
  ],
  edges: [
    ...both('A:L1', 'B:L1', 5), ...both('B:L1', 'C:L1', 5),
    ...both('B:L1', 'B:L2', 2, 'transfer'), ...both('B:L2', 'D:L2', 4),
    ...both('A:L3', 'C:L3', 30), ...both('A:L1', 'A:L3', 1, 'transfer'), ...both('C:L1', 'C:L3', 1, 'transfer'),
    ...both('C:L1', 'C:L1x', 0, 'swap'), ...both('C:L1x', 'E:L1x', 1),
  ],
};
const at = (id, lat = 37.5, lng = 127) => ({ id, lat, lng });

test('FUNC-006: 같은 노선이면 운행시간 + 처음 대기 3분, 환승 0', () => {
  const r = travelTime(fake, at('A'), at('C'));
  assert.equal(r.minutes, 10 + WAIT_MINUTES);
  assert.equal(r.transfers, 0);
  assert.deepEqual(r.steps, [{ route: 'L1', line: '1', express: false, from: 'A', to: 'C', minutes: 10 }]);
  assert.equal(r.is_estimated, false);
});

test('FUNC-006: 환승하면 환승 도보시간 + 대기 3분이 더해지고 환승 1', () => {
  const r = travelTime(fake, at('A'), at('D'));
  assert.equal(r.minutes, 5 + 2 + WAIT_MINUTES + 4 + WAIT_MINUTES);
  assert.equal(r.transfers, 1);
  assert.deepEqual(r.steps.map((s) => [s.line, s.from, s.to, s.minutes]), [['1', 'A', 'B', 5], ['2', 'B', 'D', 4]]);
});

test('FUNC-006: 급행↔일반 갈아타기는 대기는 더하지만 환승 횟수에 세지 않고, 급행 구간을 표시한다', () => {
  const r = travelTime(fake, at('A'), at('E'));
  assert.equal(r.minutes, 10 + WAIT_MINUTES + 1 + WAIT_MINUTES);
  assert.equal(r.transfers, 0);
  assert.deepEqual(r.steps.map((s) => [s.express, s.from, s.to]), [[false, 'A', 'C'], [true, 'C', 'E']]);
});

test('FUNC-006: 출발역이 여러 호선이면 모든 호선 노드에서 시작한다', () => {
  // C는 L1·L3 두 노드. C → A는 L1(10분)이 L3(30분)보다 빠르다
  assert.equal(travelTime(fake, at('C'), at('A')).minutes, 10 + WAIT_MINUTES);
});

test('FUNC-006: 출발역과 도착역이 같으면 0분, 환승 0', () => {
  assert.deepEqual(travelTime(fake, at('B'), at('B')), { minutes: 0, transfers: 0, steps: [], is_estimated: false });
});

test('FUNC-006: 그래프에 없는 역이면 직선거리 예상 시간으로 대체되고 is_estimated=true', () => {
  const r = travelTime(fake, at('A', 37.5, 127), at('Z', 37.51, 127));
  assert.equal(r.is_estimated, true);
  assert.equal(r.transfers, 0);
  assert.ok(r.minutes > 0);
  assert.equal(travelTime(null, at('A'), at('B', 37.51)).is_estimated, true); // 그래프 읽기 실패
});

test('FUNC-006: 도달할 수 없으면 직선거리 예상 시간으로 대체', () => {
  const island = { routes: [], edges: [...fake.edges, ...both('X:L9', 'Y:L9', 3)] };
  assert.equal(travelTime(island, at('A'), at('X', 37.52)).is_estimated, true);
});

test('FUNC-006: 같은 입력은 항상 같은 결과', () => {
  assert.deepEqual(travelTime(fake, at('A'), at('D')), travelTime(fake, at('A'), at('D')));
});

test('FUNC-006: 연신내 → 종로3가가 지도 앱 시간과 ±5분 안', () => {
  const r = travelTime(graph, byName('연신내'), byName('종로3가'));
  assert.equal(r.is_estimated, false);
  assert.ok(Math.abs(r.minutes - 17) <= 5, `${r.minutes}분`); // 지도 앱 약 17분 (3호선 직통)
  assert.equal(r.transfers, 0);
});

test('FUNC-006: 잠실 → 강남이 지도 앱 시간과 ±5분 안', () => {
  const r = travelTime(graph, byName('잠실'), byName('강남'));
  assert.equal(r.is_estimated, false);
  assert.ok(Math.abs(r.minutes - 14) <= 5, `${r.minutes}분`); // 지도 앱 약 14분 (2호선 직통)
});

test('FUNC-006: 9명 × 후보 전체 계산이 1초 안에 끝나고 참여자 id → 역 id 형태로 돌려준다', () => {
  const candidates = stations.filter((_, i) => i % 60 === 0).slice(0, 10);
  const participants = stations.filter((_, i) => i % 70 === 3).slice(0, 9)
    .map((s, i) => ({ participant_id: `p${i}`, origin_station_id: s.id }));
  const start = performance.now();
  const times = travelTimes(graph, participants, candidates, stationsById);
  assert.ok(performance.now() - start < 1000);
  assert.deepEqual(Object.keys(times), participants.map((p) => p.participant_id));
  assert.deepEqual(Object.keys(times.p0), candidates.map((s) => s.id));
  assert.equal(times.p0[candidates[0].id].minutes, travelTime(graph, stationsById[participants[0].origin_station_id], candidates[0]).minutes);
});
