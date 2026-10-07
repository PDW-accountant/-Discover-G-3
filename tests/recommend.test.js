import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STD_WEIGHT, compareWithMidpoint, pickCandidates, rankStations } from '../src/js/lib/recommend.js';
import { travelTimes } from '../src/js/lib/transit.js';

// 실행: npm test

const S = (id, lat, lng) => ({ id, name: id, lines: ['1'], lat, lng });
const stationsById = {
  A: S('A', 37.50, 127.00), B: S('B', 37.50, 127.02), C: S('C', 37.50, 127.04),
  M: S('M', 37.50, 127.02), O1: S('O1', 37.50, 127.00), O2: S('O2', 37.50, 127.04),
};
const people = [{ participant_id: 'p1', origin_station_id: 'O1' }, { participant_id: 'p2', origin_station_id: 'O2' }];

test('FUNC-005: 목적의 후보 역 전체를 돌려주고, 같은 입력은 항상 같은 결과', () => {
  const candidatesByPurpose = { 회식: ['A', 'B', 'C', 'NOPE'] };
  const r = pickCandidates('회식', people, stationsById, candidatesByPurpose);
  assert.deepEqual(r.candidates.map((s) => s.id), ['A', 'B', 'C']); // 역 정보가 없는 id는 뺀다
  assert.deepEqual(pickCandidates('회식', people, stationsById, candidatesByPurpose), r);
  assert.deepEqual(pickCandidates('오락', people, stationsById, candidatesByPurpose), { candidates: [], midpoint: null });
});

test('FUNC-005: 중간 지점은 출발역 중심에 가장 가까운 후보, 거리가 같으면 역 id 순', () => {
  assert.equal(pickCandidates('회식', people, stationsById, { 회식: ['A', 'B', 'C'] }).midpoint.id, 'B');
  assert.equal(pickCandidates('회식', people, stationsById, { 회식: ['M', 'B'] }).midpoint.id, 'B'); // 같은 거리 → id 순
});

const time = (minutes, extra = {}) => ({ minutes, transfers: 0, steps: [], is_estimated: false, ...extra });

test('FUNC-007: 점수 = 평균 + 2 × 모집단 표준편차, 작은 순 (10/6 변경)', () => {
  assert.equal(STD_WEIGHT, 2);
  // A: 10·30 → 평균 20, 표준편차 10, 점수 40 / B: 20·22 → 평균 21, 표준편차 1, 점수 23
  const times = { p1: { A: time(10), B: time(20) }, p2: { A: time(30), B: time(22) } };
  const r = rankStations([stationsById.A, stationsById.B], times);
  assert.deepEqual(r.map((x) => [x.rank, x.station.id, x.avg_time, x.std_time, x.score, x.max_time]), [
    [1, 'B', 21, 1, 23, 22],
    [2, 'A', 20, 10, 40, 30],
  ]);
  assert.deepEqual(r[0].travel_times, { p1: time(20), p2: time(22) });
});

test('FUNC-007: 평균이 조금 길어도 시간 차이가 작은 역이 1위 (평균 + 표준편차였다면 반대)', () => {
  // A: 16·24 → 평균 20, 표준편차 4 → 20 + 8 = 28 (예전 식 24) / B: 21·25 → 평균 23, 표준편차 2 → 23 + 4 = 27 (예전 식 25)
  const times = { p1: { A: time(16), B: time(21) }, p2: { A: time(24), B: time(25) } };
  const r = rankStations([stationsById.A, stationsById.B], times);
  assert.deepEqual(r.map((x) => [x.station.id, x.score]), [['B', 27], ['A', 28]]);
});

test('FUNC-007: 동률이면 최장 시간 짧은 순, 그래도 같으면 역 id 순', () => {
  // 점수 같음(평균 2 + 2 × 1.414… = 4.828…): A = 1·1·4분(최장 4), B = 0·3·3분(최장 3) → 최장이 짧은 B가 먼저
  const sameScore = {
    p1: { A: time(1), B: time(0) }, p2: { A: time(1), B: time(3) }, p3: { A: time(4), B: time(3) },
  };
  const r = rankStations([stationsById.A, stationsById.B], sameScore);
  assert.ok(Math.abs(r[0].score - r[1].score) < 1e-9);
  assert.deepEqual(r.map((x) => x.station.id), ['B', 'A']);
  // 점수·최장이 모두 같으면 역 id 순
  const tie = { p1: { C: time(20), B: time(20), A: time(20) }, p2: { C: time(20), B: time(20), A: time(20) } };
  assert.deepEqual(rankStations([stationsById.C, stationsById.B, stationsById.A], tie).map((x) => x.station.id), ['A', 'B', 'C']);
});

test('FUNC-007: 일부 시간이 예상 시간이면 결과에 예상 표시', () => {
  const times = { p1: { A: time(10, { is_estimated: true }) }, p2: { A: time(12) } };
  assert.equal(rankStations([stationsById.A], times)[0].is_estimated, true);
});

test('FUNC-007: 모든 참여자의 출발역이 후보 역과 같으면 전원 0분', () => {
  const r = rankStations([stationsById.A], { p1: { A: time(0) }, p2: { A: time(0) } });
  assert.equal(r[0].score, 0);
  assert.equal(r[0].max_time, 0);
});

// 시연 시나리오의 기대값은 손으로 계산해 scripts/input/sheet-demo.csv 에 적는다. (10/6 점수 = 평균 + 2 × 표준편차로 다시 계산)
//   종로3가 회식: 감이(연신내) 20 · 택이(청량리) 14 · 딜이(마포) 14 · 길이(압구정) 15분, 모두 환승 없음
//   평균 63 ÷ 4 = 15.75, 표준편차 √((4.25² + 1.75² + 1.75² + 0.75²) ÷ 4) = √(24.75 ÷ 4) = 2.487 → 점수 15.75 + 4.975 = 20.72
//   2위 시청 24.50. 중간 지점(출발역 중심에 가장 가까운 후보) 을지로3가 평균 19.25 → 19.25 − 15.75 = 3.5 → 4분 단축
//   강남 회의: 감이(판교) 17 · 택이(사당) 12 · 딜이(잠실) 14분 → 평균 14.33, 표준편차 √(12.67 ÷ 3) = 2.055 → 14.33 + 4.11 = 18.44
//     (2위 역삼 29.59, 중간 지점 역삼 17.33 → 3분 단축)
//   디지털미디어시티 오락(10/6까지 '홍대입구 오락'): 감이(김포공항) 14 · 택이(일산) 30 · 딜이(신도림) 24 · 길이(공덕) 10 · 톡이(신촌) 20분
//     → 평균 98 ÷ 5 = 19.6, 표준편차 √(251.2 ÷ 5) = 7.088 → 19.6 + 14.18 = 33.78
//     (2위 서울 34.97, 3위 홍대입구 37.31: 평균 15.6으로 가장 짧지만 표준편차 10.86. 중간 지점이 1위와 같아 0분)
test('FUNC-007: 시연 시나리오(data/demo.json expected)의 1위·점수·단축 분이 계산 결과와 같다', () => {
  const read = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
  const [demo, graph, stations, candidatesByPurpose] = ['demo', 'transit-graph', 'stations', 'candidates'].map(read);
  const byId = Object.fromEntries(stations.map((s) => [s.id, s]));
  assert.ok(demo.scenarios.length >= 1);
  for (const sc of demo.scenarios) {
    const { candidates, midpoint } = pickCandidates(sc.purpose, sc.participants, byId, candidatesByPurpose);
    const results = rankStations(candidates, travelTimes(graph, sc.participants, candidates, byId));
    assert.equal(results[0].station.id, sc.expected.station_id, `${sc.name}: 1위 ${results[0].station.name}`);
    assert.ok(Math.abs(results[0].score - sc.expected.score) < 0.005, `${sc.name}: 점수 ${results[0].score}`);
    assert.equal(compareWithMidpoint(results, midpoint).saved_minutes, sc.expected.saved_minutes, sc.name);
  }
});

test('FUNC-008: 단축 분 = round(중간 지점 평균 − 1위 평균), 0 이하면 0', () => {
  const times = { p1: { A: time(10), B: time(20) }, p2: { A: time(30), B: time(22) } };
  const results = rankStations([stationsById.A, stationsById.B], times); // 1위 B(평균 21), A(평균 20)
  assert.equal(compareWithMidpoint(results, stationsById.A).saved_minutes, 0); // 20 − 21 < 0
  assert.equal(compareWithMidpoint(results, stationsById.B).saved_minutes, 0); // 1위와 같음
  const times2 = { p1: { A: time(30), B: time(20) }, p2: { A: time(31), B: time(22) } };
  const results2 = rankStations([stationsById.A, stationsById.B], times2);
  assert.equal(compareWithMidpoint(results2, stationsById.A).saved_minutes, 10); // 30.5 − 21 = 9.5 → 10
  assert.equal(compareWithMidpoint(results2, null), null);
});
