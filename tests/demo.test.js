import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadScenario } from '../src/js/lib/demo.js';
import { computeResult } from '../src/js/screens/result.js';
import { CHARACTER_NAMES, characterSvg } from '../src/js/lib/characters.js';
import { DEMO_SCENARIO_COUNT, MAX_PARTICIPANTS, NICKNAME_MAX_LENGTH } from '../src/js/config.js';

// 실행: npm test   (FUNC-004 #5 예시로 해보기)

const read = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
const demo = read('demo');
const scenario = (arrival) => ({ scenarios: [{ id: 's1', purpose: '회식', arrival, participants: [{ participant_id: 'a', nickname: '감자', origin_station_id: 'S1' }] }] });

test('FUNC-004: 시나리오의 목적·참여자·출발역을 그대로 채운다', () => {
  const s = loadScenario(scenario('19:00'), 's1', new Date(2026, 9, 4, 12, 0));
  assert.equal(s.request.purpose, '회식');
  assert.deepEqual(s.participants, [{ participant_id: 'a', nickname: '감자', origin_station_id: 'S1' }]);
});

test('FUNC-004: 도착 시간은 항상 현재 이후 (오늘 그 시각이 지났으면 내일)', () => {
  const at = (now) => loadScenario(scenario('19:00'), 's1', now).request.arrival_time;
  assert.equal(at(new Date(2026, 9, 4, 12, 0)), new Date(2026, 9, 4, 19, 0).toISOString());
  assert.equal(at(new Date(2026, 9, 4, 19, 0)), new Date(2026, 9, 5, 19, 0).toISOString());
  assert.equal(at(new Date(2026, 11, 31, 23, 0)), new Date(2027, 0, 1, 19, 0).toISOString());
});

test('FUNC-004: 없는 시나리오나 시나리오 데이터가 없으면 null (화면은 버튼을 숨긴다)', () => {
  assert.equal(loadScenario(demo, 'nope'), null);
  assert.equal(loadScenario({ scenarios: [] }, 's1'), null);
  assert.equal(loadScenario(null, 's1'), null);
});

test('FUNC-004: 시연 시나리오 3개를 불러와 추천 결과를 계산하면 기대 1위 역이 나온다', () => {
  const data = { stations: read('stations'), transitGraph: read('transit-graph'), candidates: read('candidates'), places: read('places') };
  assert.equal(demo.scenarios.length, 3);
  for (const s of demo.scenarios) {
    const { request, participants } = loadScenario(demo, s.id);
    const { top } = computeResult(data, request, participants);
    assert.equal(top.station.id, s.expected.station_id, s.name);
    assert.equal(top.is_estimated, false, s.name);
  }
});

// ---------- #73: 예시 닉네임 = 캐릭터 이름(모이자 친구들), 9명까지 캐릭터 구분 ----------

test('#73: 예시 시나리오의 참여자 이름은 순서대로 캐릭터 이름(감이·택이·딜이·길이·톡이…)이라 옆 그림과 짝이 맞는다', () => {
  for (const s of demo.scenarios) {
    assert.deepEqual(s.participants.map((p) => p.nickname), CHARACTER_NAMES.slice(0, s.participants.length), s.name);
  }
});

test('#73: 캐릭터 이름은 1번부터 9번까지 감이·택이·딜이·길이·톡이·냠이·뭉이·콕이·땡이', () => {
  assert.deepEqual(CHARACTER_NAMES, ['감이', '택이', '딜이', '길이', '톡이', '냠이', '뭉이', '콕이', '땡이']);
  assert.equal(CHARACTER_NAMES.length, MAX_PARTICIPANTS);
  for (const name of CHARACTER_NAMES) assert.ok(Array.from(name).length <= NICKNAME_MAX_LENGTH, name);
});

test('#73: 참여자 9명까지 모두 다른 캐릭터 그림, 10번째부터는 기본 친구', () => {
  for (const mood of ['basic', 'happy']) {
    const svgs = Array.from({ length: MAX_PARTICIPANTS }, (_, i) => characterSvg(i, mood));
    assert.equal(new Set(svgs).size, MAX_PARTICIPANTS, mood);
    assert.equal(characterSvg(MAX_PARTICIPANTS, mood), characterSvg(MAX_PARTICIPANTS + 3, mood));
    assert.ok(!svgs.includes(characterSvg(MAX_PARTICIPANTS, mood)), mood);
  }
});

test('#73: 캐릭터 그림은 같은 틀(viewBox 200×215, 크기 비율)을 쓴다', () => {
  for (let i = 0; i <= MAX_PARTICIPANTS; i += 1) {
    const svg = characterSvg(i, 'basic', 40);
    assert.match(svg, /^<svg class="ch" viewBox="0 0 200 215" width="40" height="43" aria-hidden="true">/);
    assert.match(svg, /<\/svg>$/);
  }
});

test("#89: 첫 화면 '예시로 먼저 보기'는 데이터 순서대로 앞 2개(종로3가 회식·강남 회의)만 보여준다 — 데이터 3개는 시연·검사용으로 그대로", () => {
  assert.equal(DEMO_SCENARIO_COUNT, 2);
  assert.ok(demo.scenarios.length >= DEMO_SCENARIO_COUNT);
  assert.deepEqual(demo.scenarios.slice(0, DEMO_SCENARIO_COUNT).map((s) => s.name), ['종로3가 회식', '강남 회의']);
});
