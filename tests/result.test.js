import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeResult, roundUpTo5 } from '../src/js/screens/result.js';

// 실행: npm test

const read = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
const data = { stations: read('stations'), transitGraph: read('transit-graph'), candidates: read('candidates'), places: read('places') };
const idOf = (name) => data.stations.find((s) => s.name === name).id;
const participants = [
  { participant_id: 'p_a', nickname: '감자', origin_station_id: idOf('연신내') },
  { participant_id: 'p_b', nickname: '2번', origin_station_id: idOf('잠실') },
  { participant_id: 'p_c', nickname: '대원', origin_station_id: idOf('사당') },
];

test("FUNC-009: '모두 N분 안에'는 최장 시간을 5분 단위로 올린다", () => {
  assert.equal(roundUpTo5(31), 35);
  assert.equal(roundUpTo5(35), 35);
  assert.equal(roundUpTo5(0), 0);
});

test('FUNC-009: 실제 데이터로 1위 역·참여자별 시간이 1초 안에 나온다', () => {
  const start = performance.now();
  const r = computeResult(data, { purpose: '회식' }, participants);
  assert.ok(performance.now() - start < 1000);
  assert.ok(data.candidates['회식'].includes(r.top.station.id)); // 1위는 회식 후보 중 하나
  assert.equal(r.top.rank, 1);
  assert.deepEqual(Object.keys(r.top.travel_times), ['p_a', 'p_b', 'p_c']);
  for (const time of Object.values(r.top.travel_times)) assert.ok(Number.isFinite(time.minutes));
  assert.ok(Array.isArray(r.places) && r.places.length <= 3);
  assert.deepEqual(computeResult(data, { purpose: '회식' }, participants).top.station.id, r.top.station.id); // 항상 같은 결과
});

test('FUNC-009: 1위 결과로 확정 정보를 만들 수 있는 형태다 (travel_times[참여자 id].minutes)', () => {
  const { top } = computeResult(data, { purpose: '회의' }, participants);
  for (const p of participants) assert.ok(Number.isInteger(top.travel_times[p.participant_id].minutes));
  assert.ok(top.station.id && top.station.name);
});

test('FUNC-005: 후보 역이 없는 목적이면 noCandidates', () => {
  assert.deepEqual(computeResult({ ...data, candidates: {} }, { purpose: '회식' }, participants), { error: 'noCandidates' });
});
