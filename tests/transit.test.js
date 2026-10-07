import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { travelTime, travelTimes } from '../src/js/lib/transit.js';
import { DWELL_MINUTES, WAIT_MINUTES } from '../src/js/config.js';

// 실행: npm test   (FUNC-006 #25 지하철 이동시간 계산)

// ---------- 작은 가짜 그래프 ----------
//   A ─3─ B ─3─ C ─2─ K   계통 r1 (1호선 일반)
//   A ━━━━2━━━━ C         계통 r1x (1호선 급행, B에 서지 않음). A·C에서 일반↔급행 갈아타기(swap)
//         B ─4─ D         계통 r2 (2호선). B에서 r1↔r2 환승 도보 1분
//   E ─1─ G               계통 r3 (다른 곳과 이어지지 않음)
//   F                     그래프에 없는 역
const station = (id, lat, lng) => ({ id, name: id, lines: [], lat, lng });
const S = {
  A: station('A', 37.50, 127.00), B: station('B', 37.50, 127.01), C: station('C', 37.50, 127.02), K: station('K', 37.50, 127.03),
  D: station('D', 37.51, 127.01), E: station('E', 37.60, 127.00), G: station('G', 37.60, 127.01), F: station('F', 37.50, 127.05),
};
const both = (from, to, minutes, type) => [{ from, to, minutes, type }, { from: to, to: from, minutes, type }];
const fake = {
  routes: [
    { id: 'r1', line: '1', express: false }, { id: 'r1x', line: '1', express: true },
    { id: 'r2', line: '2', express: false }, { id: 'r3', line: '3', express: false },
  ],
  edges: [
    ...both('A:r1', 'B:r1', 3, 'ride'), ...both('B:r1', 'C:r1', 3, 'ride'), ...both('C:r1', 'K:r1', 2, 'ride'),
    ...both('A:r1x', 'C:r1x', 2, 'ride'),
    ...both('A:r1', 'A:r1x', 0, 'swap'), ...both('C:r1', 'C:r1x', 0, 'swap'),
    ...both('B:r2', 'D:r2', 4, 'ride'), ...both('B:r1', 'B:r2', 1, 'transfer'),
    ...both('E:r3', 'G:r3', 1, 'ride'),
  ],
};
// via: 그 구간에서 열차가 서는 역(승차역~하차역, 지도 경로선용 #16). 한 정거장이면 [승차역, 하차역]
const step = (line, express, from, to, minutes, change, via = [from, to]) => ({ line, express, from, to, minutes, via, ...(change ? { change } : {}) });

test('FUNC-006: 환승하면 도보시간 + 대기, 환승 횟수 1, 구간이 호선별로 나뉜다', () => {
  // 3(A→B) + 1+3(환승) + 4(B→D) + 처음 대기 3 = 14 (중간에 서는 역이 없어 정차 시간 없음)
  // 두 번째 구간에 그 앞 갈아타기(도보 1분 + 대기 3분)를 담는다 (#53 세부 경로 표의 환승 줄)
  assert.deepEqual(travelTime(fake, S.A, S.D), {
    minutes: 14, transfers: 1, is_estimated: false,
    steps: [step('1', false, 'A', 'B', 3), step('2', false, 'B', 'D', 4, { type: 'transfer', walk: 1, wait: 3 })],
  });
});

test('FUNC-006: 출발역의 모든 계통에서 시작한다 (A에서 바로 급행을 타면 5분)', () => {
  // 일반: 6 + 3 = 9분, 급행: 2 + 3 = 5분
  assert.deepEqual(travelTime(fake, S.A, S.C), { minutes: 5, transfers: 0, is_estimated: false, steps: [step('1', true, 'A', 'C', 2)] });
});

test('FUNC-006: 급행↔일반 갈아타기(swap)는 대기만 더하고 환승 횟수에 세지 않는다, 구간은 급행/일반으로 나뉜다', () => {
  // 일반만: 8 + 3 = 11분, 급행 A→C 2 + 갈아타기 대기 3 + 일반 C→K 2 + 처음 대기 3 = 10분
  assert.deepEqual(travelTime(fake, S.A, S.K), {
    minutes: 10, transfers: 0, is_estimated: false,
    steps: [step('1', true, 'A', 'C', 2), step('1', false, 'C', 'K', 2, { type: 'swap', walk: 0, wait: 3 })],
  });
});

test('FUNC-006: 출발역과 도착역이 같으면 0분, 환승 0', () => {
  assert.deepEqual(travelTime(fake, S.A, S.A), { minutes: 0, transfers: 0, steps: [], is_estimated: false });
});

test('FUNC-006: 도달할 수 없거나 그래프에 없는 역, 그래프가 없으면 직선거리 예상 시간 (is_estimated=true)', () => {
  for (const [graph, from, to] of [[fake, S.A, S.E], [fake, S.A, S.F], [fake, S.F, S.A], [null, S.A, S.D]]) {
    const r = travelTime(graph, from, to);
    assert.equal(r.is_estimated, true);
    assert.equal(r.transfers, 0);
    assert.deepEqual(r.steps, []);
    assert.ok(r.minutes > 0);
  }
});

test('FUNC-006: 참여자 × 후보 역을 한 번에 계산한다 (후보는 역 또는 역 id)', () => {
  const participants = [{ participant_id: 'p1', origin_station_id: 'A' }, { participant_id: 'p2', origin_station_id: 'D' }];
  const times = travelTimes(fake, participants, [S.C, 'K'], S);
  assert.deepEqual(Object.keys(times), ['p1', 'p2']);
  assert.deepEqual(Object.keys(times.p1), ['C', 'K']);
  assert.deepEqual(times.p1.K, travelTime(fake, S.A, S.K));
  assert.deepEqual(times.p2.C, travelTime(fake, S.D, S.C));
});

test('FUNC-006: 대기 상수는 config.js의 WAIT_MINUTES (기본 3분)', () => {
  assert.equal(WAIT_MINUTES, 3);
});

test('#25: 정차 시간은 config.js의 DWELL_MINUTES (30초)', () => {
  assert.equal(DWELL_MINUTES, 0.5);
});

test('#25: 열차가 중간에 서는 역마다 정차 시간이 붙고, 타는 역·내리는 역에는 붙지 않는다', () => {
  // B → K: 일반 B─3─C─2─K, 중간에 서는 역 C 1곳 → 5 + 0.5 + 처음 대기 3 = 8.5 → 9분 (정차 없으면 8분)
  assert.deepEqual(travelTime(fake, S.B, S.K), { minutes: 9, transfers: 0, is_estimated: false, steps: [step('1', false, 'B', 'K', 6, undefined, ['B', 'C', 'K'])] }); // 중간에 C를 지난다
  // A → B: 한 정거장이면 중간 역이 없어 그대로 3 + 3 = 6분
  assert.equal(travelTime(fake, S.A, S.B).minutes, 6);
});

// ---------- 실제 데이터 (data/transit-graph.json) ----------

const graph = JSON.parse(readFileSync(new URL('../data/transit-graph.json', import.meta.url), 'utf8'));
const stations = JSON.parse(readFileSync(new URL('../data/stations.json', import.meta.url), 'utf8'));
const stationsById = Object.fromEntries(stations.map((s) => [s.id, s]));
const byName = (name) => stations.find((s) => s.name === name);
const trip = (a, b) => travelTime(graph, byName(a), byName(b));

// 기준: 카카오맵 대중교통 길찾기 지하철 경로 (2026-10-04 확인)
test('FUNC-006: 연신내 → 종로3가가 지도 앱 시간(17분)과 ±5분 안', () => {
  const r = trip('연신내', '종로3가');
  assert.ok(Math.abs(r.minutes - 17) <= 5, `${r.minutes}분`);
  assert.equal(r.transfers, 0);
  assert.equal(r.is_estimated, false);
});

test('#25: 역이 많은 긴 구간도 지도 앱 시간과 ±5분 안 (정차 시간 반영 전에는 홍대입구 → 잠실이 31분으로 10분 이상 짧았다)', () => {
  const hongdae = trip('홍대입구', '잠실');
  assert.ok(Math.abs(hongdae.minutes - 42) <= 5, `홍대입구 → 잠실 ${hongdae.minutes}분`); // 2호선 약 20개 역
  const nowon = trip('노원', '사당');
  assert.ok(Math.abs(nowon.minutes - 50) <= 5, `노원 → 사당 ${nowon.minutes}분`);     // 4호선 직통
});

test('FUNC-006: 잠실 → 강남이 지도 앱 시간(12분)과 ±5분 안', () => {
  const r = trip('잠실', '강남');
  assert.ok(Math.abs(r.minutes - 12) <= 5, `${r.minutes}분`);
  assert.equal(r.transfers, 0);
});

test('FUNC-006: 9호선 김포공항 → 고속터미널은 급행 구간으로 나온다', () => {
  const r = trip('김포공항', '고속터미널');
  assert.equal(r.transfers, 0);
  assert.deepEqual(r.steps.map((s) => [s.line, s.express]), [['9', true]]);
});

test('FUNC-006: 모든 역이 그래프로 계산된다 (직선거리 예상 시간으로 대체되는 역이 없다)', () => {
  const from = byName('서울');
  assert.deepEqual(stations.filter((s) => s !== from && travelTime(graph, from, s).is_estimated).map((s) => s.name), []);
});

test('FUNC-006: 임진강 → 서울은 문산에서 셔틀을 갈아탄다, 동탄은 GTX-A로 이어진다', () => {
  const imjin = trip('임진강', '서울');
  const [shuttle, main] = imjin.steps.map((s) => [s.line, stationsById[s.from].name, stationsById[s.to].name]);
  assert.deepEqual(shuttle, ['경의중앙', '임진강', '문산']);
  assert.deepEqual(main.slice(0, 2), ['경의중앙', '문산']); // 문산에서 본선 열차로 갈아탄다
  assert.ok(imjin.transfers >= 1);
  assert.deepEqual(trip('동탄', '수서').steps.map((s) => s.line), ['GTX-A']);
});

test('FUNC-006: 9명 × 후보 10곳 계산이 1초 안에 끝난다', () => {
  const ids = stations.map((s) => s.id);
  const participants = Array.from({ length: 9 }, (_, i) => ({ participant_id: `p${i}`, origin_station_id: ids[(i * 71) % ids.length] }));
  const candidates = ids.slice(100, 110);
  const started = performance.now();
  const times = travelTimes(graph, participants, candidates, stationsById);
  assert.ok(performance.now() - started < 1000);
  assert.equal(Object.values(times).flatMap(Object.values).length, 90);
});

test('FUNC-006: 같은 입력은 항상 같은 결과다', () => {
  const participants = [{ participant_id: 'a', origin_station_id: byName('홍대입구').id }, { participant_id: 'b', origin_station_id: byName('수원').id }];
  const candidates = ['강남', '서울', '판교', '노량진'].map(byName);
  assert.deepEqual(travelTimes(graph, participants, candidates, stationsById), travelTimes(graph, participants, candidates, stationsById));
});

test('#16: 구간마다 열차가 서는 역 목록(via)을 돌려준다 — 급행은 건너뛰는 역이 없다', () => {
  const r = trip('김포공항', '고속터미널'); // 9호선 급행
  const names = r.steps[0].via.map((id) => stationsById[id].name);
  assert.equal(names[0], '김포공항');
  assert.equal(names[names.length - 1], '고속터미널');
  assert.ok(!names.includes('공항시장'), '급행은 공항시장에 서지 않는다');
  const local = trip('홍대입구', '잠실').steps[0].via;
  assert.ok(local.length > 10, `2호선 홍대입구→잠실은 서는 역이 많다 (${local.length})`);
});

test('#94: 9호선 급행으로 와서 신논현에서 신분당선으로 갈아타면 환승 한 번 = 도보 + 대기 3분 (급행→일반 갈아타기를 거치지 않는다)', () => {
  for (const [from, to] of [['김포공항', '강남'], ['가양', '강남'], ['정자', '여의도']]) {
    const r = trip(from, to);
    assert.equal(r.transfers, 1, `${from} → ${to}`);
    assert.equal(r.steps.length, 2, `${from} → ${to}`);
    const change = r.steps[1].change;
    assert.equal(change.type, 'transfer');
    assert.equal(change.wait, WAIT_MINUTES, `${from} → ${to} 대기 ${change.wait}분`);
    assert.ok(r.steps.some((s) => s.line === '9' && s.express), `${from} → ${to}는 9호선 급행을 탄다`);
  }
  // 10/7 전에는 46분(급행→일반 갈아타기 대기 3분이 더 붙음). 카카오맵 대중교통 약 40분대 초반
  assert.ok(trip('김포공항', '강남').minutes <= 43, `${trip('김포공항', '강남').minutes}분`);
});
