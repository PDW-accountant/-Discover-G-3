import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadScenario } from '../src/js/lib/demo.js';
import { computeResult } from '../src/js/screens/result.js';

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
