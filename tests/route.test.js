import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { loadData } from '../src/js/lib/data.js';
import { buildRouteInfo, departText, kakaoMapLink, meetingPlace, myNickname, walkText } from '../src/js/screens/route.js';

// 실행: npm test

// 문구(data/copy.json)를 화면처럼 loadData()로 불러 둔다
before(async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => ({ json: async () => JSON.parse(await readFile(new URL(`../${url}`, import.meta.url), 'utf8')) });
  try { await loadData(); } finally { globalThis.fetch = original; }
});

const st = (id, name, lat, lng) => ({ id, name, lines: ['2'], lat, lng });
const stationsById = {
  S1: st('S1', '잠실', 37.5133, 127.1001),
  S2: st('S2', '선릉', 37.5045, 127.0490),
  S3: st('S3', '강남', 37.4979, 127.0276),
};
const confirmation = {
  v: 1, p: '회식', a: '2026-10-05T10:00:00.000Z', s: 'S3', pl: 'P1', e: '2026-11-04T10:00:00.000Z',
  people: [{ n: '희원', s: 'S1', m: 20 }, { n: '대원', s: 'S3', m: 0 }, { n: '지원', s: 'S2', m: 9 }],
};
const places = [{ place_id: 'P1', name: '고깃집', kakao_url: 'https://place.map.kakao.com/1' }];
const graphRoute = {
  minutes: 18, transfers: 0, is_estimated: false,
  steps: [{ line: '2', from: 'S1', to: 'S2', minutes: 10 }, { line: '2', from: 'S2', to: 'S3', minutes: 5 }],
};
const advice = { depart_at: new Date('2026-10-05T09:32:00.000Z'), summary: '2호선', is_past: false };
// 기준 시각: 약속(10/5 19:00) 전. 지정하지 않으면 테스트를 돌리는 날짜가 기준이 되어, 약속이 지난 뒤에는 출발 안내가 숨겨진다(#103)
const BEFORE_MEETING = new Date('2026-10-01T00:00:00.000Z');
const base = {
  stationsById, places, travel: () => graphRoute, advise: () => advice, link: (p) => p.kakao_url, now: BEFORE_MEETING,
};

test('FUNC-015: 그래프 계산 결과로 총 시간·환승·구간·출발 시각·만남 장소를 만든다', () => {
  const info = buildRouteInfo(confirmation, '희원', base);
  assert.equal(info.nickname, '희원');
  assert.equal(info.from, stationsById.S1);
  assert.equal(info.to, stationsById.S3);
  assert.equal(info.minutes, 18);
  assert.equal(info.transfers, 0);
  assert.equal(info.is_estimated, false);
  assert.deepEqual(info.steps.map((s) => [s.line, s.from.name, s.to.name, s.minutes]), [['2', '잠실', '선릉', 10], ['2', '선릉', '강남', 5]]);
  assert.equal(info.departure, advice);
  assert.deepEqual(info.place, { name: '고깃집', url: 'https://place.map.kakao.com/1' });
});

test('FUNC-015: 그래프·도착 역 정보와 권장 출발 시각 계산에 확정 정보 값을 넘긴다', () => {
  const calls = [];
  buildRouteInfo(confirmation, '희원', {
    ...base,
    graph: { edges: [] },
    travel: (graph, from, to) => { calls.push(['travel', graph, from.id, to.id]); return graphRoute; },
    advise: (arrival, minutes, steps) => { calls.push(['advise', arrival.toISOString(), minutes, steps.length]); return advice; },
  });
  assert.deepEqual(calls, [['travel', { edges: [] }, 'S1', 'S3'], ['advise', confirmation.a, 18, 2]]);
});

test("FUNC-015: 그래프가 없거나(계산 실패) 예상값이면 확정 때 저장된 분만 보여주고 '예상'", () => {
  const failed = buildRouteInfo(confirmation, '희원', { ...base, travel: () => { throw new Error('아직'); } });
  assert.equal(failed.minutes, 20);
  assert.equal(failed.is_estimated, true);
  assert.equal(failed.transfers, null);
  assert.deepEqual(failed.steps, []);
  const estimated = buildRouteInfo(confirmation, '희원', { ...base, travel: () => ({ ...graphRoute, minutes: 25, is_estimated: true }) });
  assert.equal(estimated.minutes, 20);
  assert.equal(estimated.is_estimated, true);
});

test("FUNC-015: 급행이 다니는 노선은 구간에 '급행'/'일반', 급행이 없는 노선은 표시하지 않는다", () => {
  const graph = {
    routes: [{ id: '9', line: '9', express: false }, { id: '9-express', line: '9', express: true }, { id: '2-main', line: '2', express: false }],
    edges: [],
  };
  const travel = () => ({
    ...graphRoute,
    steps: [
      { line: '9', express: true, from: 'S1', to: 'S2', minutes: 10 },
      { line: '9', express: false, from: 'S2', to: 'S3', minutes: 3 },
      { line: '2', express: false, from: 'S3', to: 'S1', minutes: 5 },
    ],
  });
  const info = buildRouteInfo(confirmation, '희원', { ...base, graph, travel });
  assert.deepEqual(info.steps.map((s) => [s.line, s.train]), [['9', 'express'], ['9', 'local'], ['2', null]]);
});

test("FUNC-015: 실제 그래프로 김포공항 → 고속터미널은 9호선 '급행' 구간", () => {
  const graph = JSON.parse(readFileSync(new URL('../data/transit-graph.json', import.meta.url), 'utf8'));
  const stations = JSON.parse(readFileSync(new URL('../data/stations.json', import.meta.url), 'utf8'));
  const id = (name) => stations.find((s) => s.name === name).id;
  const trip = { ...confirmation, s: id('고속터미널'), people: [{ n: '희원', s: id('김포공항'), m: 30 }] };
  const info = buildRouteInfo(trip, '희원', { stationsById: Object.fromEntries(stations.map((s) => [s.id, s])), graph, advise: () => advice });
  assert.equal(info.is_estimated, false);
  assert.deepEqual(info.steps.map((s) => [s.line, s.train, s.from.name, s.to.name]), [['9', 'express', '김포공항', '고속터미널']]);
});

test('FUNC-015: 화면 위쪽에 보일 만남 장소 — 확정 정보의 장소 id로 찾고, 없으면 null', () => {
  assert.deepEqual(meetingPlace(confirmation, places, '강남', (p) => p.kakao_url), { name: '고깃집', url: 'https://place.map.kakao.com/1' });
  assert.equal(meetingPlace({ ...confirmation, pl: 'NOPE' }, places), null);
  assert.equal(meetingPlace(confirmation, []), null);
});

test('FUNC-015: 다른 사람을 고르면 그 사람의 경로', () => {
  const info = buildRouteInfo(confirmation, '지원', { ...base, travel: (g, from) => ({ ...graphRoute, minutes: from.id === 'S2' ? 6 : 99, steps: [] }) });
  assert.equal(info.from.name, '선릉');
  assert.equal(info.minutes, 6);
});

test('FUNC-015: 출발역이 만남 역과 같으면 0분, 계산하지 않는다', () => {
  let called = false;
  const info = buildRouteInfo(confirmation, '대원', { ...base, travel: () => { called = true; return graphRoute; } });
  assert.equal(called, false);
  assert.equal(info.same_station, true);
  assert.equal(info.minutes, 0);
  assert.equal(info.is_estimated, false);
});

test('FUNC-015: 명단에 없는 닉네임이면 null', () => {
  assert.equal(buildRouteInfo(confirmation, '없음', base), null);
  assert.equal(buildRouteInfo(null, '희원', base), null);
});

test('FUNC-015: 권장 출발 시각 계산(#22) 전이면 departure는 null, 장소 데이터가 없으면 place는 null', () => {
  const info = buildRouteInfo(confirmation, '희원', { ...base, places: [], advise: () => { throw new Error('아직'); } });
  assert.equal(info.departure, null);
  assert.equal(info.place, null);
  assert.equal(info.minutes, 18);
});

test('#86: 확정 장소의 역 → 장소 도보 분을 경로 정보에 담고 권장 출발 시각 계산에 넘긴다', () => {
  const walking = [{ ...places[0], walk_minutes: 6 }];
  const calls = [];
  const info = buildRouteInfo(confirmation, '희원', { ...base, places: walking, advise: (...args) => { calls.push(args[4]); return advice; } });
  assert.equal(info.walk_minutes, 6);
  assert.deepEqual(calls, [6]);
});

test('#86: 도보 값이 없는 장소(또는 장소를 못 찾음)면 walk_minutes는 null, 지금처럼 역 도착 기준', () => {
  for (const options of [{ ...base }, { ...base, places: [{ ...places[0], walk_minutes: null }] }, { ...base, places: [] }]) {
    const calls = [];
    const info = buildRouteInfo(confirmation, '희원', { ...options, advise: (...args) => { calls.push(args[4]); return advice; } });
    assert.equal(info.walk_minutes, null);
    assert.deepEqual(calls, [null]);
  }
});

test('#86: 실제 계산 — 만남 역에서 출발해도 도보 값이 있으면 장소 도착 기준 출발 시각이 나온다', () => {
  const arrival = new Date(confirmation.a);
  const info = buildRouteInfo(confirmation, '대원', { stationsById, places: [{ ...places[0], walk_minutes: 6 }], now: new Date(2026, 0, 1) });
  assert.equal(info.same_station, true);
  assert.equal(arrival.getTime() - info.departure.depart_at.getTime(), (6 + 10) * 60000); // 도보 6분 + 여유 10분
});

test("#86: 출발 시각 문구 — 도보 값이 있으면 '(장소 도착 기준)', 없으면 '(역 도착 기준)'", () => {
  const departure = { depart_at: new Date(2026, 9, 5, 17, 20), is_past: false };
  assert.equal(departText({ walk_minutes: 6, departure }), '17:20쯤 출발하면 여유 있어요 (장소 도착 기준)');
  assert.equal(departText({ walk_minutes: null, departure }), '17:20쯤 출발하면 여유 있어요 (역 도착 기준)');
  assert.equal(departText({ walk_minutes: 6, departure: { ...departure, is_past: true } }), '지금 출발하세요 (장소 도착 기준)');
});

test("#86: 구간 목록 끝 줄 — '○○역에서 장소까지' (도보 값이 없으면 줄 없음)", () => {
  assert.equal(walkText({ to: stationsById.S3, place: { name: '고깃집' }, walk_minutes: 6 }), '강남역에서 고깃집까지');
  assert.equal(walkText({ to: stationsById.S3, place: { name: '고깃집' }, walk_minutes: null }), null);
});

test('FUNC-015: 역 데이터에 없는 역도 이름으로 보여준다', () => {
  const info = buildRouteInfo({ ...confirmation, people: [{ n: '희원', s: 'S9', m: 30 }] }, '희원', base);
  assert.equal(info.from.name, 'S9');
});

test('FUNC-015: 방 명단에서 이 기기의 닉네임을 찾는다 (pid, pid_2)', () => {
  const room = { participants: [{ participant_id: 'p_x', nickname: '대원' }, { participant_id: 'p_me_2', nickname: '희원' }] };
  assert.equal(myNickname(room, 'p_me'), '희원');
  assert.equal(myNickname(room, 'p_none'), null);
  assert.equal(myNickname(undefined, 'p_me'), null);
});

test("FUNC-015: '카카오맵에서 보기'는 좌표가 있으면 길찾기, 없으면 검색", () => {
  assert.equal(kakaoMapLink(stationsById.S3), `https://map.kakao.com/link/to/${encodeURIComponent('강남역')},37.4979,127.0276`);
  assert.equal(kakaoMapLink({ name: '강남' }), `https://map.kakao.com/link/search/${encodeURIComponent('강남역')}`);
});

// ---------- #103 지난 약속 ----------

test("#103: 약속 시각이 지난 뒤에 열면 출발 안내가 없다 (모든 칸에 '지금 출발하세요'가 뜨지 않게)", () => {
  for (const now of [new Date('2026-10-05T10:00:00.000Z'), new Date('2026-10-05T10:01:00.000Z'), new Date('2026-10-20T03:00:00.000Z')]) {
    for (const name of ['희원', '대원', '지원']) {
      const info = buildRouteInfo(confirmation, name, { ...base, advise: undefined, travel: undefined, now });
      assert.equal(info.departure, null, `${now.toISOString()} ${name}`);
    }
  }
});

test("#103: 약속 전이지만 권장 출발 시각이 지났으면 '지금 출발하세요'는 그대로 (약속 5분 전)", () => {
  const now = new Date('2026-10-05T09:55:00.000Z'); // 약속 19:00(한국) 5분 전
  const info = buildRouteInfo(confirmation, '희원', { stationsById, places, now });
  assert.ok(info.departure);
  assert.equal(info.departure.is_past, true);
  assert.equal(departText(info).startsWith('지금 출발하세요'), true);
});

test('#103: 약속 전 넉넉한 시각이면 평소처럼 권장 출발 시각', () => {
  const info = buildRouteInfo(confirmation, '희원', { stationsById, places, now: BEFORE_MEETING });
  assert.ok(info.departure);
  assert.equal(info.departure.is_past, false);
  assert.match(departText(info), /^\d{2}:\d{2}쯤 출발하면 여유 있어요/);
});
