import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { loadData } from '../src/js/lib/data.js';
import { arrivalClock, compareKind, computeResult, placeMeta, routeCardInfo, roundUpTo5 } from '../src/js/screens/result.js';

// 실행: npm test

// 문구(data/copy.json)를 화면처럼 loadData()로 불러 둔다
before(async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => ({ json: async () => JSON.parse(await readFile(new URL(`../${url}`, import.meta.url), 'utf8')) });
  try { await loadData(); } finally { globalThis.fetch = original; }
});

const read = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
const data = { stations: read('stations'), transitGraph: read('transit-graph'), candidates: read('candidates'), places: read('places') };
const idOf = (name) => data.stations.find((s) => s.name === name).id;
const participants = [
  { participant_id: 'p_a', nickname: '감자', origin_station_id: idOf('연신내') },
  { participant_id: 'p_b', nickname: '2번', origin_station_id: idOf('잠실') },
  { participant_id: 'p_c', nickname: '대원', origin_station_id: idOf('사당') },
];

test("#86: 장소 카드 둘째 줄 — 추천 이유 뒤에 '역에서 도보 n분', 도보 값이 없으면 생략", () => {
  assert.equal(placeMeta({ category: '', reason: '역 바로 앞, 저렴함', walk_minutes: 6 }), '역 바로 앞, 저렴함 · 역에서 도보 6분');
  assert.equal(placeMeta({ category: '보드게임카페', reason: '역 바로 앞', walk_minutes: null }), '보드게임카페 · 역 바로 앞');
  assert.equal(placeMeta({ reason: '역 바로 앞' }), '역 바로 앞');
});

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

test("FUNC-008: 비교 문구 — 단축 분이 있으면 '덜 걸려요', 중간 지점이 곧 1위면 '이미 가장 공평', 둘 다 아니면 숨김", () => {
  const top = { id: 'S1', name: '을지로3가' };
  assert.equal(compareKind({ midpoint_station: { id: 'S2' }, saved_minutes: 4 }, top), 'compare');
  assert.equal(compareKind({ midpoint_station: { id: 'S1' }, saved_minutes: 0 }, top), 'compareSame');
  assert.equal(compareKind({ midpoint_station: { id: 'S2' }, saved_minutes: 0 }, top), null); // 연신내·잠실·사당 회식: 1위 을지로3가, 중간 지점 삼각지, 차이 0분
  assert.equal(compareKind(null, top), null);
});

test('FUNC-008: 실제 데이터 — 연신내·잠실·사당 회식은 중간 지점(삼각지)과 1위(을지로3가)가 다른데 단축 분이 0이라 문구를 숨긴다', () => {
  const r = computeResult(data, { purpose: '회식' }, participants);
  assert.equal(r.top.station.name, '을지로3가');
  assert.equal(r.comparison.midpoint_station.name, '삼각지');
  assert.equal(r.comparison.saved_minutes, 0);
  assert.equal(compareKind(r.comparison, r.top.station), null);
});

test("FUNC-009: 역 데이터에 없는 출발역이 섞이면 'NaN분' 대신 failed", () => {
  const stale = [...participants.slice(0, 2), { participant_id: 'p_old', nickname: '옛값', origin_station_id: 'S-SAMPLE-1' }];
  assert.deepEqual(computeResult(data, { purpose: '회식' }, stale), { error: 'failed' });
});

test('FUNC-005: 후보 역이 없는 목적이면 noCandidates', () => {
  assert.deepEqual(computeResult({ ...data, candidates: {} }, { purpose: '회식' }, participants), { error: 'noCandidates' });
});

test('#53: 경로 카드 정보는 1위 결과의 이동시간을 그대로 쓴다 (분·환승·구간, 다시 계산하지 않음)', () => {
  const r = computeResult(data, { purpose: '회식' }, participants);
  for (const p of participants) {
    const time = r.top.travel_times[p.participant_id];
    const info = routeCardInfo(p, time, r.stationsById, r.top.station, r.expressLines);
    assert.equal(info.minutes, time.minutes);
    assert.equal(info.to.id, r.top.station.id);
    assert.equal(info.from.id, p.origin_station_id);
    assert.equal(info.steps.length, time.steps.length);
    assert.equal(info.has_detail, info.steps.length > 0);
    if (info.steps.length) {
      assert.equal(info.steps[0].from.id, p.origin_station_id);                 // 출발역에서 시작해
      assert.equal(info.steps[info.steps.length - 1].to.id, r.top.station.id);   // 만남 역에서 끝난다
    }
  }
});

test('#53: 환승이 있는 사람은 구간이 2개 이상이고 환승 횟수가 그대로 나온다', () => {
  const r = computeResult(data, { purpose: '회식' }, participants);
  const transferred = participants.map((p) => r.top.travel_times[p.participant_id]).find((time) => time.transfers > 0);
  if (!transferred) return; // 이번 데이터에 환승하는 사람이 없으면 건너뜀
  assert.ok(transferred.steps.length >= 2);
});

test('#53: 만남 역에서 출발하는 사람은 0분·구간 없음·세부 경로 없음', () => {
  const r = computeResult(data, { purpose: '회식' }, participants);
  const here = { participant_id: 'p_here', origin_station_id: r.top.station.id };
  const info = routeCardInfo(here, { minutes: 0, transfers: 0, steps: [], is_estimated: false }, r.stationsById, r.top.station);
  assert.equal(info.same_station, true);
  assert.equal(info.minutes, 0);
  assert.equal(info.has_detail, false);
});

test('#53: 예상 시간인 사람은 환승을 모름(null)·세부 경로 없음', () => {
  const r = computeResult(data, { purpose: '회식' }, participants);
  const info = routeCardInfo(participants[0], { minutes: 40, transfers: 0, steps: [], is_estimated: true }, r.stationsById, r.top.station);
  assert.equal(info.is_estimated, true);
  assert.equal(info.transfers, null);
  assert.equal(info.has_detail, false);
});

test('#53: 약속 시각은 HH:MM (만남 역 출발자는 이 시각 정각에 출발)', () => {
  assert.equal(arrivalClock(new Date(2026, 9, 8, 19, 0).toISOString()), '19:00');
  assert.equal(arrivalClock(new Date(2026, 9, 8, 9, 5)), '09:05');
  assert.equal(arrivalClock('잘못된 값'), '');
});

// ---------- #88 '기타': 장소 추천 없이 역만 ----------

test("#88: 목적 '기타'는 세 목적 후보의 합집합에서 1위를 고르고, 장소는 빈 배열", () => {
  const r = computeResult(data, { purpose: '기타' }, participants);
  assert.equal(r.error, undefined);
  const union = new Set([...data.candidates.회식, ...data.candidates.회의, ...data.candidates.오락]);
  assert.ok(union.has(r.top.station.id));
  assert.deepEqual(r.places, []); // 기타 장소 데이터는 없다 → 화면은 목록 대신 안내 한 줄
  assert.equal(r.top.rank, 1);
  for (const p of participants) assert.ok(Number.isInteger(r.top.travel_times[p.participant_id].minutes));
  // 같은 출발역이면 기타 1위의 점수는 어느 단일 목적 1위보다 나쁘지 않다(후보가 더 많으므로)
  const best = Math.min(...['회식', '회의', '오락'].map((purpose) => computeResult(data, { purpose }, participants).top.score));
  assert.ok(r.top.score <= best + 1e-9);
});

test("#88: 기타 결과도 확정 정보로 만들 수 있다(장소 없이)", async () => {
  const { createConfirmation } = await import('../src/js/lib/share-link.js');
  const r = computeResult(data, { purpose: '기타' }, participants);
  const c = createConfirmation({ purpose: '기타', arrival_time: new Date(2026, 9, 8, 19, 0).toISOString() }, r.top, null, participants);
  assert.equal(c.p, '기타');
  assert.equal(c.s, r.top.station.id);
  assert.equal('pl' in c, false);
  assert.deepEqual(c.people.map((p) => p.n), participants.map((p) => p.nickname));
});

test("#88: 기존 목적(회식·회의·오락)은 바뀐 것이 없다 — 장소 최대 3곳, 후보 수 그대로", () => {
  for (const [purpose, count] of [['회식', 23], ['회의', 16], ['오락', 16]]) {
    const r = computeResult(data, { purpose }, participants);
    assert.equal(data.candidates[purpose].length, count, purpose);
    assert.ok(r.places.length >= 1 && r.places.length <= 3, purpose);
    assert.ok(r.places.every((p) => p.purpose === purpose && p.station_id === r.top.station.id), purpose);
  }
});
